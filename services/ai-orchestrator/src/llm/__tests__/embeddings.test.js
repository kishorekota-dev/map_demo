const { ProviderRegistry } = require('../registry');
const { embedWithProfile, validateLlmConfig } = require('../profiles');

const vector = (seed, dimensions = 4) => Array.from({ length: dimensions }, (_value, index) => (seed + 1) * (index + 1) / 10);
function registry(provider, response, env = {}) {
  const transport = { request: jest.fn(async () => ({ data: typeof response === 'function' ? response() : response })) };
  return { client: new ProviderRegistry({ providers: [{ id: 'embedder', enabled: true, ...provider }] }, { http: transport, env }), transport };
}
const request = { model: 'embed-model', input: ['first text', 'second text'], purpose: 'document', timeoutMs: 5000 };

describe('provider embeddings', () => {
  test('Ollama uses /api/embed and reports measured input tokens', async () => {
    const { client, transport } = registry({ type: 'ollama', baseUrl: 'http://studio.invalid:11434' }, { embeddings: [vector(0), vector(1)], prompt_eval_count: 9 });
    const result = await client.embed('embedder', request);
    expect(result).toMatchObject({ dimensions: 4, providerId: 'embedder', providerType: 'ollama', model: 'embed-model', usage: { inputTokens: 9 } });
    expect(result.vectors).toHaveLength(2);
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://studio.invalid:11434/api/embed', method: 'POST',
      data: { model: 'embed-model', input: ['first text', 'second text'] }, maxRedirects: 0, maxContentLength: 4000000 }));
  });

  test.each([
    ['openai', { credentialRef: 'KEY' }, 'https://api.openai.com/v1/embeddings', { KEY: 'server-key' }],
    ['openai_compatible', { baseUrl: 'http://lmstudio.invalid:1234/v1' }, 'http://lmstudio.invalid:1234/v1/embeddings', {}],
  ])('%s uses /embeddings and restores input order', async (type, extra, url, env) => {
    const { client, transport } = registry({ type, ...extra }, { data: [{ index: 1, embedding: vector(1) }, { index: 0, embedding: vector(0) }], usage: { prompt_tokens: 6, total_tokens: 6 } }, env);
    const result = await client.embed('embedder', request);
    expect(result.vectors[0]).toEqual(vector(0).map(Math.fround));
    expect(result.usage).toEqual({ inputTokens: 6, totalTokens: 6 });
    expect(transport.request.mock.calls[0][0]).toMatchObject({ url, data: { model: 'embed-model', input: request.input, encoding_format: 'float' } });
  });

  test('Gemini and Vertex use retrieval task types for documents and queries', async () => {
    const gemini = registry({ type: 'gemini', credentialRef: 'GEMINI_KEY' }, { embeddings: [{ values: vector(0) }] }, { GEMINI_KEY: 'server-key' });
    await gemini.client.embed('embedder', { ...request, model: 'text-embedding-004', input: ['question'], purpose: 'query' });
    expect(gemini.transport.request.mock.calls[0][0]).toMatchObject({ url: 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents',
      headers: expect.objectContaining({ 'x-goog-api-key': 'server-key' }),
      data: { requests: [{ model: 'models/text-embedding-004', content: { parts: [{ text: 'question' }] }, taskType: 'RETRIEVAL_QUERY' }] } });
    const vertex = registry({ type: 'vertex_gemini', credentialRef: 'VERTEX_TOKEN', project: 'bank-project', location: 'us-central1' },
      { predictions: [{ embeddings: { values: vector(2), statistics: { token_count: 3 } } }] }, { VERTEX_TOKEN: 'server-token' });
    const result = await vertex.client.embed('embedder', { ...request, model: 'text-embedding-005', input: ['chunk'] });
    expect(result.usage).toEqual({ inputTokens: 3 });
    expect(vertex.transport.request.mock.calls[0][0]).toMatchObject({
      url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/bank-project/locations/us-central1/publishers/google/models/text-embedding-005:predict',
      data: { instances: [{ content: 'chunk', task_type: 'RETRIEVAL_DOCUMENT' }] } });
  });

  test.each([
    ['too many inputs', { input: Array.from({ length: 65 }, () => 'x') }],
    ['an empty input', { input: ['ok', '  '] }],
    ['an oversized input', { input: ['x'.repeat(8001)] }],
    ['an unknown purpose', { purpose: 'classification' }],
    ['a URL model', { model: 'http://evil.invalid/model' }],
  ])('rejects %s before contacting the provider', async (_label, override) => {
    const { client, transport } = registry({ type: 'ollama' }, { embeddings: [] });
    await expect(client.embed('embedder', { ...request, ...override })).rejects.toMatchObject({ code: 'LLM_INVALID_REQUEST' });
    expect(transport.request).not.toHaveBeenCalled();
  });

  test.each([
    ['a missing vector', { embeddings: [vector(0)] }],
    ['inconsistent dimensions', { embeddings: [vector(0, 4), vector(1, 3)] }],
    ['a non-finite value', { embeddings: [vector(0), [1, NaN, 2, 3]] }],
    ['a zero vector', { embeddings: [vector(0), [0, 0, 0, 0]] }],
  ])('rejects %s from the provider', async (_label, response) => {
    const { client } = registry({ type: 'ollama' }, response);
    await expect(client.embed('embedder', request)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });

  test('an embedding response echoing the server credential is rejected', async () => {
    const { client } = registry({ type: 'openai', credentialRef: 'KEY' }, { data: [{ index: 0, embedding: vector(0) }, { index: 1, embedding: vector(1) }], echo: 'server-key' }, { KEY: 'server-key' });
    await expect(client.embed('embedder', request)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });

  test('providers advertise embeddings', () => {
    expect(registry({ type: 'ollama' }, {}).client.list()[0].capabilities.embeddings).toBe(true);
  });
});

describe('governed embedding route', () => {
  const llm = { enabled: true, profiles: [{ id: 'embed', name: 'Embeddings', providerId: 'embedder', model: 'embed-model', temperature: 0, maxOutputTokens: 1, timeoutMs: 5000 }], routing: { embedding: 'embed' } };

  test('semantic retrieval requires an enabled embedding route', () => {
    expect(() => validateLlmConfig(llm, [], undefined, { strategy: 'hybrid' })).not.toThrow();
    expect(() => validateLlmConfig({ ...llm, routing: { generation: 'embed' } }, [], undefined, { strategy: 'semantic' })).toThrow('embedding profile');
    expect(() => validateLlmConfig({ ...llm, enabled: false }, [], undefined, { strategy: 'semantic' })).toThrow('embedding profile');
    expect(() => validateLlmConfig(undefined, [], undefined, { strategy: 'hybrid' })).toThrow('required');
    expect(() => validateLlmConfig(undefined, [], undefined, { strategy: 'lexical' })).not.toThrow();
  });

  test('embedWithProfile uses the routed profile and records embedding usage', async () => {
    const embed = jest.fn(async () => ({ vectors: [vector(0)], dimensions: 4, usage: { inputTokens: 5 }, callId: 'call-1', providerId: 'embedder', model: 'embed-model' }));
    const recordUsage = jest.fn();
    const result = await embedWithProfile(llm, ['text'], 'query', recordUsage, { embed });
    expect(embed).toHaveBeenCalledWith('embedder', { model: 'embed-model', input: ['text'], purpose: 'query', timeoutMs: 5000 });
    expect(result.profile).toEqual({ id: 'embed', providerId: 'embedder', model: 'embed-model' });
    expect(recordUsage).toHaveBeenCalledWith({ eventId: 'call-1:input_tokens', provider: 'embedder', service: 'embedding', metric: 'input_tokens', units: 5 });
  });
});
