const originalCheckpointEnabled = process.env.CHECKPOINT_ENABLED;
process.env.CHECKPOINT_ENABLED = 'true';

jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: jest.fn() })) }));
jest.mock('../../services/poc-slm-data-extractor', () => ({ isEnabled: jest.fn(() => false) }));

const BankingChatWorkflow = require('../bankingChatWorkflow');
const intentMapper = require('../../services/intentMapper');
const PolicyEngine = require('../../services/policyEngine');
const orchestratorConfig = require('../../../config');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');

afterAll(() => {
  if (originalCheckpointEnabled === undefined) delete process.env.CHECKPOINT_ENABLED;
  else process.env.CHECKPOINT_ENABLED = originalCheckpointEnabled;
});

const cardSop = {
  id: 'card_replacement_sop', title: 'Replace a lost or stolen card', source: 'SOP-CARD-014', enabled: true, audience: 'internal',
  intents: ['card_replacement'], channels: ['digital'],
  steps: [{ id: 'step_1', instruction: 'Confirm the replacement address.' }, { id: 'step_2', instruction: 'Order the replacement card.' }],
  guardrails: [
    { id: 'address', type: 'require_fields', fields: ['replacementAddress'] },
    { id: 'stolen', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'stolen', action: 'handoff' },
    { id: 'timing', type: 'required_disclosure', text: 'Replacement cards arrive within 5 to 7 business days.' }
  ]
};
const balanceSop = {
  id: 'balance_sop', title: 'Balance disclosure', source: 'SOP-ACC-2', enabled: true, intents: ['balance_inquiry'], channels: ['digital'],
  steps: [{ id: 'step_1', instruction: 'Confirm before reading balances aloud.' }], guardrails: [{ id: 'confirm', type: 'require_confirmation' }]
};
const helpSop = {
  id: 'help_sop', title: 'Help conversations', source: 'SOP-HELP-1', enabled: true, intents: ['help'], channels: ['digital'],
  steps: [{ id: 'step_1', instruction: 'Offer the three most common services first.' }],
  guardrails: [{ id: 'no_guarantee', type: 'prohibited_phrases', phrases: ['guaranteed approval'] }]
};
const travelSop = {
  id: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-CARD-20', enabled: true, audience: 'customer', intents: [], channels: ['digital'],
  steps: [{ id: 'step_1', instruction: 'Tell us your travel dates and destination countries.' }, { id: 'step_2', instruction: 'We note your cards so purchases abroad are not declined.' }],
  guardrails: [{ id: 'foreign_fees', type: 'required_disclosure', text: 'Foreign transaction fees may apply.' }]
};

function harness() {
  const mcpClient = { executeTool: jest.fn(async () => ({ success: true, data: { success: true } })) };
  const sessionManager = {
    getSession: jest.fn().mockResolvedValue({ collectedData: {}, conversationHistory: [] }),
    updateSession: jest.fn(), updateWorkflowState: jest.fn(), addMessage: jest.fn()
  };
  const workflow = new BankingChatWorkflow(mcpClient, sessionManager, new PolicyEngine());
  const published = (procedures, callback) => intentMapper.withPublishedIntents(defaultConfig().intents, callback, {}, {}, undefined, { procedures, channel: 'digital' });
  const input = (overrides) => ({ sessionId: `procedure-${Math.random()}`, userId: 'u', authToken: 'access', conversationHistory: [], requiredData: [], policyTrace: [], confirmationGranted: false, runtimeContext: { channel: 'digital' }, ...overrides });
  return { workflow, mcpClient, sessionManager, published, input };
}

describe('procedure guardrails in the servicing graph', () => {
  test('a procedure-required field is collected before the tool runs', async () => {
    const { workflow, mcpClient, published, input } = harness();
    const result = await published([cardSop], () => workflow.execute(input({ intent: 'card_replacement', question: 'I need a replacement card', collectedData: { cardId: 'card-1', reason: 'lost' } })));
    expect(result.finalResponse).toMatchObject({ type: 'human_input_required', requiredFields: ['replacementAddress'] });
    expect(mcpClient.executeTool).not.toHaveBeenCalled();
    // Without the procedure the intent's own contract does not ask for it.
    const unguided = await published([], () => workflow.execute(input({ intent: 'card_replacement', question: 'I need a replacement card', collectedData: { cardId: 'card-1', reason: 'lost' } })));
    expect(unguided.finalResponse.type).toBe('confirmation_required');
  });

  test('an escalation condition stops before any tool and is auditable', async () => {
    const { workflow, mcpClient, published, input } = harness();
    const result = await published([cardSop], () => workflow.execute(input({ intent: 'card_replacement', question: 'replace my stolen card',
      collectedData: { cardId: 'card-1', reason: 'stolen', replacementAddress: '1 Main St' }, confirmationGranted: true })));
    expect(result.finalResponse).toMatchObject({ type: 'policy_blocked', code: 'procedure_handoff', procedure: { id: 'card_replacement_sop', guardrailId: 'stolen' } });
    expect(result.policyTrace.at(-1)).toMatchObject({ action: 'block', code: 'procedure_handoff', flags: ['procedure_guardrail'], metadata: { procedureId: 'card_replacement_sop', guardrailId: 'stolen', field: 'reason' } });
    expect(mcpClient.executeTool).not.toHaveBeenCalled();
  });

  test('a procedure can require confirmation for a read-only action', async () => {
    const { workflow, mcpClient, published, input } = harness();
    const pending = await published([balanceSop], () => workflow.execute(input({ intent: 'balance_inquiry', question: 'check balance', collectedData: {} })));
    expect(pending.finalResponse.type).toBe('confirmation_required');
    expect(mcpClient.executeTool).not.toHaveBeenCalled();
    const confirmed = await published([balanceSop], () => workflow.executeTools(input({ intent: 'balance_inquiry', question: 'check balance', collectedData: {}, confirmationGranted: true })));
    expect(confirmed.toolResults).toHaveProperty('banking_get_accounts');
    expect(mcpClient.executeTool).toHaveBeenCalledTimes(1);
  });

  test('required disclosures are appended to deterministic tool-backed answers and cite the procedure', async () => {
    const { workflow, sessionManager, published, input } = harness();
    const result = await published([cardSop], () => workflow.generateResponse(input({ intent: 'card_replacement', question: 'replace card',
      collectedData: { cardId: 'card-1', reason: 'lost', replacementAddress: '1 Main St' }, toolResults: { banking_replace_card: { success: true, data: { success: true, data: { card_id: 'card-2' } } } } })));
    expect(result.finalResponse.response).toMatch(/\n\nReplacement cards arrive within 5 to 7 business days\.$/);
    expect(result.finalResponse).toMatchObject({ procedure: { id: 'card_replacement_sop', source: 'SOP-CARD-014' }, procedureGuardrails: [{ guardrailId: 'timing', action: 'appended' }] });
    expect(sessionManager.addMessage).toHaveBeenCalledWith(expect.any(String), 'assistant', result.finalResponse.response, expect.any(Object));
  });

  test('the bound procedure instructs the model and prohibited phrases are replaced', async () => {
    const { workflow, published, input } = harness();
    workflow.llm.invoke.mockResolvedValue({ content: 'You have guaranteed approval for every product!' });
    const enabled = orchestratorConfig.openai.enabled;
    orchestratorConfig.openai.enabled = true;
    try {
      const result = await published([helpSop], () => workflow.generateResponse(input({ intent: 'help', question: 'What can you do?', collectedData: {}, toolResults: {} })));
      const [system] = workflow.llm.invoke.mock.calls[0][0];
      expect(system.content).toContain('Approved servicing procedure: "Help conversations" (source: SOP-HELP-1).');
      expect(system.content).toContain('1. Offer the three most common services first.');
      expect(result.finalResponse.response).not.toMatch(/guaranteed approval/i);
      expect(result.finalResponse.procedureGuardrails).toEqual([expect.objectContaining({ guardrailId: 'no_guarantee', action: 'replaced' })]);
    } finally { orchestratorConfig.openai.enabled = enabled; }
  });

  test('general questions are grounded in retrieved customer procedures, with or without a model', async () => {
    const { workflow, published, input } = harness();
    const state = input({ intent: 'general_inquiry', question: 'I am traveling abroad, do I need to give you my travel dates?', collectedData: {}, toolResults: {} });
    const deterministic = await published([travelSop, cardSop], () => workflow.generateResponse(state));
    expect(deterministic.finalResponse).toMatchObject({ generationSource: 'approved-procedure', citations: [{ id: 'travel_notice', type: 'procedure' }] });
    expect(deterministic.finalResponse.response).toContain('1. Tell us your travel dates and destination countries.');
    // An answer grounded in a procedure carries that procedure's disclosures.
    expect(deterministic.finalResponse.response).toMatch(/\n\nForeign transaction fees may apply\.$/);
    expect(deterministic.finalResponse.procedureGuardrails).toEqual([expect.objectContaining({ procedureId: 'travel_notice', guardrailId: 'foreign_fees' })]);
    expect(deterministic.finalResponse.retrieval[0]).not.toHaveProperty('text');

    workflow.llm.invoke.mockResolvedValue({ content: 'Yes. Share your travel dates and destinations so purchases abroad are not declined.' });
    const enabled = orchestratorConfig.openai.enabled;
    orchestratorConfig.openai.enabled = true;
    try {
      const generated = await published([travelSop], () => workflow.generateResponse(state));
      expect(workflow.llm.invoke.mock.calls[0][0][0].content).toContain('[1] Set up a travel notice (source: SOP-CARD-20)');
      expect(generated.finalResponse).toMatchObject({ generationSource: 'openai', citations: [{ id: 'travel_notice' }] });
    } finally { orchestratorConfig.openai.enabled = enabled; }
  });

  test('an internal procedure is never used to answer customers', async () => {
    const { workflow, published, input } = harness();
    const internal = { ...travelSop, audience: 'internal', intents: ['help'] };
    const result = await published([internal], () => workflow.generateResponse(input({ intent: 'general_inquiry', question: 'I am traveling abroad, do I need to give you my travel dates?', collectedData: {}, toolResults: {} })));
    expect(result.finalResponse.generationSource).toBe('deterministic-formatter');
    expect(result.finalResponse.citations).toBeUndefined();
    expect(result.finalResponse.response).not.toContain('destination countries');
  });
});
