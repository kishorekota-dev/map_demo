/**
 * Determinism configuration tests. Guards the falsy-zero temperature bug:
 * `parseFloat(x) || 0.7` silently overrode an explicit 0, making determinism
 * unconfigurable. These assert that temperature 0 is honoured and defaults are 0.
 */
function loadConfigWith(env) {
  const isolatedKeys = [
    'OPENAI_ENABLED',
    'OPENAI_API_KEY',
    'OPENAI_TEMPERATURE',
    'OPENAI_TOP_P',
    'OPENAI_SEED',
    'SLM_ENABLED',
    'SLM_API_KEY',
    'SLM_BASE_URL',
    'SLM_TEMPERATURE',
    'SLM_JSON_MODE',
    'MCP_TRANSPORT'
  ];
  const saved = Object.fromEntries(isolatedKeys.map(key => [key, process.env[key]]));
  isolatedKeys.forEach(key => delete process.env[key]);
  Object.entries(env).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
  jest.resetModules();
  // eslint-disable-next-line global-require
  const config = require('../index');
  isolatedKeys.forEach(key => {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  });
  return config;
}

describe('LLM determinism config', () => {
  test('OPENAI_TEMPERATURE=0 is honoured (falsy-zero bug regression)', () => {
    const config = loadConfigWith({ OPENAI_TEMPERATURE: '0' });
    expect(config.openai.temperature).toBe(0);
  });

  test('temperature/top_p default to 0 when unset', () => {
    const config = loadConfigWith({
      OPENAI_TEMPERATURE: '', OPENAI_TOP_P: '', SLM_TEMPERATURE: ''
    });
    expect(config.openai.temperature).toBe(0);
    expect(config.openai.topP).toBe(0);
  });

  test('a non-zero temperature is still respected when explicitly set', () => {
    const config = loadConfigWith({ OPENAI_TEMPERATURE: '0.5' });
    expect(config.openai.temperature).toBe(0.5);
  });

  test('SLM extractor is forced deterministic (temperature 0, JSON mode on)', () => {
    const config = loadConfigWith({ SLM_TEMPERATURE: '', SLM_JSON_MODE: undefined });
    expect(config.slm.temperature).toBe(0);
    expect(config.slm.jsonMode).toBe(true);
  });

  test('a pinned seed is exposed for reproducible sampling', () => {
    const config = loadConfigWith({ OPENAI_SEED: '42' });
    expect(config.openai.seed).toBe(42);
  });

  test('placeholder API keys disable remote generation', () => {
    const config = loadConfigWith({
      OPENAI_ENABLED: 'true',
      OPENAI_API_KEY: 'your-openai-dev-key',
      SLM_ENABLED: 'true',
      SLM_API_KEY: '',
      SLM_BASE_URL: ''
    });
    expect(config.openai.enabled).toBe(false);
    expect(config.slm.enabled).toBe(false);
  });

  test('an inherited usable OpenAI key does not enable remote generation', () => {
    const config = loadConfigWith({
      OPENAI_API_KEY: 'sk-valid-host-key-1234567890'
    });
    expect(config.openai.enabled).toBe(false);
  });

  test('remote response generation requires an explicit flag and usable key', () => {
    const config = loadConfigWith({
      OPENAI_ENABLED: 'true',
      OPENAI_API_KEY: 'sk-valid-opted-in-key-1234567890'
    });
    expect(config.openai.enabled).toBe(true);
    expect(config.slm.enabled).toBe(false);
  });

  test('remote SLM extraction requires an explicit flag and usable key', () => {
    expect(loadConfigWith({
      SLM_API_KEY: 'sk-valid-slm-key-1234567890'
    }).slm.enabled).toBe(false);

    const config = loadConfigWith({
      SLM_ENABLED: 'true',
      SLM_API_KEY: 'sk-valid-slm-key-1234567890'
    });
    expect(config.slm.enabled).toBe(true);
    expect(config.openai.enabled).toBe(false);
  });

  test('a configured local SLM endpoint enables extraction without an OpenAI key', () => {
    const config = loadConfigWith({
      SLM_ENABLED: 'false',
      SLM_BASE_URL: 'http://localhost:11434/v1',
      OPENAI_API_KEY: 'sk-ambient-host-key-1234567890'
    });
    expect(config.slm.enabled).toBe(true);
    expect(config.slm.apiKey).toBe('not-required');
  });

  test('MCP transport defaults to a single pinned transport (http)', () => {
    const config = loadConfigWith({ MCP_TRANSPORT: '' });
    expect(config.mcp.transport).toBe('http');
  });
});
