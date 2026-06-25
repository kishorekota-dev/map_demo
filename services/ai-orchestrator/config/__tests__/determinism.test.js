/**
 * Determinism configuration tests. Guards the falsy-zero temperature bug:
 * `parseFloat(x) || 0.7` silently overrode an explicit 0, making determinism
 * unconfigurable. These assert that temperature 0 is honoured and defaults are 0.
 */
function loadConfigWith(env) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  jest.resetModules();
  // eslint-disable-next-line global-require
  const config = require('../index');
  process.env = saved;
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

  test('MCP transport defaults to a single pinned transport (http)', () => {
    const config = loadConfigWith({ MCP_TRANSPORT: '' });
    expect(config.mcp.transport).toBe('http');
  });
});
