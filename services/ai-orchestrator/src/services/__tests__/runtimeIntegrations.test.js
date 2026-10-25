jest.mock('axios');
const axios = require('axios');
const RuntimeIntegrations = require('../runtimeIntegrations');
const mapper = require('../intentMapper');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
const { ControlPlaneRuntime, validateSnapshot } = require('../controlPlaneRuntime');

describe('provider-neutral runtime contracts', () => {
  beforeEach(() => { jest.clearAllMocks(); axios.post.mockReset(); });
  test('custom aliases inherit authorization and tool/data floors', () => {
    const config = defaultConfig();
    const transfer = structuredClone(config.intents.find(entry => entry.id === 'transfer_funds'));
    transfer.id = 'family_transfer'; transfer.baseIntent = 'transfer_funds'; transfer.name = 'Family transfer';
    config.intents.push(transfer);
    expect(validateSnapshot({ version: 1, config })).toBeTruthy();
    mapper.withPublishedIntents(config.intents, () => {
      expect(mapper.requiresAuth('family_transfer')).toBe(true);
      expect(mapper.needsConfirmation('family_transfer')).toBe(true);
      expect(mapper.getToolsForIntent('family_transfer')).toEqual(['banking_create_transfer']);
      expect(mapper.validateData('family_transfer', {}).missing).toContain('amount');
    });
    transfer.needsConfirmation = false;
    expect(() => validateSnapshot({ version: 1, config })).toThrow('Unsafe published intent');
  });
  test('generic case contract passes only declared safe fields and a stable idempotency key', async () => {
    const config = defaultConfig();
    config.intents.push({ id: 'address_request', baseIntent: 'service_request', name: 'Address', description: 'Change address', enabled: true,
      patterns: ['change address'], requiredData: ['postalCode'], optionalData: [], tools: [], needsConfirmation: false, systemPrompt: 'Help', userPromptTemplate: '{{question}}' });
    axios.post.mockResolvedValue({ data: { id: 'case-7', status: 'pending' } });
    const client = new RuntimeIntegrations();
    await mapper.withPublishedIntents(config.intents, () => client.createCase({ sessionId: 's', interactionId: 'i', intent: 'address_request',
      authToken: 'customer-token', collectedData: { postalCode: '60601', authToken: 'secret', undeclared: 'drop' }, runtimeContext: { version: 7, channel: 'ava', journeyId: 'support' } }));
    expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/\/runtime\/cases$/), expect.objectContaining({ details: { postalCode: '60601' }, version: 7,
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) }), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer customer-token' }) }));
  });
  test('knowledge returns approved evidence and source citations without generated claims', async () => {
    axios.post.mockResolvedValue({ data: { matches: [{ id: 'doc-1', title: 'Hours', content: 'The office opens at nine.', source: 'https://enterprise.example/hours', version: 3 }] } });
    const result = await new RuntimeIntegrations().knowledge({ question: 'Opening hours', authToken: 'jwt', intent: 'hours' });
    expect(result).toMatchObject({ generationSource: 'approved-knowledge', citations: [{ id: 'doc-1', version: 3, source: 'https://enterprise.example/hours', title: 'Hours' }] });
    expect(result.response).toContain('The office opens at nine.');
    axios.post.mockResolvedValue({ data: { matches: [] } });
    expect((await new RuntimeIntegrations().knowledge({ question: 'Unknown', authToken: 'jwt' })).response).toContain('could not find approved knowledge');
  });
  test('external recognition uses an isolated provider credential and degrades explicitly', async () => {
    const prior = process.env.RECOGNITION_PROVIDER_URL; const priorToken = process.env.RECOGNITION_PROVIDER_TOKEN;
    process.env.RECOGNITION_PROVIDER_URL = 'http://provider.test/recognize'; process.env.RECOGNITION_PROVIDER_TOKEN = 'provider-only';
    const config = defaultConfig(); config.recognition = { strategy: 'external', confidenceThreshold: .65, ambiguityMargin: .12 };
    try {
      axios.post.mockResolvedValueOnce({ data: { candidates: [{ intent: 'help', confidence: .95 }] } });
      expect(await new ControlPlaneRuntime().recognize(config, 'zeta request explanation')).toMatchObject({ intent: 'help', source: 'external' });
      expect(axios.post.mock.calls[0][2].headers.Authorization).toBe('Bearer provider-only');
      axios.post.mockRejectedValueOnce(new Error('offline'));
      expect(await new ControlPlaneRuntime().recognize(config, 'cash left checking')).toMatchObject({ intent: 'balance_inquiry', source: 'lexical_fallback', providerUnavailable: true });
    } finally {
      if (prior === undefined) delete process.env.RECOGNITION_PROVIDER_URL; else process.env.RECOGNITION_PROVIDER_URL = prior;
      if (priorToken === undefined) delete process.env.RECOGNITION_PROVIDER_TOKEN; else process.env.RECOGNITION_PROVIDER_TOKEN = priorToken;
    }
  });
  test('evidence scrub excludes tokens, prompts and customer content', async () => {
    const prior = process.env.SERVICING_SERVICE_TOKEN; process.env.SERVICING_SERVICE_TOKEN = 'service-only';
    try {
      axios.post.mockResolvedValue({ data: { id: 'evidence-1' } });
      expect(await new RuntimeIntegrations().event({ sessionId: 's', interactionId: 'i', stage: 'tool', outcome: 'succeeded', metadata: { authToken: 'secret', question: 'customer PII' } }, 'customer')).toEqual({ id: 'evidence-1' });
      expect(axios.post.mock.calls[0][1]).toEqual({ sessionId: 's', interactionId: 'i', stage: 'tool', outcome: 'succeeded' });
      axios.post.mockRejectedValue(new Error('offline'));
      expect(await new RuntimeIntegrations().event({ sessionId: 's' }, 'customer')).toEqual({ telemetryUnavailable: true });
    } finally { if (prior === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = prior; }
  });
  test('actual provider usage is isolated by request and missing usage is not estimated', async () => {
    const first = jest.fn(); const second = jest.fn(); const entries = defaultConfig().intents;
    await Promise.all([
      mapper.withPublishedIntents(entries, async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        await mapper.recordProviderUsage({ content: 'private text', usage_metadata: { input_tokens: 31, output_tokens: 7 } }, 'openai', 'generation', 'first-call');
        await mapper.recordProviderUsage({ content: 'no provider usage metadata' }, 'openai', 'generation');
      }, {}, { recordUsage: first }),
      mapper.withPublishedIntents(entries, async () => mapper.recordProviderUsage({ usage: { input_tokens: 10, output_tokens: NaN } }, 'recognition', 'intent_recognition', 'second-call'), {}, { recordUsage: second })
    ]);
    expect(first.mock.calls.map(call => call[0])).toEqual([
      { eventId: 'first-call:input_tokens', provider: 'openai', service: 'generation', metric: 'input_tokens', units: 31 },
      { eventId: 'first-call:output_tokens', provider: 'openai', service: 'generation', metric: 'output_tokens', units: 7 }
    ]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ eventId: 'second-call:input_tokens', provider: 'recognition', service: 'intent_recognition', metric: 'input_tokens', units: 10 });
  });
});
