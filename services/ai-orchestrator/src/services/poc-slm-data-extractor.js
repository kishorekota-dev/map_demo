const { ChatOpenAI } = require('@langchain/openai');
const { SystemMessage, HumanMessage } = require('@langchain/core/messages');
const logger = require('../utils/logger');
const config = require('../../config');
const intentMapper = require('./intentMapper');

/**
 * poc-slm-data-extractor
 * Structured Language Model helper that extracts and validates
 * intent-specific fields from user prompts + conversation history.
 */
class PocSlmDataExtractor {
  constructor() {
    const slmConfig = config.slm || {};
    const openaiConfig = config.openai || {};
    const baseUrl = slmConfig.baseUrl;
    const apiKey = slmConfig.apiKey || openaiConfig.apiKey;
    const modelName = slmConfig.model || openaiConfig.model;
    // Structured extraction MUST be deterministic: forcing temperature to 0
    // (never inheriting a non-zero default) keeps the set of extracted fields
    // — and therefore whether the user is re-prompted — stable for identical
    // input. JSON mode defaults on so the model returns parseable output.
    const temperature = Number.isFinite(slmConfig.temperature) ? slmConfig.temperature : 0;
    const topP = Number.isFinite(slmConfig.topP) ? slmConfig.topP : 0;
    const seed = Number.isFinite(slmConfig.seed) ? slmConfig.seed : 42;
    const maxTokens = Math.min(slmConfig.maxTokens || openaiConfig.maxTokens || 2000, 4000);

    this.responseFormat = slmConfig.jsonMode !== false ? { type: 'json_object' } : null;
    // Trust the explicit enablement decision made by config. Re-deriving this
    // from the presence of an inherited API key would bypass the opt-in gate.
    this.enabled = slmConfig.enabled === true;

    if (this.enabled) {
      const clientOptions = {
        apiKey: apiKey || 'not-required',
        model: modelName,
        temperature,
        topP,
        maxTokens,
        modelKwargs: Number.isFinite(seed) ? { seed } : {}
      };

      if (baseUrl) {
        clientOptions.configuration = { baseURL: baseUrl };
        clientOptions.useResponsesApi = false;
      }

      this.llm = new ChatOpenAI(clientOptions);
      logger.info('poc-slm-data-extractor enabled', {
        model: modelName,
        baseUrl: baseUrl || 'openai-default',
        jsonMode: !!slmConfig.jsonMode
      });
    } else {
      this.llm = null;
      logger.warn('poc-slm-data-extractor disabled (not explicitly enabled or missing endpoint/key)');
    }
  }

  isEnabled() {
    const governed = intentMapper.getLlmConfig();
    return governed === undefined ? this.enabled : governed.enabled === true;
  }

  buildSchema(intent) {
    const configForIntent = intentMapper.getIntentConfig(intent) || {};
    const { dataRequirements = {}, behavior = {}, metadata = {} } = configForIntent;

    return {
      intent,
      description: metadata.description || intent,
      required: dataRequirements.required || [],
      optional: dataRequirements.optional || [],
      validation: dataRequirements.validation || {},
      additionalValidation: intentMapper.getPublishedIntent(intent)?.fieldSchemas || {},
      defaults: dataRequirements.defaults || {},
      allowDefaults: behavior.canUseDefaults !== false,
      allowsPartialData: behavior.allowsPartialData !== false
    };
  }

  buildPrompt({ intent, schema, conversationHistory = [], latestInput = '', existingData = {} }) {
    const recentHistory = (conversationHistory || []).slice(-6);
    const historyLines = recentHistory.map((msg) => `${msg.role || 'user'}: ${msg.content}`).join('\n');
    const validationRules = Object.entries(schema.validation).map(([field, rule]) => {
      const ruleParts = [];
      if (rule.type) ruleParts.push(`type=${rule.type}`);
      if (rule.min !== undefined) ruleParts.push(`min=${rule.min}`);
      if (rule.max !== undefined) ruleParts.push(`max=${rule.max}`);
      if (rule.minLength) ruleParts.push(`minLength=${rule.minLength}`);
      if (rule.maxLength) ruleParts.push(`maxLength=${rule.maxLength}`);
      if (rule.pattern) ruleParts.push(`pattern=${rule.pattern}`);
      if (rule.values) ruleParts.push(`allowed=${rule.values.join('|')}`);
      return `${field}: ${ruleParts.join(', ')}`;
    }).join('\n');

    const instructions = intentMapper.getPublishedPrompt('extractionInstructions')
      || 'You are a structured data extractor for a banking assistant. Read the latest user input and conversation context to extract only explicitly provided values. Do not guess missing values.';
    // Product wording is editable; the schema/JSON contract below remains an
    // enforced code boundary, followed by deterministic data validation.
    return `${instructions}\n` +
      `Goal: read the latest user input and conversation context and return ONLY JSON for intent "${intent}".` +
      `\n- Do not guess values. If a value is not explicitly present, leave it missing.` +
      `\n- Required fields: ${schema.required.length ? schema.required.join(', ') : 'none'}.` +
      `\n- Optional fields: ${schema.optional.length ? schema.optional.join(', ') : 'none'}.` +
      `\n- Existing collected data: ${JSON.stringify(existingData || {})}.` +
      `\n- Validation rules (if any):\n${validationRules || 'none'}` +
      `\n- Additional field constraints: ${JSON.stringify(schema.additionalValidation || {})}` +
      `\n- Defaults allowed: ${schema.allowDefaults}. Defaults: ${JSON.stringify(schema.defaults)}.` +
      `\nConversation history:\n${historyLines || 'none provided'}` +
      `\nLatest user input:\n${latestInput}` +
      `\n\nReturn JSON ONLY in this shape:\n` +
      `{"collectedData": {"<field>": "<value>"}, "missingFields": ["field"], "notes": []}` +
      `\nUse field names exactly as provided.`;
  }

  safeJsonParse(text) {
    if (!text) return {};
    try {
      const cleaned = text.trim().replace(/^```json/gi, '').replace(/```$/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        }
      } catch (innerErr) {
        logger.warn('SLM JSON parse failed', { error: innerErr.message });
      }
    }
    return {};
  }

  applyDefaults(intent, data) {
    const defaults = intentMapper.getDefaults(intent) || {};
    const merged = { ...data };
    Object.entries(defaults).forEach(([field, value]) => {
      if (merged[field] === undefined || merged[field] === null) {
        merged[field] = value;
      }
    });
    return merged;
  }

  async extractAndValidate({ intent, conversationHistory = [], latestInput = '', existingData = {} }) {
    if (!intentMapper.isValidIntent(intent)) {
      throw new Error(`Invalid intent: ${intent}`);
    }

    const schema = this.buildSchema(intent);
    let extractedData = { ...existingData };
    let modelOutput = null;

    const governed = intentMapper.getLlmConfig();
    if (this.isEnabled() && (governed !== undefined || this.llm)) {
      const prompt = this.buildPrompt({ intent, schema, conversationHistory, latestInput, existingData });
      const messages = [
        new SystemMessage(`${intentMapper.getPublishedPrompt('extractionSystem') || 'Extract structured data for the specified intent. Respond with JSON only.'}\nReturn only JSON matching the supplied field schema. Do not execute actions or invent missing values.`),
        new HumanMessage(prompt)
      ];

      try {
        const response = governed !== undefined
          ? await intentMapper.generateForTask('extraction', intent, { messages: messages.map((message, index) => ({ role: index ? 'user' : 'system', content: message.content })), format: 'json' })
          : await this.llm.invoke(messages, this.responseFormat ? { response_format: this.responseFormat } : {});
        if (governed === undefined) await intentMapper.recordProviderUsage(response, 'slm', 'extraction');
        modelOutput = governed === undefined ? response.content : response.text;
        const parsed = governed === undefined ? this.safeJsonParse(response.content) : response.json;
        const parsedData = parsed.collectedData || parsed.data || parsed;
        if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
          const fields = new Set([...schema.required, ...schema.optional]);
          const declared = Object.fromEntries(Object.entries(parsedData).filter(([field, value]) => fields.has(field)
            && !/auth|password|secret|token|userId|tenantId/i.test(field)
            && (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
          extractedData = { ...extractedData, ...declared };
        }
      } catch (error) {
        if (governed !== undefined) throw error;
        logger.error('SLM extraction failed, using existing data', { intent, error: error.message });
      }
    }

    extractedData = this.applyDefaults(intent, extractedData);
    const validationResult = intentMapper.validateData(intent, extractedData);
    const missingFields = validationResult.missing || [];
    const invalidFields = validationResult.invalid || [];

    return {
      intent,
      extractedData,
      missingFields,
      invalidFields,
      validationResult,
      modelOutput,
      slmEnabled: this.isEnabled()
    };
  }
}

module.exports = new PocSlmDataExtractor();
module.exports.PocSlmDataExtractor = PocSlmDataExtractor;
