jest.mock('axios');
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../models', () => ({ Session: { findOne: jest.fn() }, WorkflowExecution: { create: jest.fn() }, HumanFeedback: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../workflows/bankingChatWorkflow', () => jest.fn());
jest.mock('../poc-slm-data-extractor', () => ({ extractAndValidate: jest.fn() }));

const axios = require('axios');
const runtime = require('../procedureRuntime');
const intentMapper = require('../intentMapper');
const WorkflowService = require('../workflowService');
const { validateSnapshot } = require('../controlPlaneRuntime');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');

const procedure = (overrides = {}) => ({
  id: 'card_replacement_sop', title: 'Replace a lost or stolen card', source: 'SOP-CARD-014', enabled: true, audience: 'internal',
  intents: ['card_replacement'], channels: ['digital', 'ava'],
  steps: [{ id: 'step_1', instruction: 'Confirm the replacement address.' }, { id: 'step_2', instruction: 'Order the replacement card.' }],
  guardrails: [
    { id: 'address', type: 'require_fields', fields: ['replacementAddress'] },
    { id: 'confirm', type: 'require_confirmation' },
    { id: 'stolen', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'stolen', action: 'handoff' },
    { id: 'no_fee', type: 'prohibited_phrases', phrases: ['no fee'], message: 'Fees depend on your account; a specialist can confirm.' },
    { id: 'timing', type: 'required_disclosure', text: 'Replacement cards arrive within 5 to 7 business days.' }
  ],
  ...overrides
});
const customerProcedures = [
  procedure({ id: 'travel_notice', title: 'Set up a travel notice', audience: 'customer', intents: ['help'], enabled: true, channels: ['digital'], guardrails: [],
    steps: [{ id: 'step_1', instruction: 'Tell us your travel dates and destination countries.' }, { id: 'step_2', instruction: 'We note your cards so purchases abroad are not declined.' }] }),
  procedure({ id: 'wire_cutoff', title: 'Wire transfer cut-off times', audience: 'customer', intents: ['general_inquiry'], enabled: true, channels: ['digital', 'ava'], guardrails: [],
    steps: [{ id: 'step_1', instruction: 'Domestic wires submitted before 4 PM Eastern are sent the same business day.' }] }),
  procedure({ id: 'fee_waiver', title: 'Waive a travel card fee', audience: 'internal', intents: ['complaint'], enabled: true, channels: ['digital'], guardrails: [],
    steps: [{ id: 'step_1', instruction: 'Supervisors may waive travel fees for premium customers.' }] })
];

describe('procedure snapshot validation', () => {
  test('accepts a published procedure and rejects unsafe shapes before any conversation uses them', () => {
    const config = { ...defaultConfig(), procedures: [procedure()] };
    expect(() => validateSnapshot({ version: 1, config })).not.toThrow();
    for (const unsafe of [
      procedure({ script: 'x' }),
      procedure({ intents: ['unknown_intent'] }),
      procedure({ guardrails: [{ id: 'g', type: 'escalate_when', field: 'amount', operator: 'gt', value: 1, action: 'handoff' }] }),
      procedure({ guardrails: [{ id: 'g', type: 'escalate_when', field: 'reason', operator: 'regex', value: '.*', action: 'handoff' }] }),
      procedure({ audience: 'everyone' }),
      procedure({ intents: [], audience: 'internal', guardrails: [] }),
      procedure({ intents: [], audience: 'customer', guardrails: [{ id: 'confirm', type: 'require_confirmation' }] })
    ]) expect(() => validateSnapshot({ version: 1, config: { ...defaultConfig(), procedures: [unsafe] } })).toThrow('Unsafe published procedure configuration');
    expect(() => validateSnapshot({ version: 1, config: { ...defaultConfig(), procedures: [procedure(), procedure({ id: 'duplicate' })] } })).toThrow('duplicate');
    const reference = procedure({ id: 'reference', intents: [], audience: 'customer', guardrails: [{ id: 'note', type: 'required_disclosure', text: 'Fees may apply.' }] });
    expect(() => validateSnapshot({ version: 1, config: { ...defaultConfig(), procedures: [procedure(), reference] } })).not.toThrow();
  });
});

describe('guardrail evaluation', () => {
  test.each([
    [{ operator: 'gt', value: 5000 }, '5,000.01', true], [{ operator: 'gt', value: 5000 }, 5000, false],
    [{ operator: 'gte', value: 5000 }, '$5000', true], [{ operator: 'lt', value: 10 }, 'ten', false],
    [{ operator: 'lte', value: 10 }, 10, true], [{ operator: 'eq', value: 'stolen' }, ' Stolen ', true],
    [{ operator: 'neq', value: 'lost' }, 'stolen', true], [{ operator: 'neq', value: 'lost' }, undefined, false],
    [{ operator: 'in', value: ['lost', 'stolen'] }, 'STOLEN', true], [{ operator: 'eq', value: true }, 'true', true],
    [{ operator: 'eq', value: 3 }, '3.0', true], [{ operator: 'eq', value: 'x' }, '', false]
  ])('condition %j against %j is %s', (condition, actual, expected) => {
    expect(runtime.conditionMatches(condition, actual)).toBe(expected);
  });

  test('the first matching escalation decides, with an auditable reference', () => {
    const sop = procedure({ guardrails: [
      { id: 'block_other', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'other', action: 'block', message: 'Please visit a branch.' },
      { id: 'stolen', type: 'escalate_when', field: 'reason', operator: 'eq', value: 'stolen', action: 'handoff' }
    ] });
    expect(runtime.evaluateGate(sop, { reason: 'lost' })).toBeNull();
    expect(runtime.evaluateGate(sop, { reason: 'other' })).toMatchObject({ action: 'block', code: 'procedure_blocked', message: 'Please visit a branch.', audit: { procedureId: 'card_replacement_sop', guardrailId: 'block_other' } });
    expect(runtime.evaluateGate(sop, { reason: 'stolen' })).toMatchObject({ action: 'handoff', code: 'procedure_handoff', audit: { guardrailId: 'stolen', field: 'reason', operator: 'eq' } });
    expect(runtime.evaluateGate(null, { reason: 'stolen' })).toBeNull();
  });

  test('prohibited phrases replace the response and disclosures are appended once', () => {
    const sop = procedure();
    expect(runtime.applyResponseGuardrails(sop, 'Your new card is ordered.')).toEqual({ response: 'Your new card is ordered.\n\nReplacement cards arrive within 5 to 7 business days.', blocked: false,
      applied: [{ procedureId: 'card_replacement_sop', guardrailId: 'timing', type: 'required_disclosure', action: 'appended' }] });
    expect(runtime.applyResponseGuardrails(sop, 'Done. Replacement cards arrive within 5 to 7 business days.').applied).toEqual([]);
    const blocked = runtime.applyResponseGuardrails(sop, 'Good news, there is NO FEE for this.');
    expect(blocked.blocked).toBe(true);
    expect(blocked.response).toBe('Fees depend on your account; a specialist can confirm.\n\nReplacement cards arrive within 5 to 7 business days.');
    expect(runtime.applyResponseGuardrails(null, 'unchanged')).toEqual({ response: 'unchanged', applied: [] });
  });

  test('guidance lists the steps in order and the prohibited phrases', () => {
    const guidance = runtime.buildGuidance(procedure());
    expect(guidance).toContain('"Replace a lost or stolen card" (source: SOP-CARD-014)');
    expect(guidance).toMatch(/1\. Confirm the replacement address\.\n2\. Order the replacement card\./);
    expect(guidance).toContain('Never use these phrases: "no fee".');
    expect(runtime.requiredFields(procedure())).toEqual(['replacementAddress']);
    expect(runtime.requiresConfirmation(procedure())).toBe(true);
  });
});

describe('procedure retrieval', () => {
  test('ranks customer-audience procedures for the channel and cites them', () => {
    const matches = runtime.retrieve(customerProcedures, 'I am traveling abroad next week, do I need to tell you my travel dates?', { channel: 'digital' });
    expect(matches[0]).toMatchObject({ procedureId: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-CARD-014' });
    expect(runtime.citations(matches)).toEqual([{ id: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-CARD-014', type: 'procedure' }]);
    expect(runtime.groundedAnswer(customerProcedures, matches)).toBe('Here is our approved procedure: Set up a travel notice\n1. Tell us your travel dates and destination countries.\n2. We note your cards so purchases abroad are not declined.\nSource: SOP-CARD-014');
  });

  test('never retrieves internal procedures, other channels, disabled procedures or incidental matches', () => {
    expect(runtime.retrieve(customerProcedures, 'can a supervisor waive travel fees for premium customers', { channel: 'digital' }).map(match => match.procedureId)).not.toContain('fee_waiver');
    expect(runtime.retrieve(customerProcedures, 'travel dates destination', { channel: 'ava' })).toEqual([]);
    expect(runtime.retrieve(customerProcedures.map(entry => ({ ...entry, enabled: false })), 'travel dates destination')).toEqual([]);
    expect(runtime.retrieve(customerProcedures, 'what is the weather like for my travel to the mountains and lakes')).toEqual([]);
    expect(runtime.retrieve(customerProcedures, '')).toEqual([]);
  });

  test('retrieval is deterministic', () => {
    const question = 'When are domestic wires sent if submitted before the cut-off?';
    expect(runtime.retrieve(customerProcedures, question)).toEqual(runtime.retrieve(structuredClone(customerProcedures), question));
    expect(runtime.retrieve(customerProcedures, question)[0].procedureId).toBe('wire_cutoff');
  });
});

describe('procedures in the published servicing runtime', () => {
  function service(snapshot) {
    axios.get.mockResolvedValue({ data: snapshot });
    const sessions = new Map();
    const manager = {
      getSession: jest.fn(async id => sessions.get(id)),
      createSession: jest.fn(async (userId, sessionId, intent, metadata) => { const session = { userId, sessionId, intent, metadata, collectedData: {}, conversationHistory: [] }; sessions.set(sessionId, session); return session; }),
      updateSession: jest.fn(async (id, update) => Object.assign(sessions.get(id), update)),
      updateWorkflowState: jest.fn(), addMessage: jest.fn()
    };
    const workflowService = new WorkflowService({}, manager);
    workflowService.integrations.event = jest.fn(async () => ({}));
    return { workflowService, sessions };
  }
  const original = process.env.CONTROL_PLANE_ENABLED;
  beforeEach(() => { process.env.CONTROL_PLANE_ENABLED = 'true'; jest.clearAllMocks(); });
  afterAll(() => { if (original === undefined) delete process.env.CONTROL_PLANE_ENABLED; else process.env.CONTROL_PLANE_ENABLED = original; });

  test('a procedure handoff becomes the confirmed specialist handoff with the procedure reference', async () => {
    const { workflowService, sessions } = service({ version: 4, config: { ...defaultConfig(), procedures: [procedure()] } });
    workflowService.processConfiguredMessage = jest.fn(async () => {
      expect(intentMapper.getProcedure('card_replacement')).toMatchObject({ id: 'card_replacement_sop' });
      return { type: 'policy_blocked', code: 'procedure_handoff', message: 'Our servicing procedure requires a specialist to handle this request.', procedure: { id: 'card_replacement_sop', guardrailId: 'stolen' } };
    });
    const result = await workflowService.processMessage({ sessionId: 'stolen', userId: 'u', question: 'I need a replacement card', authToken: 'token' });
    expect(result).toMatchObject({ type: 'confirmation_required', action: 'human_handoff', details: { handoff: { reason: 'procedure_guardrail' } },
      metadata: { version: 4, procedure: { id: 'card_replacement_sop', guardrailId: 'stolen' } } });
    expect(sessions.get('stolen').status).toBe('waiting_human_input');
  });

  test('a completed turn names the procedure that governed it; other channels are unaffected', async () => {
    const { workflowService } = service({ version: 5, config: { ...defaultConfig(), procedures: [procedure({ channels: ['ava'] })] } });
    workflowService.processConfiguredMessage = jest.fn(async () => ({ type: 'complete', response: 'Ordered.' }));
    expect((await workflowService.processMessage({ sessionId: 'ava', userId: 'u', question: 'I need a replacement card', authToken: 'token', metadata: { channel: 'ava' } })).metadata.procedure)
      .toEqual({ id: 'card_replacement_sop', title: 'Replace a lost or stolen card', source: 'SOP-CARD-014' });
    expect((await workflowService.processMessage({ sessionId: 'digital', userId: 'u', question: 'I need a replacement card', authToken: 'token' })).metadata.procedure).toBeUndefined();
  });

  test('a semantic release warms its procedure index in the background and retrieval uses the pinned settings', async () => {
    const { getEmbeddingIndex } = require('../embeddingIndex');
    const warm = jest.spyOn(getEmbeddingIndex(), 'warm').mockResolvedValue(true);
    const config = { ...defaultConfig(), procedures: [...customerProcedures], retrieval: { strategy: 'hybrid', minSimilarity: 0.4 } };
    config.llm = { ...config.llm, enabled: true, routing: { ...config.llm.routing, embedding: config.llm.profiles[0].id } };
    const { workflowService } = service({ version: 6, config });
    workflowService.processConfiguredMessage = jest.fn(async () => {
      expect(intentMapper.getRetrieval()).toEqual({ strategy: 'hybrid', minSimilarity: 0.4 });
      return { type: 'complete', response: 'ok' };
    });
    await workflowService.processMessage({ sessionId: 'warm', userId: 'u', question: 'what can you do', authToken: 'token' });
    expect(warm).toHaveBeenCalledWith(config.llm, expect.arrayContaining(['Set up a travel notice\n1. Tell us your travel dates and destination countries.']), expect.any(Object));
    expect(warm.mock.calls[0][1].join(' ')).not.toContain('Supervisors');
    warm.mockRestore();
  });

  test('a lexical release never warms an embedding index', async () => {
    const { getEmbeddingIndex } = require('../embeddingIndex');
    const warm = jest.spyOn(getEmbeddingIndex(), 'warm');
    const { workflowService } = service({ version: 7, config: { ...defaultConfig(), procedures: [...customerProcedures] } });
    workflowService.processConfiguredMessage = jest.fn(async () => ({ type: 'complete', response: 'ok' }));
    await workflowService.processMessage({ sessionId: 'lexical', userId: 'u', question: 'what can you do', authToken: 'token' });
    expect(warm).not.toHaveBeenCalled();
    warm.mockRestore();
  });

  test('knowledge search falls back to customer procedures only when approved knowledge has no match', async () => {
    const { workflowService } = service({ version: 1, config: defaultConfig() });
    const state = { intent: 'policy_knowledge', question: 'how do I set up a travel notice with my travel dates', runtimeContext: { channel: 'digital' } };
    const entries = [...defaultConfig().intents, { ...defaultConfig().intents.find(entry => entry.id === 'help'), id: 'policy_knowledge', baseIntent: 'knowledge_search' }];
    workflowService.integrations.knowledge = jest.fn(async () => ({ type: 'complete', response: 'No approved knowledge.', citations: [] }));
    const fallback = await intentMapper.withPublishedIntents(entries, () => workflowService.executeGeneric(state), {}, {}, undefined, { procedures: customerProcedures, channel: 'digital' });
    expect(fallback).toMatchObject({ generationSource: 'approved-procedure', citations: [{ id: 'travel_notice', type: 'procedure' }] });
    expect(fallback.response).toContain('Set up a travel notice');
    workflowService.integrations.knowledge = jest.fn(async () => ({ type: 'complete', response: 'Knowledge answer', citations: [{ id: 'kb-1' }] }));
    expect(await intentMapper.withPublishedIntents(entries, () => workflowService.executeGeneric(state), {}, {}, undefined, { procedures: customerProcedures }))
      .toMatchObject({ response: 'Knowledge answer', citations: [{ id: 'kb-1' }] });
  });
});
