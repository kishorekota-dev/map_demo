const { ProviderRegistry } = require('../registry');
const { selectProfile, validateLlmConfig } = require('../profiles');
const http = require('http');
const input = { model: 'qwen3.5:latest', messages: [{ role: 'system', content: 'Return a JSON object.' }, { role: 'user', content: 'Synthetic input' }], format: 'json', temperature: 0, maxOutputTokens: 48, timeoutMs: 5000 };
function registry(provider, response, env = {}) {
  const transport = { request: jest.fn(async () => ({ data: response })) };
  return { client: new ProviderRegistry({ providers: [{ id: 'test-provider', enabled: true, ...provider }] }, { http: transport, env }), transport };
}
describe('bounded server-owned model provider plugins', () => {
  test('Ollama uses its native contract, endpoint override and actual usage without an ambient cloud key', async () => {
    const { client, transport } = registry({ type: 'ollama', baseUrl: 'http://example.invalid:11434', baseUrlRef: 'LLM_OLLAMA_BASE_URL' },
      { message: { content: '{"ok":true}' }, done: true, prompt_eval_count: 12, eval_count: 5 }, { OPENAI_API_KEY: 'do-not-send', LLM_OLLAMA_BASE_URL: 'http://studio.internal:11434' });
    const response = await client.generate('test-provider', { ...input, authToken: 'customer-jwt', tools: [{ name: 'transfer' }] });
    expect(response).toMatchObject({ json: { ok: true }, providerType: 'ollama', usage: { inputTokens: 12, outputTokens: 5 } });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://studio.internal:11434/api/chat', headers: { 'Content-Type': 'application/json' },
      maxRedirects: 0, data: { model: input.model, messages: input.messages, stream: false, think: false, format: 'json', options: { temperature: 0, num_predict: 48 } } }));
    expect(JSON.stringify(transport.request.mock.calls)).not.toMatch(/do-not-send|customer-jwt|transfer/);
    expect(JSON.stringify(client.list())).not.toMatch(/studio.internal|LLM_OLLAMA_BASE_URL|OPENAI_API_KEY/);
  });
  test('OpenAI Responses uses only the named credential and parses output messages', async () => {
    const { client, transport } = registry({ type: 'openai', credentialRef: 'env:DEDICATED_KEY' },
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }], usage: { input_tokens: 17, output_tokens: 4, total_tokens: 21 } }, { DEDICATED_KEY: 'server-key' });
    expect(await client.generate('test-provider', { ...input, model: 'allowed-model' })).toMatchObject({ json: { ok: true }, usage: { inputTokens: 17, outputTokens: 4, totalTokens: 21 } });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://api.openai.com/v1/responses', headers: expect.objectContaining({ Authorization: 'Bearer server-key' }),
      data: expect.objectContaining({ store: false, max_output_tokens: 48, text: { format: { type: 'json_object' } } }) }));
  });
  test('server capability can omit unsupported temperature without retrying the provider', async () => {
    const { client, transport } = registry({ type: 'openai', credentialRef: 'KEY', supportsTemperature: false },
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'READY' }] }] }, { KEY: 'server-key' });
    await client.generate('test-provider', { ...input, model: 'reasoning-model', format: 'text' });
    expect(transport.request.mock.calls[0][0].data).not.toHaveProperty('temperature');
    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(client.list()[0].capabilities.temperature).toBe(false);
  });
  test('registry file paths resolve against the service root independently of process working directory', () => {
    const { execFileSync } = require('child_process');
    const modulePath = require.resolve('../registry');
    const script = `const {ProviderRegistry}=require(${JSON.stringify(modulePath)});process.stdout.write(JSON.stringify(new ProviderRegistry(undefined,{env:{LLM_PROVIDERS_FILE:'src/llm/__tests__/fixtures/registry.json'}}).list()));`;
    const output = execFileSync(process.execPath, ['-e', script], { cwd: require('os').tmpdir(), encoding: 'utf8' });
    expect(JSON.parse(output)[0]).toMatchObject({ id: 'fixture-only', enabled: false });
  });
  test('OpenAI-compatible adapters use chat completion JSON mode without inherited credentials', async () => {
    const { client, transport } = registry({ type: 'openai_compatible', baseUrl: 'http://fixture.invalid:1234/v1' },
      { choices: [{ message: { content: '{"value":7}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 3 } }, { OPENAI_API_KEY: 'ambient' });
    expect(await client.generate('test-provider', input)).toMatchObject({ json: { value: 7 }, usage: { inputTokens: 9, outputTokens: 3 } });
    expect(transport.request.mock.calls[0][0]).toMatchObject({ url: 'http://fixture.invalid:1234/v1/chat/completions', headers: { 'Content-Type': 'application/json' },
      data: { max_tokens: 48, response_format: { type: 'json_object' } } });
  });
  test('Gemini Developer API uses a header key, bounded generation config and actual usage', async () => {
    const { client, transport } = registry({ type: 'gemini', credentialRef: 'GEMINI_KEY' },
      { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 4, totalTokenCount: 10 } }, { GEMINI_KEY: 'gemini-secret' });
    expect(await client.generate('test-provider', { ...input, model: 'gemini-test' })).toMatchObject({ json: { ok: true }, usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 } });
    expect(transport.request.mock.calls[0][0]).toMatchObject({ url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
      headers: { 'x-goog-api-key': 'gemini-secret' }, data: { systemInstruction: { parts: [{ text: 'Return a JSON object.' }] },
        contents: [{ role: 'user', parts: [{ text: 'Synthetic input' }] }], generationConfig: { maxOutputTokens: 48, responseMimeType: 'application/json' } } });
  });
  test('Vertex uses ADC only for its own plugin, and model listing is the configured allowlist', async () => {
    const transport = { request: jest.fn(async () => ({ data: { candidates: [{ content: { parts: [{ text: 'READY' }] }, finishReason: 'STOP' }] } })) };
    const googleAuth = { getAccessToken: jest.fn(async () => 'adc-access') };
    const client = new ProviderRegistry({ providers: [{ id: 'vertex', type: 'vertex_gemini', enabled: true, project: 'enterprise-project', location: 'us-central1', allowedModels: ['gemini-test'] }] }, { http: transport, googleAuth, env: {} });
    expect(await client.models('vertex')).toMatchObject({ source: 'configured-allowlist', models: [{ id: 'gemini-test' }] });
    expect(googleAuth.getAccessToken).not.toHaveBeenCalled();
    await client.generate('vertex', { ...input, model: 'gemini-test', format: 'text' });
    expect(transport.request.mock.calls[0][0]).toMatchObject({ url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/enterprise-project/locations/us-central1/publishers/google/models/gemini-test:generateContent', headers: { Authorization: 'Bearer adc-access' } });
    await expect(client.generate('vertex', input)).rejects.toMatchObject({ code: 'LLM_MODEL_NOT_ALLOWED' });
  });
  test('disabled providers, missing explicit credentials, unsafe registries and malformed model output fail closed', async () => {
    expect(() => new ProviderRegistry({ providers: [{ id: 'bad', type: 'openai', enabled: true, baseUrl: 'http://localhost:1234' }] })).toThrow('endpoint');
    expect(() => new ProviderRegistry({ providers: [{ id: 'bad', type: 'ollama', enabled: true, baseUrl: 'http://user:secret@localhost:11434' }] })).toThrow('endpoint');
    const disabled = registry({ type: 'ollama', enabled: false }, {});
    await expect(disabled.client.generate('test-provider', input)).rejects.toMatchObject({ code: 'LLM_PROVIDER_UNAVAILABLE' });
    expect(disabled.transport.request).not.toHaveBeenCalled();
    const cloud = registry({ type: 'openai' }, {}, { OPENAI_API_KEY: 'ambient-must-not-be-used' });
    await expect(cloud.client.generate('test-provider', input)).rejects.toMatchObject({ code: 'LLM_CREDENTIAL_MISSING' });
    const invalid = registry({ type: 'ollama' }, { message: { content: 'not JSON' } });
    await expect(invalid.client.generate('test-provider', input)).rejects.toMatchObject({ code: 'LLM_INVALID_JSON' });
    invalid.transport.request.mockResolvedValue({ data: { message: { content: '{"ok":true}', tool_calls: [{ function: 'transfer' }] } } });
    await expect(invalid.client.generate('test-provider', input)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    invalid.transport.request.mockRejectedValue(Object.assign(new Error('secret backend error'), { code: 'ETIMEDOUT' }));
    await expect(invalid.client.generate('test-provider', input)).rejects.toMatchObject({ code: 'LLM_TIMEOUT', message: 'The configured model provider timed out.' });
    expect(invalid.transport.request).toHaveBeenCalledTimes(3);
  });
  test('profile task selection is explicit, bounded, and generation-only per intent', () => {
    const profile = { id: 'qwen', name: 'Qwen test profile', providerId: 'studio', model: 'qwen3.5:latest', temperature: 0, maxOutputTokens: 1024, timeoutMs: 5000 };
    const llm = { enabled: true, profiles: [profile, { ...profile, id: 'special', model: 'alternate' }], routing: { generation: 'qwen', extraction: 'qwen' } };
    expect(selectProfile(llm, 'generation', { llmProfileId: 'special' }).model).toBe('alternate');
    expect(selectProfile(llm, 'extraction', { llmProfileId: 'special' }).model).toBe('qwen3.5:latest');
    expect(selectProfile(undefined, 'generation')).toBeNull();
    expect(() => selectProfile({ ...llm, enabled: false }, 'generation')).toThrow('disabled');
    expect(() => selectProfile(llm, 'recognition')).toThrow('No published model profile');
    expect(() => validateLlmConfig({ ...llm, profiles: [{ ...profile, timeoutMs: 999999 }] })).toThrow('invalid');
  });
  test('an ephemeral HTTP fixture verifies Ollama transport without calling any installed model server', async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', part => { body += part; }); req.on('end', () => {
        seen.push({ path: req.url, authorization: req.headers.authorization, body }); res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(req.method === 'GET' ? { models: [{ name: 'fixture-qwen' }] }
          : { message: { content: '{"synthetic":true}' }, done: true, prompt_eval_count: 4, eval_count: 2 }));
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const client = new ProviderRegistry({ providers: [{ id: 'fixture', type: 'ollama', enabled: true, baseUrl: `http://127.0.0.1:${server.address().port}` }] }, { env: {} });
      expect((await client.models('fixture')).models).toEqual([{ id: 'fixture-qwen', name: 'fixture-qwen' }]);
      expect(await client.generate('fixture', { ...input, model: 'fixture-qwen' })).toMatchObject({ json: { synthetic: true } });
      expect(seen.map(entry => entry.path)).toEqual(['/api/tags', '/api/chat']);
      expect(seen.every(entry => !entry.authorization)).toBe(true);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
