const originalCheckpointEnabled = process.env.CHECKPOINT_ENABLED;
const originalOpenAIEnabled = process.env.OPENAI_ENABLED;

process.env.CHECKPOINT_ENABLED = 'true';
process.env.OPENAI_ENABLED = 'false';

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn()
  }))
}));

jest.mock('../../services/poc-slm-data-extractor', () => ({
  isEnabled: jest.fn(() => false)
}));

const { ChatOpenAI } = require('@langchain/openai');
const BankingChatWorkflow = require('../bankingChatWorkflow');
const orchestratorConfig = require('../../../config');

describe('BankingChatWorkflow graph integration', () => {
  afterAll(() => {
    if (originalCheckpointEnabled === undefined) {
      delete process.env.CHECKPOINT_ENABLED;
    } else {
      process.env.CHECKPOINT_ENABLED = originalCheckpointEnabled;
    }
    if (originalOpenAIEnabled === undefined) {
      delete process.env.OPENAI_ENABLED;
    } else {
      process.env.OPENAI_ENABLED = originalOpenAIEnabled;
    }
  });

  it('uses account listing for a balance inquiry without an account id', () => {
    const workflow = new BankingChatWorkflow({}, {}, {});

    expect(workflow.getToolsForState({
      intent: 'balance_inquiry',
      collectedData: {}
    })).toEqual(['banking_get_accounts']);

    expect(workflow.getToolsForState({
      intent: 'balance_inquiry',
      collectedData: { accountId: 'account-1' }
    })).toEqual(['banking_get_balance']);
  });

  it('normalizes fraud intent fields to the MCP argument contract', () => {
    const workflow = new BankingChatWorkflow({}, {}, {});
    const params = workflow.buildToolParameters('banking_create_fraud_alert', {
      intent: 'report_fraud',
      sessionId: 'session-1',
      userId: 'user-1',
      authToken: 'token-1',
      collectedData: {
        fraudType: 'account_takeover',
        description: 'A sufficiently detailed account takeover report'
      }
    });

    expect(params).toEqual(expect.objectContaining({
      alertType: 'account_takeover',
      authToken: 'token-1'
    }));
  });

  it('derives card fields from the selected MCP operation', () => {
    const workflow = new BankingChatWorkflow({}, {}, {});

    expect(workflow.getRequiredDataForState('card_management', {
      cardAction: 'view'
    })).toEqual(['cardAction']);
    expect(workflow.getRequiredDataForState('card_management', {
      cardAction: 'unblock'
    })).toEqual(['cardAction', 'cardId']);
    expect(workflow.getRequiredDataForState('card_management', {
      cardAction: 'block'
    })).toEqual(['cardAction', 'cardId', 'reason']);
    expect(workflow.getRequiredDataForState('card_management', {
      cardAction: 'replace'
    })).toEqual(['cardAction', 'cardId', 'reason']);
  });

  it('validates the action-specific card reason enum', () => {
    const workflow = new BankingChatWorkflow({}, {}, {});

    expect(workflow.getValidationIssuesForState('card_management', {
      cardAction: 'block',
      reason: 'suspected_fraud'
    })).toEqual([]);
    expect(workflow.getValidationIssuesForState('card_management', {
      cardAction: 'block',
      reason: 'expired'
    })).toEqual([expect.objectContaining({ field: 'reason' })]);
    expect(workflow.getValidationIssuesForState('card_management', {
      cardAction: 'replace',
      reason: 'suspected_fraud'
    })).toEqual([expect.objectContaining({ field: 'reason' })]);
  });

  it('uses exact tool balance data and skips the LLM when OpenAI is enabled', async () => {
    const rawToolResults = {
      banking_get_accounts: {
        data: {
          success: true,
          data: [{
            account_name: 'James Patterson Checking',
            account_number: '9000000000001001',
            balance: '25000.00',
            available_balance: '24750.00',
            currency: 'USD'
          }]
        }
      }
    };
    const sanitizedToolResults = {
      banking_get_accounts: {
        data: {
          success: true,
          data: [{
            account_name: 'James Patterson Checking',
            account_number: '[REDACTED_ACCOUNT]',
            balance: '25000.00',
            available_balance: '24750.00',
            currency: 'USD'
          }]
        }
      }
    };
    const sessionManager = {
      updateWorkflowState: jest.fn().mockResolvedValue(undefined),
      addMessage: jest.fn().mockResolvedValue(undefined)
    };
    const policyEngine = {
      sanitizeStructuredData: jest.fn(() => sanitizedToolResults),
      evaluateResponse: jest.fn(({ response }) => ({
        action: 'allow',
        response,
        audit: { action: 'allow' }
      }))
    };
    const originalEnabled = orchestratorConfig.openai.enabled;
    orchestratorConfig.openai.enabled = true;

    try {
      const workflow = new BankingChatWorkflow({}, sessionManager, policyEngine);
      const result = await workflow.generateResponse({
        sessionId: 'session-1',
        userId: 'user-1',
        intent: 'balance_inquiry',
        question: 'What is my balance?',
        collectedData: {},
        conversationHistory: [],
        toolResults: rawToolResults,
        policyTrace: []
      });

      expect(workflow.llm.invoke).not.toHaveBeenCalled();
      expect(result.finalResponse).toEqual(expect.objectContaining({
        generationSource: 'deterministic-formatter',
        response: 'Here is your account:\n- James Patterson Checking ending in 1001: USD 25000.00; available USD 24750.00'
      }));
      expect(result.toolResults).toEqual(sanitizedToolResults);
      expect(sessionManager.addMessage).toHaveBeenCalledWith(
        'session-1',
        'assistant',
        'Here is your account:\n- James Patterson Checking ending in 1001: USD 25000.00; available USD 24750.00',
        expect.objectContaining({ toolResults: sanitizedToolResults })
      );
    } finally {
      orchestratorConfig.openai.enabled = originalEnabled;
    }
  });

  it('compiles the graph and terminates at human input when transfer data is missing', async () => {
    const mcpClient = {
      executeTool: jest.fn()
    };
    const sessionManager = {
      getSession: jest.fn().mockResolvedValue({
        collectedData: {},
        conversationHistory: []
      }),
      updateSession: jest.fn().mockResolvedValue(undefined),
      updateWorkflowState: jest.fn().mockResolvedValue(undefined)
    };

    const workflow = new BankingChatWorkflow(mcpClient, sessionManager, {});

    expect(workflow.graph).toBeDefined();
    expect(typeof workflow.graph.invoke).toBe('function');

    const result = await workflow.execute({
      sessionId: 'workflow-regression-session',
      userId: 'workflow-regression-user',
      authToken: 'test-token',
      intent: 'transfer_funds',
      question: 'Please transfer some money',
      conversationHistory: [],
      collectedData: {},
      requiredData: [],
      policyTrace: [],
      confirmationGranted: false
    });

    expect(result).toEqual(expect.objectContaining({
      currentStep: 'request_human_input',
      needsHumanInput: true
    }));
    expect(result.error).toBeUndefined();
    expect(result.finalResponse).toEqual(expect.objectContaining({
      type: 'human_input_required',
      requiredFields: expect.arrayContaining(['fromAccountId', 'toAccountId', 'amount'])
    }));
    expect(sessionManager.updateSession).toHaveBeenCalledWith(
      'workflow-regression-session',
      expect.objectContaining({
        status: 'waiting_human_input',
        currentStep: 'request_human_input'
      })
    );
    expect(mcpClient.executeTool).not.toHaveBeenCalled();
    expect(ChatOpenAI.mock.results[0].value.invoke).not.toHaveBeenCalled();
  });

  it('uses published field and confirmation requirements inside the real graph', async () => {
    const intentMapper = require('../../services/intentMapper');
    const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
    const PolicyEngine = require('../../services/policyEngine');
    const entries = defaultConfig().intents;
    const balance = entries.find(entry => entry.id === 'balance_inquiry');
    balance.requiredData = ['caseReference'];
    balance.needsConfirmation = true;
    const mcpClient = { executeTool: jest.fn() };
    const sessionManager = {
      getSession: jest.fn().mockResolvedValue({ collectedData: {}, conversationHistory: [] }),
      updateSession: jest.fn(), updateWorkflowState: jest.fn()
    };
    const workflow = new BankingChatWorkflow(mcpClient, sessionManager, new PolicyEngine());
    const input = { sessionId: 'published-graph-fields', userId: 'u', authToken: 'access', intent: 'balance_inquiry',
      question: 'check balance', conversationHistory: [], collectedData: {}, requiredData: [], policyTrace: [], confirmationGranted: false };
    const missing = await intentMapper.withPublishedIntents(entries, () => workflow.execute(input));
    expect(missing.finalResponse).toMatchObject({ type: 'human_input_required', requiredFields: ['caseReference'] });
    const confirmation = await intentMapper.withPublishedIntents(entries, () => workflow.execute({ ...input,
      sessionId: 'published-graph-confirmation', collectedData: { caseReference: 'CASE-1' } }));
    expect(confirmation.finalResponse).toMatchObject({ type: 'confirmation_required' });
    expect(mcpClient.executeTool).not.toHaveBeenCalled();
  });

  it('rejects a dynamically selected tool removed from the published allowlist', () => {
    const intentMapper = require('../../services/intentMapper');
    const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
    const entries = defaultConfig().intents;
    entries.find(entry => entry.id === 'card_management').tools = ['banking_get_cards'];
    const workflow = new BankingChatWorkflow({}, {}, {});
    intentMapper.withPublishedIntents(entries, () => {
      expect(() => workflow.getToolsForState({ intent: 'card_management', collectedData: { cardAction: 'block' } }))
        .toThrow('disabled by the published servicing configuration');
      expect(workflow.getToolsForState({ intent: 'card_management', collectedData: { cardAction: 'view' } }))
        .toEqual(['banking_get_cards']);
    });
  });

  it('sends the published system and user prompts to optional no-tool generation', async () => {
    const intentMapper = require('../../services/intentMapper');
    const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
    const PolicyEngine = require('../../services/policyEngine');
    const entries = defaultConfig().intents;
    Object.assign(entries.find(entry => entry.id === 'help'), { systemPrompt: 'Use our service voice.', userPromptTemplate: 'Customer asks: {{question}}' });
    const sessionManager = { updateWorkflowState: jest.fn(), addMessage: jest.fn() };
    const workflow = new BankingChatWorkflow({}, sessionManager, new PolicyEngine());
    workflow.llm.invoke.mockResolvedValue({ content: 'Here is some help.' });
    const enabled = orchestratorConfig.openai.enabled;
    orchestratorConfig.openai.enabled = true;
    try {
      await intentMapper.withPublishedIntents(entries, () => workflow.generateResponse({
        sessionId: 'published-prompts', userId: 'u', intent: 'help', question: 'What can you do?',
        collectedData: {}, toolResults: {}, conversationHistory: [], policyTrace: []
      }));
      const messages = workflow.llm.invoke.mock.calls[0][0];
      expect(messages[0].content).toBe('Use our service voice.');
      expect(messages[messages.length - 1].content).toBe('Customer asks: What can you do?');
    } finally { orchestratorConfig.openai.enabled = enabled; }
  });
  it('runs a typed custom service request through validation before its declared fulfillment handler', async () => {
    const intentMapper = require('../../services/intentMapper');
    const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
    const PolicyEngine = require('../../services/policyEngine');
    const entries = defaultConfig().intents;
    entries.push({ id: 'appointment_request', baseIntent: 'service_request', name: 'Appointment', description: 'Book appointment', enabled: true,
      patterns: ['book appointment'], requiredData: ['participants'], optionalData: [], tools: [], needsConfirmation: false,
      systemPrompt: 'Help schedule.', userPromptTemplate: '{{question}}', fieldSchemas: { participants: { type: 'number', min: 1, max: 4 } } });
    const sessionManager = { getSession: jest.fn(async () => ({ collectedData: {}, conversationHistory: [] })), updateSession: jest.fn(), updateWorkflowState: jest.fn(), addMessage: jest.fn() };
    const mcp = { executeTool: jest.fn() };
    const workflow = new BankingChatWorkflow(mcp, sessionManager, new PolicyEngine());
    workflow.genericHandler = jest.fn(async () => ({ type: 'complete', caseId: 'case-1', response: 'Request recorded.', generationSource: 'servicing-case' }));
    const input = { sessionId: 'typed-invalid', userId: 'u', authToken: 'access', intent: 'appointment_request', question: 'book appointment',
      conversationHistory: [], collectedData: { participants: 0 }, requiredData: [], policyTrace: [], confirmationGranted: false };
    const invalid = await intentMapper.withPublishedIntents(entries, () => workflow.execute(input));
    expect(invalid.finalResponse.type).toBe('human_input_required'); expect(workflow.genericHandler).not.toHaveBeenCalled();
    const valid = await intentMapper.withPublishedIntents(entries, () => workflow.execute({ ...input, sessionId: 'typed-valid', collectedData: { participants: 2 } }));
    expect(valid.finalResponse).toMatchObject({ type: 'confirmation_required', details: { confirmation: { schema: 1 } } });
    expect(workflow.genericHandler).not.toHaveBeenCalled();
    const confirmed = await intentMapper.withPublishedIntents(entries, () => workflow.generateResponse({ ...input, collectedData: { participants: 2 }, confirmationGranted: true }));
    expect(confirmed.finalResponse).toMatchObject({ caseId: 'case-1', generationSource: 'servicing-case' });
    expect(workflow.genericHandler).toHaveBeenCalledWith(expect.objectContaining({ authToken: 'access', collectedData: { participants: 2 } }));
    expect(mcp.executeTool).not.toHaveBeenCalled();
  });
  it('retains acknowledged financial results when post-action session observations fail', async () => {
    const PolicyEngine = require('../../services/policyEngine');
    const sessions = { updateWorkflowState: jest.fn(async () => { throw new Error('observation store unavailable'); }),
      addMessage: jest.fn(async () => { throw new Error('history unavailable'); }) };
    const mcp = { executeTool: jest.fn(async () => ({ success: true, operationId: 'durable-op', data: { reference: 'BANK-1' } })) };
    const workflow = new BankingChatWorkflow(mcp, sessions, new PolicyEngine());
    const state = { sessionId: 'acknowledged', userId: 'u', authToken: 'access', intent: 'transfer_funds', question: 'Transfer twenty',
      collectedData: { fromAccountId: 'a', toAccountId: 'b', amount: 20 }, confirmationGranted: true, policyTrace: [] };
    const executed = await workflow.executeTools(state);
    expect(executed).toMatchObject({ telemetryUnavailable: true, toolResults: { banking_create_transfer: { operationId: 'durable-op' } } });
    expect((await workflow.generateResponse(executed)).finalResponse)
      .toMatchObject({ type: 'complete', response: 'Your transfer of USD 20.00 was submitted successfully.', telemetryUnavailable: true });
    expect(mcp.executeTool).toHaveBeenCalledTimes(1);
  });
});

describe('checkpointed workflow credentials and recovery identity', () => {
  test('recovery injects fresh credentials, validates pinned identity, and persists no bearer token', async () => {
    const { CheckpointerManager, graphThreadId } = require('../../utils/checkpointer');
    const manager = new CheckpointerManager({ env: { NODE_ENV: 'test' } });
    const saver = manager.getCheckpointer();
    const originalPut = saver.put.bind(saver);
    let fail = true;
    saver.put = async (...args) => {
      if (fail && args[1].channel_values.currentStep === 'check_required_data') { fail = false; throw new Error('checkpoint store interrupted'); }
      return originalPut(...args);
    };
    const sessionManager = { getSession: jest.fn(async () => ({ collectedData: {}, conversationHistory: [] })), updateSession: jest.fn(), updateWorkflowState: jest.fn() };
    const mcp = { executeTool: jest.fn(async () => ({ success: true, data: { accounts: [] } })) };
    const policy = new (require('../../services/policyEngine'))();
    const input = { sessionId: 'recover-auth', userId: 'customer', tenantId: 'default-enterprise', interactionId: 'original', authToken: 'old-private-bearer',
      runtimeContext: { action: 'automated', version: 7, channel: 'digital' }, intent: 'balance_inquiry', question: 'balance', collectedData: {}, conversationHistory: [], policyTrace: [] };
    const threadId = graphThreadId({ ...input, runId: 'execution-1' });
    const workflow = new BankingChatWorkflow(mcp,sessionManager,policy,{ checkpointerManager: manager });
    expect(await workflow.execute(input,{ threadId })).toMatchObject({ recoveryRequired: true });
    expect(mcp.executeTool).not.toHaveBeenCalled();
    const restarted = new BankingChatWorkflow(mcp,sessionManager,policy,{ checkpointerManager: manager });
    await expect(restarted.recover({ ...input, userId: 'foreign' },threadId)).rejects.toMatchObject({ status: 409 });
    await expect(restarted.recover({ ...input, runtimeContext: { ...input.runtimeContext, version: 8 } },threadId)).rejects.toMatchObject({ status: 409 });
    const result = await restarted.recover({ ...input, authToken: 'refreshed-private-bearer' },threadId);
    expect(result.finalResponse.type).toBe('complete');
    expect(mcp.executeTool).toHaveBeenCalledTimes(1);
    expect(mcp.executeTool).toHaveBeenCalledWith('banking_get_accounts',expect.objectContaining({ authToken: 'refreshed-private-bearer' }),'recover-auth');
    const stored = JSON.stringify(await manager.getCheckpointHistory(threadId,100));
    expect(stored).not.toMatch(/old-private-bearer|refreshed-private-bearer|authToken/);
    expect(result).not.toHaveProperty('authToken');
  });
});
