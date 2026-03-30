const config = require('../../config');
const logger = require('../utils/logger');
const intentMapper = require('./intentMapper');

class PolicyEngine {
  constructor() {
    this.config = config.policy;
    this.promptInjectionPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /reveal\s+(the\s+)?system\s+prompt/i,
      /developer\s+mode/i,
      /bypass\s+(your\s+)?rules/i,
      /jailbreak/i,
      /show\s+hidden\s+instructions/i,
      /tool\s+schema/i
    ];
    this.internalLeakagePatterns = [
      /system\s+prompt/i,
      /developer\s+message/i,
      /internal\s+instruction/i,
      /hidden\s+prompt/i,
      /chain[-\s]?of[-\s]?thought/i,
      /tool\s+arguments/i,
      /policy\s+engine/i
    ];
    this.redactionPatterns = [
      {
        type: 'card_number',
        pattern: /\b(?:\d[ -]?){13,19}\b/g,
        replacement: '[REDACTED_CARD]'
      },
      {
        type: 'account_number',
        pattern: /\b\d{9,18}\b/g,
        replacement: '[REDACTED_ACCOUNT]'
      },
      {
        type: 'ssn',
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        replacement: '[REDACTED_SSN]'
      },
      {
        type: 'bearer_token',
        pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
        replacement: 'Bearer [REDACTED_TOKEN]'
      },
      {
        type: 'jwt',
        pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g,
        replacement: '[REDACTED_JWT]'
      }
    ];

    logger.info('Policy Engine initialized', {
      enabled: this.config.enabled,
      confirmationAmount: this.config.transferConfirmationAmount,
      hardBlockAmount: this.config.transferHardBlockAmount
    });
  }

  isEnabled() {
    return this.config.enabled !== false;
  }

  evaluateIngress({ sessionId, userId, intent, question, metadata = {} }) {
    if (!this.isEnabled()) {
      return this.allow('ingress');
    }

    const normalizedQuestion = typeof question === 'string' ? question.trim() : '';

    if (!normalizedQuestion) {
      return this.block('ingress', 'empty_input', 'Please provide a message so I can continue.');
    }

    if (normalizedQuestion.length > this.config.maxInputLength) {
      return this.block(
        'ingress',
        'input_too_long',
        `Your message is too long for automated processing. Please shorten it to under ${this.config.maxInputLength} characters.`
      );
    }

    if (intentMapper.requiresAuth(intent) && !userId) {
      return this.block(
        'ingress',
        'authentication_required',
        'This action requires an authenticated enterprise user session.'
      );
    }

    const injectionMatches = this.matchPatterns(normalizedQuestion, this.promptInjectionPatterns);
    if (this.config.blockPromptInjection && injectionMatches.length > 0) {
      return this.block(
        'ingress',
        'prompt_injection_detected',
        'I cannot comply with requests to override internal instructions or reveal protected system behavior.',
        {
          flags: injectionMatches,
          metadata: { sessionId, intent, hasMetadata: Object.keys(metadata).length > 0 }
        }
      );
    }

    const flags = [];
    if (intentMapper.isUrgent(intent)) {
      flags.push('urgent_intent');
    }

    return this.allow('ingress', {
      flags,
      metadata: { sessionId, intent }
    });
  }

  evaluateToolExecution({ intent, tools = [], state = {} }) {
    if (!this.isEnabled()) {
      return this.allow('pre_tool');
    }

    const collectedData = state.collectedData || {};
    const amount = this.parseAmount(collectedData.amount);
    const requiresConfirmation = intentMapper.needsConfirmation(intent) || this.hasSensitiveTool(tools);

    if (Number.isFinite(amount) && amount > this.config.transferHardBlockAmount) {
      return this.block(
        'pre_tool',
        'amount_exceeds_policy_limit',
        `This request exceeds the automated policy limit of $${this.config.transferHardBlockAmount}. Please continue with a human agent.`,
        {
          flags: ['amount_limit_exceeded'],
          metadata: { amount, tools }
        }
      );
    }

    if (requiresConfirmation && state.confirmationGranted !== true) {
      const confirmationMessage = intentMapper.getConfirmationMessage(intent, collectedData)
        || this.buildFallbackConfirmationQuestion(intent, collectedData);

      const flags = ['sensitive_action'];
      if (Number.isFinite(amount) && amount >= this.config.transferConfirmationAmount) {
        flags.push('amount_confirmation_threshold');
      }

      return {
        action: 'require_confirmation',
        stage: 'pre_tool',
        code: 'confirmation_required',
        message: confirmationMessage,
        question: `${confirmationMessage}. Please confirm to proceed.`,
        feedbackType: 'confirmation',
        details: {
          ...collectedData,
          tools,
          policyCode: 'confirmation_required'
        },
        audit: {
          action: 'require_confirmation',
          stage: 'pre_tool',
          code: 'confirmation_required',
          flags,
          metadata: { tools, intent, amount }
        }
      };
    }

    return this.allow('pre_tool', {
      metadata: { intent, tools, amount }
    });
  }

  evaluateResponse({ intent, response, toolResults = {} }) {
    if (!this.isEnabled()) {
      return this.allow('response', { response: this.normalizeResponse(response) });
    }

    const normalizedResponse = this.normalizeResponse(response);
    const leakageMatches = this.matchPatterns(normalizedResponse, this.internalLeakagePatterns);
    if (leakageMatches.length > 0) {
      return this.block(
        'response',
        'internal_prompt_leakage',
        'I can help with your request, but I cannot expose internal instructions, policies, or tool internals.',
        {
          flags: leakageMatches,
          metadata: { intent, toolCount: Object.keys(toolResults || {}).length }
        }
      );
    }

    const redacted = this.redactText(normalizedResponse);
    let finalResponse = redacted.text;

    if (finalResponse.length > this.config.maxResponseLength) {
      finalResponse = `${finalResponse.slice(0, this.config.maxResponseLength).trim()}...`;
      redacted.redactions.push('response_truncated');
    }

    return this.allow('response', {
      response: finalResponse,
      flags: redacted.redactions,
      metadata: { intent }
    });
  }

  sanitizeStructuredData(value) {
    if (!this.isEnabled() || this.config.redactSensitiveData === false) {
      return value;
    }

    if (typeof value === 'string') {
      return this.redactText(value).text;
    }

    if (Array.isArray(value)) {
      return value.map(entry => this.sanitizeStructuredData(entry));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).reduce((accumulator, [key, entry]) => {
        accumulator[key] = this.sanitizeStructuredData(entry);
        return accumulator;
      }, {});
    }

    return value;
  }

  allow(stage, extras = {}) {
    return {
      action: 'allow',
      stage,
      code: 'allowed',
      message: null,
      audit: {
        action: 'allow',
        stage,
        code: 'allowed',
        flags: extras.flags || [],
        metadata: extras.metadata || {}
      },
      ...extras
    };
  }

  block(stage, code, message, extras = {}) {
    return {
      action: 'block',
      stage,
      code,
      message,
      audit: {
        action: 'block',
        stage,
        code,
        flags: extras.flags || [],
        metadata: extras.metadata || {}
      }
    };
  }

  buildFallbackConfirmationQuestion(intent, collectedData) {
    if (intent === 'transfer_funds') {
      return `Please confirm you want to transfer $${collectedData.amount} to ${collectedData.recipient}`;
    }

    if (intent === 'card_management') {
      return `Please confirm you want to ${collectedData.cardAction || 'manage'} your card`;
    }

    if (intent === 'verify_transaction') {
      return `Please confirm your decision for transaction ${collectedData.transactionId || 'under review'}`;
    }

    return 'Please confirm that you want to continue with this action';
  }

  hasSensitiveTool(tools) {
    const sensitiveTools = new Set([
      'banking_transfer',
      'banking_block_card',
      'banking_unblock_card',
      'banking_replace_card',
      'banking_create_dispute',
      'banking_update_dispute',
      'banking_withdraw_dispute'
    ]);

    return tools.some(tool => sensitiveTools.has(tool));
  }

  parseAmount(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value !== 'string') {
      return Number.NaN;
    }

    const numeric = Number.parseFloat(value.replace(/[$,]/g, ''));
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }

  normalizeResponse(response) {
    if (typeof response === 'string') {
      return response;
    }

    if (Array.isArray(response)) {
      return response
        .map(item => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object' && typeof item.text === 'string') {
            return item.text;
          }

          return JSON.stringify(item);
        })
        .join(' ')
        .trim();
    }

    if (response && typeof response === 'object') {
      return JSON.stringify(response);
    }

    return '';
  }

  redactText(text) {
    if (typeof text !== 'string' || this.config.redactSensitiveData === false) {
      return { text, redactions: [] };
    }

    let sanitizedText = text;
    const redactions = [];

    for (const rule of this.redactionPatterns) {
      if (rule.pattern.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(rule.pattern, rule.replacement);
        redactions.push(rule.type);
      }
      rule.pattern.lastIndex = 0;
    }

    return {
      text: sanitizedText,
      redactions
    };
  }

  matchPatterns(text, patterns) {
    if (typeof text !== 'string') {
      return [];
    }

    return patterns
      .filter(pattern => pattern.test(text))
      .map(pattern => pattern.source);
  }
}

module.exports = PolicyEngine;