const { randomBytes } = require('crypto');
const { ProviderRegistry } = require('../registry');
const request = { model: 'synthetic-model', format: 'text', messages: [{ role: 'user', content: 'Synthetic input' }], temperature: 0, maxOutputTokens: 32, timeoutMs: 1000 };
const provider = (type, extra = {}) => ({ id: 'synthetic', type, enabled: true, ...(type === 'vertex_gemini' ? { project: 'synthetic-project', location: 'us-central1' } : {}), ...extra });

test.each(['ollama', 'openai_compatible'])('production requires HTTPS for enabled %s providers before any network call', type => {
  const http = { request: jest.fn() };
  expect(() => new ProviderRegistry({ providers: [provider(type, { baseUrl: 'http://fixture.example.invalid' })] }, { env: { NODE_ENV: 'production' }, http })).toThrow('endpoint');
  expect(http.request).not.toHaveBeenCalled();
});

test.each([['ollama', 11434], ['openai_compatible', 1234]])('development keeps the existing local default port for %s', (type, port) => {
  const registry = new ProviderRegistry({ providers: [provider(type)] }, { env: { NODE_ENV: 'development' }, http: { request: jest.fn() } });
  expect(registry.get('synthetic').baseUrl).toContain(`http://127.0.0.1:${port}`);
});

test.each(['openai', 'gemini', 'vertex_gemini'])('enabled %s requires an explicit configured environment credential at startup', type => {
  const http = { request: jest.fn() }; const googleAuth = { getAccessToken: jest.fn() };
  expect(() => new ProviderRegistry({ providers: [provider(type)] }, { env: {}, http, googleAuth })).toThrow('explicit credential');
  expect(() => new ProviderRegistry({ providers: [provider(type, { credentialRef: 'COMPLIANCE_CLOUD_CREDENTIAL' })] }, { env: {}, http, googleAuth })).toThrow('COMPLIANCE_CLOUD_CREDENTIAL');
  expect(http.request).not.toHaveBeenCalled(); expect(googleAuth.getAccessToken).not.toHaveBeenCalled();
});

test('disabled cloud placeholders may omit credentials without contacting identity or model services', () => {
  const registry = new ProviderRegistry({ providers: [provider('vertex_gemini', { enabled: false })] }, { env: {}, http: { request: jest.fn() } });
  expect(registry.list()[0]).toMatchObject({ enabled: false, configured: false, authentication: 'none' });
});

test('invalid environment credentials and inline registry credentials fail without exposing their values', () => {
  const sensitive = randomBytes(32).toString('hex');
  const configuration = { providers: [provider('openai', { credentialRef: 'COMPLIANCE_CLOUD_CREDENTIAL' })] };
  for (const value of ['', ' ', `${sensitive}\n`]) {
    let error; try { new ProviderRegistry(configuration, { env: { COMPLIANCE_CLOUD_CREDENTIAL: value }, http: {} }); } catch (caught) { error = caught; }
    expect(error?.code).toBe('LLM_CREDENTIAL_MISSING');
    expect(error.message.includes(sensitive)).toBe(false);
  }
  expect(() => new ProviderRegistry({ ...configuration, credential: sensitive }, { env: {}, http: {} })).toThrow('registry');
});

test('removing a named environment credential after startup prevents dispatch rather than using ambient credentials', async () => {
  const env = { COMPLIANCE_CLOUD_CREDENTIAL: randomBytes(32).toString('hex'), OPENAI_API_KEY: randomBytes(32).toString('hex') };
  const http = { request: jest.fn() };
  const registry = new ProviderRegistry({ providers: [provider('openai', { credentialRef: 'COMPLIANCE_CLOUD_CREDENTIAL' })] }, { env, http });
  delete env.COMPLIANCE_CLOUD_CREDENTIAL;
  await expect(registry.generate('synthetic', request)).rejects.toMatchObject({ code: 'LLM_CREDENTIAL_MISSING' });
  expect(http.request).not.toHaveBeenCalled();
});

test('provider response credential echoes are rejected before generation or discovery can return them', async () => {
  const sensitive = randomBytes(32).toString('hex');
  const env = { COMPLIANCE_CLOUD_CREDENTIAL: sensitive };
  const http = { request: jest.fn(async () => ({ data: { done: true, message: { content: sensitive }, models: [{ name: sensitive }] } })) };
  const registry = new ProviderRegistry({ providers: [provider('ollama', { credentialRef: 'COMPLIANCE_CLOUD_CREDENTIAL' })] }, { env, http });
  for (const operation of [() => registry.generate('synthetic', request), () => registry.models('synthetic')]) {
    let error; try { await operation(); } catch (caught) { error = caught; }
    expect(error?.code).toBe('LLM_INVALID_RESPONSE');
    expect(error.message.includes(sensitive)).toBe(false);
  }
});
