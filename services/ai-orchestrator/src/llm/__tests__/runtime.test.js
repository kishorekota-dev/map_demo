jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: jest.fn() })) }));
const mapper = require('../../services/intentMapper');
const registry = require('../registry');
const { LlmError } = require('../errors');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
const { ControlPlaneRuntime } = require('../../services/controlPlaneRuntime');
const { PocSlmDataExtractor } = require('../../services/poc-slm-data-extractor');
const BankingChatWorkflow = require('../../workflows/bankingChatWorkflow');
const PolicyEngine = require('../../services/policyEngine');
const legacy = require('../../../config');
const profile = (model = 'qwen-test') => ({ id: 'local', name: 'Synthetic Qwen', providerId: 'mac-qwen', model, temperature: 0, maxOutputTokens: 100, timeoutMs: 5000 });
const llm = model => ({ enabled: true, profiles: [profile(model)], routing: { generation: 'local', extraction: 'local', recognition: 'local' } });
const scope = (config, callback, recordUsage) => mapper.withPublishedIntents(config.intents, callback, config.prompts, { recordUsage }, config.llm);
describe('published provider profiles in actual runtime paths', () => {
  let generate;
  beforeEach(() => {
    generate = jest.fn(async (_provider, input) => ({ text: 'Synthetic model answer.', json: { collectedData: {} }, usage: { inputTokens: 10, outputTokens: 5 },
      callId: `call-${input.model}`, providerId: 'mac-qwen', model: input.model }));
    jest.spyOn(registry, 'getRegistry').mockReturnValue({ generate });
  });
  afterEach(() => jest.restoreAllMocks());
  test('concurrent pinned profiles remain isolated and no-tool generation consumes their prompts and usage', async () => {
    const a = defaultConfig(); a.llm = llm('qwen-release-a');
    const b = structuredClone(a); b.llm.profiles[0].model = 'qwen-release-b';
    a.intents.find(entry => entry.id === 'help').systemPrompt = 'Published A voice';
    b.intents.find(entry => entry.id === 'help').systemPrompt = 'Published B voice';
    const workflow = new BankingChatWorkflow({}, { updateWorkflowState: jest.fn(), addMessage: jest.fn() }, new PolicyEngine());
    const state = { sessionId: 'session', userId: 'u', intent: 'help', question: 'How can you assist?', toolResults: {}, collectedData: {}, conversationHistory: [], policyTrace: [] };
    const aUsage = jest.fn(); const bUsage = jest.fn();
    const results = await Promise.all([scope(a, () => workflow.generateResponse(state), aUsage), scope(b, () => workflow.generateResponse(state), bUsage)]);
    expect(results.map(result => result.finalResponse.generationSource)).toEqual(['llm:mac-qwen:qwen-release-a', 'llm:mac-qwen:qwen-release-b']);
    expect(generate.mock.calls.map(call => [call[1].model, call[1].messages[0].content])).toEqual([['qwen-release-a', 'Published A voice'], ['qwen-release-b', 'Published B voice']]);
    expect(aUsage).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'call-qwen-release-a:input_tokens', provider: 'mac-qwen', service: 'generation', units: 10 }));
    expect(bUsage).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'call-qwen-release-b:output_tokens', units: 5 }));
    expect(workflow.llm.invoke).not.toHaveBeenCalled();
  });
  test('explicit disabled prevents legacy and plugin calls, while absent model config preserves legacy behavior', async () => {
    const config = defaultConfig();
    const workflow = new BankingChatWorkflow({}, { updateWorkflowState: jest.fn(), addMessage: jest.fn() }, new PolicyEngine());
    workflow.llm.invoke.mockResolvedValue({ content: 'Legacy synthetic response.' });
    const prior = legacy.openai.enabled; legacy.openai.enabled = true;
    const state = { sessionId: 's', userId: 'u', intent: 'help', question: 'help', toolResults: {}, collectedData: {}, conversationHistory: [] };
    try {
      await scope(config, () => workflow.generateResponse(state));
      expect(generate).not.toHaveBeenCalled(); expect(workflow.llm.invoke).not.toHaveBeenCalled();
      delete config.llm;
      expect((await scope(config, () => workflow.generateResponse(state))).finalResponse).toMatchObject({ generationSource: 'openai' });
      expect(workflow.llm.invoke).toHaveBeenCalledTimes(1);
    } finally { legacy.openai.enabled = prior; }
  });
  test('configured provider failure cannot fall back to legacy cloud generation', async () => {
    const config = defaultConfig(); config.llm = llm();
    generate.mockRejectedValue(new LlmError('LLM_TIMEOUT', 'Configured provider timed out.'));
    const workflow = new BankingChatWorkflow({}, { updateWorkflowState: jest.fn(), addMessage: jest.fn() }, new PolicyEngine());
    const result = await scope(config, () => workflow.generateResponse({ sessionId: 's', userId: 'u', intent: 'help', question: 'help', toolResults: {}, collectedData: {}, conversationHistory: [] }));
    expect(result.finalResponse).toMatchObject({ type: 'policy_blocked', code: 'model_unavailable', modelErrorCode: 'LLM_TIMEOUT' });
    expect(workflow.llm.invoke).not.toHaveBeenCalled();
  });
  test('governed extraction uses published prompts and only declared scalar fields; disabled never invokes the legacy extractor', async () => {
    const config = defaultConfig(); config.llm = llm(); config.prompts.extractionSystem = 'Published extraction voice';
    const extractor = new PocSlmDataExtractor(); extractor.enabled = true; extractor.llm = { invoke: jest.fn() };
    generate.mockResolvedValue({ text: '{"collectedData":{"amount":22,"authToken":"forged","unknown":"drop"}}',
      json: { collectedData: { amount: 22, authToken: 'forged', unknown: 'drop' } }, usage: {}, providerId: 'mac-qwen', model: 'qwen-test', callId: 'extract' });
    const result = await scope(config, () => extractor.extractAndValidate({ intent: 'transfer_funds', latestInput: 'twenty two', existingData: { fromAccountId: 'a', toAccountId: 'b' } }));
    expect(result.extractedData).toMatchObject({ amount: 22, fromAccountId: 'a', toAccountId: 'b' });
    expect(result.extractedData).not.toHaveProperty('authToken'); expect(result.extractedData).not.toHaveProperty('unknown');
    expect(generate.mock.calls[0][1]).toMatchObject({ format: 'json', messages: [expect.objectContaining({ content: expect.stringContaining('Published extraction voice') }), expect.any(Object)] });
    expect(extractor.llm.invoke).not.toHaveBeenCalled();
    config.llm.enabled = false;
    expect((await scope(config, () => extractor.extractAndValidate({ intent: 'transfer_funds', latestInput: '22' }))).slmEnabled).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1); expect(extractor.llm.invoke).not.toHaveBeenCalled();
  });
  test('an extractor outage terminates the actual graph before any banking tool can run', async () => {
    const config = defaultConfig(); config.llm = llm();
    generate.mockRejectedValue(new LlmError('LLM_PROVIDER_UNAVAILABLE', 'Unavailable'));
    const sessions = { getSession: jest.fn(async () => ({ collectedData: {}, conversationHistory: [] })), updateSession: jest.fn(), updateWorkflowState: jest.fn(), addMessage: jest.fn() };
    const mcp = { executeTool: jest.fn() };
    const workflow = new BankingChatWorkflow(mcp, sessions, new PolicyEngine());
    const result = await scope(config, () => workflow.execute({ sessionId: 'extractor-failure', userId: 'u', authToken: 'access', intent: 'transfer_funds',
      question: 'move money', collectedData: {}, requiredData: [], conversationHistory: [], policyTrace: [] }));
    expect(result.finalResponse).toMatchObject({ type: 'policy_blocked', code: 'model_unavailable' });
    expect(mcp.executeTool).not.toHaveBeenCalled();
  });
  test('LLM recognition constrains candidates to published IDs and never silently falls back on provider failure', async () => {
    const config = defaultConfig(); config.llm = llm(); config.recognition.strategy = 'llm';
    generate.mockResolvedValue({ text: '{"candidates":[{"intent":"balance_inquiry","confidence":0.94}]}',
      json: { candidates: [{ intent: 'unknown_action', confidence: 1 }, { intent: 'balance_inquiry', confidence: .94 }] }, usage: {}, providerId: 'mac-qwen', model: 'qwen-test', callId: 'recognize' });
    expect(await new ControlPlaneRuntime().recognize(config, 'Please interpret this synthetic phrase')).toMatchObject({ intent: 'balance_inquiry', source: 'llm', confidence: .94 });
    expect(generate.mock.calls[0][1].messages[0].content).toContain('Do not execute tools');
    generate.mockRejectedValue(new LlmError('LLM_TIMEOUT', 'Unavailable'));
    await expect(new ControlPlaneRuntime().recognize(config, 'Please interpret this synthetic phrase')).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
    expect(await new ControlPlaneRuntime().recognize(config, 'check balance')).toMatchObject({ source: 'literal', intent: 'balance_inquiry' });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  test('workflow continuation keeps its published model profile until a new request selects the next release', async () => {
    const WorkflowService = require('../../services/workflowService');
    const prior = process.env.CONTROL_PLANE_ENABLED; process.env.CONTROL_PLANE_ENABLED = 'true';
    const sessions = new Map();
    const manager = { getSession: jest.fn(async id => sessions.get(id)),
      createSession: jest.fn(async (userId, sessionId, intent, metadata) => { const value = { userId, sessionId, intent, metadata }; sessions.set(sessionId, value); return value; }),
      updateSession: jest.fn(async (id, update) => Object.assign(sessions.get(id), update)) };
    const service = new WorkflowService({}, manager);
    service.integrations.event = jest.fn(async () => ({})); service.integrations.usage = jest.fn(async () => ({}));
    const a = { version: 1, config: defaultConfig() }; a.config.llm = llm('pinned-qwen');
    const b = structuredClone(a); b.version = 2; b.config.llm.profiles[0].model = 'next-qwen';
    service.controlPlane.getPublishedConfig = jest.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const invoke = async () => ({ type: 'complete', response: (await mapper.generateForTask('generation', 'help', { messages: [{ role: 'user', content: 'Synthetic continuation' }] })).model });
    service.processConfiguredMessage = jest.fn(invoke); service.processConfiguredFeedback = jest.fn(invoke);
    const input = { sessionId: 'pinned-model', userId: 'u', question: 'help', authToken: 'access' };
    try {
      expect(await service.processMessage(input)).toMatchObject({ response: 'pinned-qwen', metadata: { version: 1 } });
      expect(await service.processHumanFeedback({ sessionId: 'pinned-model', response: 'yes', confirmed: true, authToken: 'access' }))
        .toMatchObject({ response: 'pinned-qwen', metadata: { version: 1 } });
      expect(service.controlPlane.getPublishedConfig).toHaveBeenCalledTimes(1);
      expect(await service.processMessage(input)).toMatchObject({ response: 'next-qwen', metadata: { version: 2 } });
    } finally { if (prior === undefined) delete process.env.CONTROL_PLANE_ENABLED; else process.env.CONTROL_PLANE_ENABLED = prior; }
  });
});
