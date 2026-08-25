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
});
