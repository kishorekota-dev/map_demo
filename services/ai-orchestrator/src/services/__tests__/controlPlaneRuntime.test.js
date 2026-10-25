jest.mock('axios');
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../models', () => ({ Session: { findOne: jest.fn() }, WorkflowExecution: { create: jest.fn() }, HumanFeedback: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../workflows/bankingChatWorkflow', () => jest.fn());
jest.mock('../poc-slm-data-extractor', () => ({ extractAndValidate: jest.fn() }));

const axios = require('axios');
const { randomBytes } = require('crypto');
const { confirmationContext } = require('../actionConfirmation');
const intentMapper = require('../intentMapper');
const WorkflowService = require('../workflowService');
const { ControlPlaneRuntime, classifyPublishedIntent, validateSnapshot, resolvePublishedRoute } = require('../controlPlaneRuntime');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
const { HumanFeedback } = require('../../models');
const PolicyEngine = require('../policyEngine');
const slmExtractor = require('../poc-slm-data-extractor');

function makeService() {
  const sessions = new Map();
  const manager = {
    getSession: jest.fn(async id => sessions.get(id)),
    createSession: jest.fn(async (userId, sessionId, intent, metadata) => {
      const session = { userId, sessionId, intent, metadata, collectedData: {}, conversationHistory: [] };
      sessions.set(sessionId, session);
      return session;
    }),
    updateSession: jest.fn(async (id, update) => Object.assign(sessions.get(id), update)),
    updateWorkflowState: jest.fn(),
    addMessage: jest.fn(async (id, role, content) => sessions.get(id).conversationHistory.push({ role, content }))
  };
  const service = new WorkflowService({}, manager);
  service.integrations.createCase = jest.fn(async () => ({ id: 'case-test', status: 'open' }));
  service.processConfiguredMessage = jest.fn(async input => ({ type: 'complete', response: intentMapper.buildSystemMessage(input.intent) }));
  service.processConfiguredFeedback = jest.fn(async () => ({ type: 'complete', response: intentMapper.buildSystemMessage('balance_inquiry') }));
  return { service, sessions, manager };
}

describe('published control-plane runtime', () => {
  const originalEnabled = process.env.CONTROL_PLANE_ENABLED;
  const originalToken = process.env.SERVICING_SERVICE_TOKEN;
  beforeEach(() => { process.env.CONTROL_PLANE_ENABLED = 'true'; process.env.SERVICING_SERVICE_TOKEN = randomBytes(32).toString('hex'); jest.clearAllMocks(); });
  afterAll(() => {
    if (originalToken === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = originalToken;
    if (originalEnabled === undefined) delete process.env.CONTROL_PLANE_ENABLED;
    else process.env.CONTROL_PLANE_ENABLED = originalEnabled;
  });

  test('reads only the authenticated published endpoint; outage fails closed', async () => {
    const snapshot = { version: 1, config: defaultConfig() };
    axios.get.mockResolvedValueOnce({ data: snapshot });
    await expect(new ControlPlaneRuntime().getPublishedConfig('access-token')).resolves.toEqual(snapshot);
    expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/runtime\/config$/), expect.objectContaining({
      headers: { Authorization: 'Bearer access-token' }, timeout: 5000, maxRedirects: 0
    }));
    axios.get.mockRejectedValueOnce(new Error('unavailable'));
    const { service } = makeService();
    const result = await service.processMessage({ sessionId: 's', userId: 'u', intent: 'balance_inquiry', question: 'check balance', authToken: 'token' });
    expect(result).toMatchObject({ type: 'policy_blocked', code: 'configuration_unavailable' });
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
  });

  test('literal phrases override legacy NLU; removing phrases removes their classification', () => {
    const config = defaultConfig();
    const balance = config.intents.find(intent => intent.id === 'balance_inquiry');
    balance.patterns = ['account.*', 'my special phrase'];
    expect(classifyPublishedIntent('account123', 'balance_inquiry', config)).toBe('general_inquiry');
    expect(classifyPublishedIntent('MY  SPECIAL phrase', 'help', config)).toBe('balance_inquiry');
    balance.enabled = false;
    expect(resolvePublishedRoute({ version: 1, config }, 'digital', classifyPublishedIntent('my special phrase', 'help', config)))
      .toMatchObject({ action: 'disabled', reason: 'intent_disabled' });
  });

  test('pins published release for feedback and data collection; subsequent work uses latest release', async () => {
    const first = { version: 1, config: defaultConfig() };
    first.config.intents.find(intent => intent.id === 'balance_inquiry').systemPrompt = 'Published A';
    const second = structuredClone(first);
    second.version = 2;
    second.config.intents.find(intent => intent.id === 'balance_inquiry').systemPrompt = 'Published B';
    axios.get.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });
    const { service, sessions } = makeService();
    const input = { sessionId: 's', userId: 'u', intent: 'help', question: 'check balance', authToken: 'token', metadata: { channel: 'AVA' } };
    expect(await service.processMessage(input)).toMatchObject({ response: 'Published A', intent: 'balance_inquiry', metadata: { version: 1, channel: 'ava' } });
    expect(sessions.get('s').metadata.controlPlane.version).toBe(1);
    expect(await service.processHumanFeedback({ sessionId: 's', response: 'yes', confirmed: true, authToken: 'token' }))
      .toMatchObject({ response: 'Published A', metadata: { version: 1 } });
    expect(await service.processMessageInSession({ ...input, resumePublished: true }))
      .toMatchObject({ response: 'Published A', metadata: { version: 1 } });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(await service.processMessage(input)).toMatchObject({ response: 'Published B', metadata: { version: 2 } });
  });

  test('disabled channel and human journey never invoke automated workflow', async () => {
    const snapshot = { version: 1, config: defaultConfig() };
    axios.get.mockResolvedValue({ data: snapshot });
    const { service, manager, sessions } = makeService();
    expect(await service.processMessage({ sessionId: 'ivr', userId: 'u', question: 'check balance', authToken: 'token', metadata: { channel: 'ivr' } }))
      .toMatchObject({ type: 'policy_blocked', code: 'channel_disabled' });
    snapshot.config.journeys.find(entry => entry.id === 'accounts').fulfillment = 'human';
    await manager.createSession('u', 'human', 'help', { channel: 'digital', tenantId: 'default-enterprise' });
    expect(await service.processMessage({ sessionId: 'human', userId: 'u', question: 'check balance', authToken: 'token' }))
      .toMatchObject({ type: 'confirmation_required', metadata: { queue: 'general_servicing', version: 1 } });
    expect(service.integrations.createCase).not.toHaveBeenCalled();
    expect(sessions.get('human').intent).toBe('balance_inquiry');
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
  });

  test('human case creation requires the exact pending confirmation and a channel change renews it', async () => {
    const { service, manager, sessions } = makeService();
    const route = { version: 7, channel: 'digital', intent: 'help', action: 'human', queue: 'general_servicing' };
    await manager.createSession('u', 'confirmed-handoff', 'help', { tenantId: 'default-enterprise', channel: 'digital', interactionId: 'original', runtimeContext: route });
    const pending = await service.routeToHuman({ sessionId: 'confirmed-handoff', userId: 'u', metadata: {} }, route, 'journey_requires_human');
    expect(pending.type).toBe('confirmation_required'); expect(service.integrations.createCase).not.toHaveBeenCalled();
    const feedback = { context: pending.details };
    sessions.get('confirmed-handoff').metadata.channel = 'ivr'; sessions.get('confirmed-handoff').metadata.runtimeContext = { ...route, channel: 'ivr' };
    expect(await service.processConfirmation('confirmed-handoff', true, feedback, 'access')).toMatchObject({ type: 'confirmation_required' });
    expect(service.integrations.createCase).not.toHaveBeenCalled();
    const renewed = HumanFeedback.create.mock.calls.at(-1)[0];
    expect(await service.processConfirmation('confirmed-handoff', true, { context: renewed.context }, 'access')).toMatchObject({ type: 'human_escalation', caseId: 'case-test' });
    expect(service.integrations.createCase).toHaveBeenCalledTimes(1); expect(service.integrations.createCase).toHaveBeenCalledWith(expect.objectContaining({ confirmationGranted: true, channel: 'ivr' }), 'journey_requires_human');
  });
  test('old source channel cannot dispatch after a coordinated migration', async () => {
    const { service, manager } = makeService();
    await manager.createSession('u', 'moved-channel', 'help', { channel: 'ava', tenantId: 'default-enterprise' });
    await expect(service.processMessage({ sessionId: 'moved-channel', userId: 'u', expectedChannel: 'ivr', question: 'help' })).rejects.toMatchObject({ status: 409, code: 'CHANNEL_CHANGED' });
    await expect(service.processHumanFeedback({ sessionId: 'moved-channel', expectedChannel: 'ivr' })).rejects.toMatchObject({ status: 409, code: 'CHANNEL_CHANGED' });
    expect(service.processConfiguredMessage).not.toHaveBeenCalled(); expect(service.processConfiguredFeedback).not.toHaveBeenCalled();
  });
  test('separate concurrent workflows retain their own prompts and data requirements', async () => {
    const a = defaultConfig().intents;
    const b = structuredClone(a);
    a.find(entry => entry.id === 'help').systemPrompt = 'Tenant A';
    b.find(entry => entry.id === 'help').systemPrompt = 'Tenant B';
    a.find(entry => entry.id === 'help').requiredData = ['caseReference'];
    const [first, second] = await Promise.all([
      intentMapper.withPublishedIntents(a, async () => { await new Promise(resolve => setTimeout(resolve, 5)); return [intentMapper.buildSystemMessage('help'), intentMapper.validateData('help', {}).missing]; }),
      intentMapper.withPublishedIntents(b, async () => { await Promise.resolve(); return [intentMapper.buildSystemMessage('help'), intentMapper.validateData('help', {}).missing]; })
    ]);
    expect(first).toEqual(['Tenant A', ['caseReference']]);
    expect(second).toEqual(['Tenant B', []]);
    expect(intentMapper.buildSystemMessage('help')).not.toBe('Tenant A');
  });

  test('confirmation and required-field floors cannot be removed; new confirmation and prompts take effect', () => {
    const snapshot = { version: 1, config: defaultConfig() };
    const transfer = snapshot.config.intents.find(entry => entry.id === 'transfer_funds');
    transfer.needsConfirmation = false;
    expect(() => validateSnapshot(snapshot)).toThrow('Unsafe published intent');
    transfer.needsConfirmation = true;
    transfer.requiredData = [];
    expect(() => validateSnapshot(snapshot)).toThrow('Unsafe published intent');
    const entries = defaultConfig().intents;
    const balance = entries.find(entry => entry.id === 'balance_inquiry');
    balance.needsConfirmation = true;
    balance.userPromptTemplate = '{{question}} / {{userId}} / {{context}}';
    intentMapper.withPublishedIntents(entries, () => {
      expect(intentMapper.needsConfirmation('balance_inquiry')).toBe(true);
      expect(new PolicyEngine().evaluateToolExecution({ intent: 'balance_inquiry', tools: ['banking_get_accounts'], state: {} }).action)
        .toBe('require_confirmation');
      expect(intentMapper.buildUserMessage('balance_inquiry', { question: 'hello', userId: 'u' }))
        .toBe('hello / u / {"question":"hello","userId":"u"}');
    });
  });

  test('confirmation revalidates the pinned requirements and cannot execute an unapproved tool from feedback', async () => {
    const { service, manager, sessions } = makeService();
    const snapshot = { version: 1, config: defaultConfig() };
    const balance = snapshot.config.intents.find(entry => entry.id === 'balance_inquiry');
    balance.needsConfirmation = true;
    balance.requiredData = ['caseReference'];
    await manager.createSession('u', 's', 'balance_inquiry', { channel: 'digital', controlPlane: snapshot });
    sessions.get('s').collectedData = {};
    delete service.processConfiguredFeedback;
    service.workflow = { getToolsForState: jest.fn(() => intentMapper.getToolsForIntent('balance_inquiry')), buildToolParameters: jest.fn() };
    service.mcpClient = { executeToolWithRetry: jest.fn() };
    const feedback = { feedbackType: 'confirmation', context: { tools: ['banking_create_transfer'] }, update: jest.fn(), executionId: 'e' };
    HumanFeedback.findOne.mockResolvedValue(feedback);
    const result = await service.processHumanFeedback({ sessionId: 's', response: 'yes', confirmed: true, authToken: 'token' });
    expect(result).toMatchObject({ type: 'human_input_required', requiredFields: ['caseReference'], metadata: { version: 1 } });
    expect(service.mcpClient.executeToolWithRetry).not.toHaveBeenCalled();
    expect(HumanFeedback.create).toHaveBeenCalledWith(expect.objectContaining({ feedbackType: 'data_collection', requiredFields: ['caseReference'], status: 'pending' }));
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('global extraction prompt changes retain the required JSON and schema contract', () => {
    const extractor = jest.requireActual('../poc-slm-data-extractor');
    const config = defaultConfig();
    const prompts = { extractionSystem: 'Custom extraction system', extractionInstructions: 'Custom extraction instructions' };
    intentMapper.withPublishedIntents(config.intents, () => {
      expect(intentMapper.getPublishedPrompt('extractionSystem')).toBe('Custom extraction system');
      const prompt = extractor.buildPrompt({ intent: 'help', schema: extractor.buildSchema('help'), latestInput: 'hello' });
      expect(prompt).toContain('Custom extraction instructions');
      expect(prompt).toContain('Return JSON ONLY');
      expect(prompt).toContain('Do not guess values');
      expect(prompt).toContain('Use field names exactly as provided');
    }, prompts);
    expect(intentMapper.getPublishedPrompt('extractionSystem')).toBeNull();
  });

  test('a new process request cannot replace a release while confirmation is pending', async () => {
    const { service, manager, sessions } = makeService();
    await manager.createSession('u', 's', 'transfer_funds', { channel: 'digital', controlPlane: { version: 1, config: defaultConfig() } });
    sessions.get('s').status = 'waiting_human_input';
    const result = await service.processMessage({ sessionId: 's', userId: 'u', intent: 'help', question: 'help', authToken: 'token' });
    expect(result).toMatchObject({ type: 'policy_blocked', code: 'pending_workflow', metadata: { version: 1, intent: 'transfer_funds' } });
    expect(axios.get).not.toHaveBeenCalled();
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
    expect(sessions.get('s').metadata.controlPlane.version).toBe(1);
  });
  test('session ownership is rechecked after acquiring distributed coordination', async () => {
    const { service, manager } = makeService();
    await manager.createSession('other-customer', 'raced-id', 'help', { tenantId: 'default-enterprise' });
    await expect(service.processMessage({ sessionId: 'raced-id', userId: 'u', question: 'help', authToken: 'token' }))
      .rejects.toMatchObject({ status: 403 });
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('new required fields collect correctly without SLM and revalidate the merged reply', async () => {
    const { service, manager, sessions } = makeService();
    const config = defaultConfig();
    config.intents.find(entry => entry.id === 'help').requiredData = ['caseReference'];
    await manager.createSession('u', 's', 'help', { channel: 'digital', controlPlane: { version: 1, config } });
    slmExtractor.extractAndValidate.mockResolvedValue({ slmEnabled: false, extractedData: {}, missingFields: ['caseReference'],
      validationResult: { valid: false, missing: ['caseReference'], invalid: [] } });
    service.processMessageInSession = jest.fn(async () => ({ type: 'complete' }));
    await intentMapper.withPublishedIntents(config.intents, () => service.processDataCollection('s', 'caseReference: CASE-7', { requiredFields: ['caseReference'] }, 'token'));
    expect(sessions.get('s').collectedData).toEqual({ caseReference: 'CASE-7' });
    expect(service.processMessageInSession).toHaveBeenCalledWith(expect.objectContaining({ resumePublished: true, intent: 'help' }));
    expect(service.parseDataFromResponse('one ambiguous reply', ['caseReference', 'region'])).toEqual({});
    expect(service.parseDataFromResponse('caseReference: CASE-7\nregion: central', ['caseReference', 'region']))
      .toEqual({ caseReference: 'CASE-7', region: 'central' });
    expect(service.parseDataFromResponse({ caseReference: 'CASE-7', authToken: 'forged' }, ['caseReference']))
      .toEqual({ caseReference: 'CASE-7' });
  });
  test('ledger replay never executes or meters a second financial action', async () => {
    const adapter = { executeTool: jest.fn(async () => ({ success: true, reference: 'BANK-1' })) };
    const service = new WorkflowService(adapter, {});
    service.integrations.event = jest.fn(async () => ({ id: 'event-1' }));
    service.integrations.usage = jest.fn(async () => ({ id: 'usage-1' }));
    const parameters = { userId: 'u', interactionId: 'one-request', tenantId: 'tenant', authToken: 'access', amount: 20,
      runtimeContext: { version: 7, channel: 'ava', intent: 'transfer_funds', confirmationRequired: true, confirmationVerified: true } };
    const first = await service.mcpClient.executeTool('banking_create_transfer', parameters, 'session');
    expect(await service.mcpClient.executeTool('banking_create_transfer', parameters, 'session')).toEqual(first);
    expect(adapter.executeTool).toHaveBeenCalledTimes(1);
    expect(service.integrations.usage).toHaveBeenCalledTimes(1);
    expect(service.integrations.usage).toHaveBeenCalledWith(expect.objectContaining({ interactionId: 'one-request', version: 7, units: 1, metric: 'calls', provider: 'mcp' }), 'access');
  });
  test('an ancillary evidence persistence failure preserves a completed financial outcome', async () => {
    const { service, manager } = makeService();
    manager.getSession.mockRejectedValueOnce(new Error('session read unavailable'));
    service.integrations.event = jest.fn(async () => ({ telemetryUnavailable: true }));
    expect(await service.withEvidence({ sessionId: 's', authToken: 'token' }, async () => ({ type: 'complete', response: 'Transfer completed.', operationId: 'op-1' })))
      .toMatchObject({ type: 'complete', response: 'Transfer completed.', operationId: 'op-1', telemetryUnavailable: true });
  });
  test('failed terminal persistence retains the original confirmation key and never repeats the financial action', async () => {
    const { manager, sessions } = makeService();
    const adapter = { executeTool: jest.fn(async () => ({ success: true, data: { reference: 'BANK-acknowledged' } })) };
    const service = new WorkflowService(adapter, manager);
    const ActualWorkflow = jest.requireActual('../../workflows/bankingChatWorkflow');
    service.workflow = new ActualWorkflow(service.mcpClient, manager, new PolicyEngine());
    const snapshot = { version: 7, config: defaultConfig() };
    await manager.createSession('u', 'terminal-failure', 'transfer_funds', { tenantId: 'default-enterprise', channel: 'digital', interactionId: 'original-action',
      controlPlane: snapshot, runtimeContext: { version: 7, channel: 'digital', intent: 'transfer_funds' } });
    Object.assign(sessions.get('terminal-failure'), { status: 'waiting_human_input', currentStep: 'request_confirmation',
      collectedData: { fromAccountId: 'a', toAccountId: 'b', amount: 20 }, conversationHistory: [{ role: 'user', content: 'Transfer twenty dollars' }] });
    manager.updateWorkflowState.mockImplementation(async (_id, step) => { if (step !== 'policy_pre_tool') throw new Error('observation store unavailable'); });
    manager.updateSession.mockRejectedValue(new Error('terminal session write unavailable'));
    service.integrations.event = jest.fn(async () => ({ telemetryUnavailable: true }));
    service.integrations.usage = jest.fn(async () => ({ telemetryUnavailable: true }));
    const session = sessions.get('terminal-failure');
    const boundState = { ...session, tenantId: session.metadata.tenantId, channel: session.metadata.channel, interactionId: session.metadata.interactionId, runtimeContext: session.metadata.runtimeContext };
    const feedback = { context: { confirmation: confirmationContext(boundState, ['banking_create_transfer']) } };
    const confirm = () => intentMapper.withPublishedIntents(snapshot.config.intents,
      () => service.processConfirmation('terminal-failure', true, feedback, 'access'), snapshot.config.prompts);
    expect(await confirm()).toMatchObject({ type: 'complete', response: 'Your transfer of USD 20.00 was submitted successfully.', telemetryUnavailable: true });
    expect(await confirm()).toMatchObject({ type: 'complete', telemetryUnavailable: true });
    expect(adapter.executeTool).toHaveBeenCalledTimes(1);
    expect(service.integrations.usage).toHaveBeenCalledTimes(1);
    expect(sessions.get('terminal-failure').metadata.interactionId).toBe('original-action');
    expect(await service.processMessage({ sessionId: 'terminal-failure', userId: 'u', question: 'Transfer again', authToken: 'access',
      metadata: { interactionId: 'new-message-id' } })).toMatchObject({ code: 'pending_workflow', metadata: { version: 7 } });
    expect(adapter.executeTool).toHaveBeenCalledTimes(1);
  });
  test('a configured extraction outage restores pending feedback without executing tools or replacing its release', async () => {
    const { service, manager, sessions } = makeService();
    const snapshot = { version: 7, config: defaultConfig() };
    await manager.createSession('u', 'model-outage', 'transfer_funds', { channel: 'digital', controlPlane: snapshot, interactionId: 'original-action' });
    sessions.get('model-outage').status = 'waiting_human_input';
    const feedback = { requiredFields: ['amount'], update: jest.fn(async () => {}) };
    slmExtractor.extractAndValidate.mockRejectedValue(new (require('../../llm/errors').LlmError)('LLM_TIMEOUT', 'Configured model unavailable'));
    service.processMessageInSession = jest.fn();
    expect(await service.processDataCollection('model-outage', '22', feedback, 'access')).toMatchObject({ code: 'model_unavailable', modelErrorCode: 'LLM_TIMEOUT' });
    expect(feedback.update).toHaveBeenCalledWith({ status: 'pending', response: null, respondedAt: null });
    expect(service.processMessageInSession).not.toHaveBeenCalled();
    expect(sessions.get('model-outage')).toMatchObject({ status: 'waiting_human_input', metadata: { controlPlane: { version: 7 }, interactionId: 'original-action' } });
  });
});

describe('interrupted graph service recovery', () => {
  const { graphThreadId } = require('../../utils/checkpointer');
  const { WorkflowExecution } = require('../../models');
  test('pending graph blocks new messages and feedback without replacing its release', async () => {
    const { service, manager, sessions } = makeService();
    await manager.createSession('u','interrupted','balance_inquiry',{ tenantId: 'default-enterprise', graphRun: { status: 'running' }, controlPlane: { version: 7, config: defaultConfig() } });
    expect(await service.processMessage({ sessionId: 'interrupted', userId: 'u', question: 'help', authToken: 'token' })).toMatchObject({ code: 'workflow_recovery_required' });
    expect(await service.processHumanFeedback({ sessionId: 'interrupted', response: 'yes', authToken: 'token' })).toMatchObject({ code: 'workflow_recovery_required' });
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
    expect(service.processConfiguredFeedback).not.toHaveBeenCalled();
    expect(sessions.get('interrupted').metadata.controlPlane.version).toBe(7);
  });
  test('recovery rechecks owner under lock and restores the original prompt and interaction', async () => {
    const { service, manager, sessions } = makeService();
    const snapshot = { version: 7, config: defaultConfig() };
    snapshot.config.intents.find(intent => intent.id === 'balance_inquiry').systemPrompt = 'Original pinned prompt';
    const tenantId = 'default-enterprise', sessionId = 'service-recover';
    const route = resolvePublishedRoute(snapshot,'digital','balance_inquiry');
    const initialInput = { sessionId, userId: 'u', tenantId, interactionId: 'original', intent: 'balance_inquiry', runtimeContext: route, question: 'check balance' };
    const run = { id: 'execution-7', status: 'running', interactionId: 'original', threadId: graphThreadId({ tenantId, userId: 'u', sessionId, runId: 'execution-7' }), initialInput };
    await manager.createSession('u',sessionId,'balance_inquiry',{ tenantId, interactionId: 'original', channel: 'digital', controlPlane: snapshot, graphRun: run });
    service.workflow.recover = jest.fn(async () => ({ finalResponse: { type: 'complete', response: intentMapper.buildSystemMessage('balance_inquiry') }, currentStep: 'generate_response' }));
    WorkflowExecution.findOne = jest.fn(async () => ({ update: jest.fn() }));
    await expect(service.recoverMessage({ sessionId, userId: 'intruder', tenantId, authToken: 'foreign' })).rejects.toMatchObject({ status: 403 });
    const result = await service.recoverMessage({ sessionId, userId: 'u', tenantId, authToken: 'fresh' });
    expect(result).toMatchObject({ type: 'complete', response: 'Original pinned prompt' });
    expect(service.workflow.recover).toHaveBeenCalledWith(expect.objectContaining({ interactionId: 'original', authToken: 'fresh', runtimeContext: expect.objectContaining({ version: 7 }) }),run.threadId);
    expect(sessions.get(sessionId).metadata.graphRun).toMatchObject({ status: 'completed' });
    expect(sessions.get(sessionId).metadata.graphRun).not.toHaveProperty('initialInput');
  });
});

 test('lost terminal execution save preserves recovery state; completed response replay never invokes tools', async () => {
    const { WorkflowExecution } = require('../../models');
    const { graphThreadId } = require('../../utils/checkpointer');
    const { service, manager, sessions } = makeService();
    const tenantId = 'default-enterprise', sessionId = 'terminal-save';
    const run = { id: 'e', interactionId: 'i', status: 'running', initialInput: {}, threadId: graphThreadId({ tenantId, userId: 'u', sessionId, runId: 'e' }) };
    await manager.createSession('u',sessionId,'balance_inquiry',{ tenantId, interactionId: 'i', graphRun: run });
    const result = { finalResponse: { type: 'complete', response: 'Recorded result' }, currentStep: 'generate_response' };
    expect(await service.finalizeWorkflowResult(sessionId,'e',result,{ update: jest.fn(async () => { throw new Error('storage unavailable'); }) })).toMatchObject({ type: 'complete', telemetryUnavailable: true });
    expect(sessions.get(sessionId).metadata.graphRun.status).toBe('running');
    sessions.get(sessionId).metadata.graphRun.status = 'completed';
    WorkflowExecution.findOne = jest.fn(async () => ({ output: result.finalResponse, currentNode: 'generate_response' }));
    service.workflow.recover = jest.fn();
    expect(await service.recoverMessage({ sessionId, userId: 'u', tenantId, authToken: 'fresh' })).toMatchObject({ response: 'Recorded result', recovered: true });
    expect(service.workflow.recover).not.toHaveBeenCalled();
  });

 test('completed graph replay cannot resurrect a confirmation after its feedback has advanced', async () => {
    const { WorkflowExecution, HumanFeedback } = require('../../models');
    const { graphThreadId } = require('../../utils/checkpointer');
    const { service, manager } = makeService();
    const tenantId = 'default-enterprise', sessionId = 'advanced-feedback';
    await manager.createSession('u',sessionId,'transfer_funds',{ tenantId, interactionId: 'i', graphRun: { id: 'e', status: 'completed', interactionId: 'i', threadId: graphThreadId({ tenantId, userId: 'u', sessionId, runId: 'e' }) } });
    WorkflowExecution.findOne = jest.fn(async () => ({ output: { type: 'confirmation_required', question: 'Confirm?' } }));
    HumanFeedback.findOne.mockResolvedValue(null);
    await expect(service.recoverMessage({ sessionId, userId: 'u', tenantId, authToken: 'fresh' })).rejects.toMatchObject({ status: 409 });
    HumanFeedback.findOne.mockResolvedValue({ expiresAt: new Date(Date.now()+60000) });
    expect(await service.recoverMessage({ sessionId, userId: 'u', tenantId, authToken: 'fresh' })).toMatchObject({ needsHumanInput: true, question: 'Confirm?' });
  });

 test('recovery distinguishes an absent original session from an inaccessible session without starting work', async () => {
    const { service, manager } = makeService();
    service.workflow.recover = jest.fn();
    const input = { sessionId: 'never-dispatched', userId: 'u', tenantId: 'default-enterprise', authToken: 'fresh' };
    await expect(service.recoverMessage(input)).rejects.toMatchObject({ status: 404, code: 'WORKFLOW_SESSION_NOT_FOUND' });
    await manager.createSession('other',input.sessionId,'help',{ tenantId: input.tenantId });
    await expect(service.recoverMessage(input)).rejects.toMatchObject({ status: 403 });
    expect(service.workflow.recover).not.toHaveBeenCalled();
    expect(service.processConfiguredMessage).not.toHaveBeenCalled();
  });

 test('recovery lookup distinguishes expired owned records from true absence without reviving the session', async () => {
    const { Session } = require('../../models');
    const SessionManager = require('../sessionManager');
    const manager = Object.create(SessionManager.prototype);
    manager.expireSession = jest.fn();
    const expired = { sessionId: 'expired', userId: 'owner', expiresAt: new Date(Date.now()-10000) };
    Session.findOne.mockResolvedValue(expired);
    expect(await manager.getSession('expired',{ includeExpired: true })).toBe(expired);
    expect(manager.expireSession).not.toHaveBeenCalled();
    expect(await manager.getSession('expired')).toBeNull();
    expect(manager.expireSession).toHaveBeenCalledWith('expired');
    Session.findOne.mockResolvedValue(null);
    expect(await manager.getSession('absent',{ includeExpired: true })).toBeNull();
  });
