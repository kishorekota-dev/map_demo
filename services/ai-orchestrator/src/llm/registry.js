const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { LlmError } = require('./errors');
const { IDENTIFIER, validModel, validateRequest, validateResponse } = require('./contract');
const plugins = Object.freeze({ ollama: require('./plugins/ollama'), openai: require('./plugins/openai'),
  openai_compatible: require('./plugins/openaiCompatible'), vertex_gemini: require('./plugins/gemini'), gemini: require('./plugins/gemini') });
const DEFAULT_URLS = { ollama: 'http://127.0.0.1:11434', openai: 'https://api.openai.com/v1',
  openai_compatible: 'http://127.0.0.1:1234/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta' };

function loadConfiguration(env) {
  try {
    let source = env.LLM_PROVIDERS_JSON || '{"providers":[]}';
    if (env.LLM_PROVIDERS_FILE) {
      const file = path.resolve(__dirname, '../..', env.LLM_PROVIDERS_FILE);
      if (fs.statSync(file).size > 64000) throw new Error('Registry too large');
      source = fs.readFileSync(file, 'utf8');
    }
    if (source.length > 64000) throw new Error('Registry too large');
    return JSON.parse(source);
  } catch (_error) { throw new LlmError('LLM_REGISTRY_INVALID', 'The server model provider registry is invalid.'); }
}
function normalizeProvider(input, env) {
  if (!input || !IDENTIFIER.test(input.id || '') || !Object.prototype.hasOwnProperty.call(plugins, input.type)
    || Object.keys(input).some(key => !['id', 'type', 'enabled', 'baseUrl', 'baseUrlRef', 'credentialRef', 'allowedModels', 'project', 'location', 'supportsTemperature'].includes(key))
    || (input.supportsTemperature !== undefined && typeof input.supportsTemperature !== 'boolean')
    || (input.baseUrl !== undefined && (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048))
    || typeof input.enabled !== 'boolean' || (input.credentialRef !== undefined && (typeof input.credentialRef !== 'string' || !/^(env:)?[A-Z][A-Z0-9_]{0,127}$/.test(input.credentialRef)))
    || (input.baseUrlRef !== undefined && (typeof input.baseUrlRef !== 'string' || !/^(env:)?[A-Z][A-Z0-9_]{0,127}$/.test(input.baseUrlRef)))
    || (input.allowedModels !== undefined && (!Array.isArray(input.allowedModels) || input.allowedModels.length > 1000 || !input.allowedModels.every(validModel)))) {
    throw new LlmError('LLM_REGISTRY_INVALID', 'The server model provider registry is invalid.');
  }
  if (input.type === 'vertex_gemini' && (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(input.project || '')
    || !/^[a-z][a-z0-9-]{0,63}$/.test(input.location || ''))) throw new LlmError('LLM_REGISTRY_INVALID', 'Vertex requires a configured project and location.');
  let url;
  try {
    const override = input.baseUrlRef ? env[input.baseUrlRef.replace(/^env:/, '')] : null;
    url = new URL(override || input.baseUrl || (input.type === 'vertex_gemini'
      ? `https://${input.location === 'global' ? '' : `${input.location}-`}aiplatform.googleapis.com` : DEFAULT_URLS[input.type]));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (!['ollama', 'openai_compatible'].includes(input.type) && url.protocol !== 'https:')) throw new Error('Invalid URL');
  } catch (_error) { throw new LlmError('LLM_REGISTRY_INVALID', 'A model provider endpoint is invalid.'); }
  return Object.freeze({ id: input.id, type: input.type, enabled: input.enabled, baseUrl: url.toString().replace(/\/$/, ''),
    supportsTemperature: input.supportsTemperature !== false,
    credentialRef: input.credentialRef?.replace(/^env:/, ''), allowedModels: input.allowedModels ? Object.freeze([...new Set(input.allowedModels)]) : undefined,
    ...(input.type === 'vertex_gemini' ? { project: input.project, location: input.location } : {}) });
}
async function withinDeadline(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new LlmError('LLM_TIMEOUT', 'The configured model provider timed out.')), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
class ProviderRegistry {
  constructor(configuration, options = {}) {
    this.env = options.env || process.env;
    const config = configuration || loadConfiguration(this.env);
    if (!config || !Array.isArray(config.providers) || config.providers.length > 50) throw new LlmError('LLM_REGISTRY_INVALID', 'The server model provider registry is invalid.');
    this.providers = new Map();
    for (const entry of config.providers) {
      const provider = normalizeProvider(entry, this.env);
      if (this.providers.has(provider.id)) throw new LlmError('LLM_REGISTRY_INVALID', 'Provider identifiers must be unique.');
      this.providers.set(provider.id, provider);
    }
    this.http = options.http || require('axios');
    this.googleAuth = options.googleAuth;
  }
  configured(provider) {
    if (provider.credentialRef) return Boolean(this.env[provider.credentialRef]);
    return ['ollama', 'openai_compatible', 'vertex_gemini'].includes(provider.type);
  }
  list() {
    return [...this.providers.values()].map(provider => ({ id: provider.id, type: provider.type, enabled: provider.enabled,
      configured: this.configured(provider), ...(provider.allowedModels ? { allowedModels: provider.allowedModels } : {}),
      capabilities: { json: true, modelDiscovery: provider.type !== 'vertex_gemini', temperature: provider.supportsTemperature },
      authentication: provider.type === 'vertex_gemini' && !provider.credentialRef ? 'adc' : provider.credentialRef ? 'configured-reference' : 'none' }));
  }
  get(id, model) {
    const provider = this.providers.get(id);
    if (!provider?.enabled) throw new LlmError('LLM_PROVIDER_UNAVAILABLE', 'The configured model provider is unavailable.');
    if (!this.configured(provider)) throw new LlmError('LLM_CREDENTIAL_MISSING', 'The model provider credential is not configured.');
    if (model && provider.allowedModels && !provider.allowedModels.includes(model)) throw new LlmError('LLM_MODEL_NOT_ALLOWED', 'The model is not allowed by the server provider registry.', 400);
    return provider;
  }
  async client(provider, timeoutMs) {
    const started = Date.now();
    const headers = { 'Content-Type': 'application/json' };
    // Only an explicitly named server credential can leave this adapter.
    // Customer JWTs and ambient OPENAI_API_KEY are never consulted.
    const credential = provider.credentialRef ? this.env[provider.credentialRef] : null;
    if (credential) headers[provider.type === 'gemini' ? 'x-goog-api-key' : 'Authorization'] = provider.type === 'gemini' ? credential : `Bearer ${credential}`;
    else if (provider.type === 'vertex_gemini') {
      if (!this.googleAuth) this.googleAuth = new (require('google-auth-library').GoogleAuth)({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      let token;
      try { token = await withinDeadline(this.googleAuth.getAccessToken(), timeoutMs); }
      catch (error) { if (error instanceof LlmError) throw error; throw new LlmError('LLM_CREDENTIAL_UNAVAILABLE', 'Vertex application credentials are unavailable.'); }
      if (!token) throw new LlmError('LLM_CREDENTIAL_UNAVAILABLE', 'Vertex application credentials are unavailable.');
      headers.Authorization = `Bearer ${token}`;
    }
    return {
      invalidResponse: () => { throw new LlmError('LLM_INVALID_RESPONSE', 'The model did not return a complete supported response.'); },
      request: async (path, body) => {
        const remaining = timeoutMs - (Date.now() - started);
        if (remaining <= 0) throw new LlmError('LLM_TIMEOUT', 'The configured model provider timed out.');
        try {
          const response = await this.http.request({ method: body === undefined ? 'GET' : 'POST', url: `${provider.baseUrl}${path}`,
            ...(body === undefined ? {} : { data: body }), headers, timeout: remaining, signal: AbortSignal.timeout(remaining),
            maxRedirects: 0, maxContentLength: 512000, maxBodyLength: 512000, proxy: false });
          if (!response.data || typeof response.data !== 'object') throw new LlmError('LLM_INVALID_RESPONSE', 'The provider response is invalid.');
          return response.data;
        } catch (error) {
          if (error instanceof LlmError) throw error;
          if (['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(error.code)) throw new LlmError('LLM_TIMEOUT', 'The configured model provider timed out.');
          throw new LlmError('LLM_PROVIDER_ERROR', 'The configured model provider could not complete this request.');
        }
      }
    };
  }
  async generate(providerId, input) {
    const request = validateRequest(input);
    const provider = this.get(providerId, request.model);
    const callId = randomUUID(); const started = Date.now();
    try {
      const result = await plugins[provider.type].generate(provider, request, await this.client(provider, request.timeoutMs));
      return { ...validateResponse(result, request.format), callId, providerId, providerType: provider.type, model: request.model, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError('LLM_INVALID_RESPONSE', 'The model provider returned an unsupported response.');
    }
  }
  async models(providerId) {
    const provider = this.get(providerId);
    const models = provider.type === 'vertex_gemini'
      ? (provider.allowedModels || []).map(id => ({ id, name: id }))
      : await plugins[provider.type].models(provider, await this.client(provider, 10000));
    return { providerId, source: provider.type === 'vertex_gemini' ? 'configured-allowlist' : 'provider',
      models: models.slice(0, 1000).filter(model => validModel(model.id) && (!provider.allowedModels || provider.allowedModels.includes(model.id)))
        .map(model => ({ id: model.id, name: String(model.name || model.id).slice(0, 200) })) };
  }
}
let cached;
const getRegistry = () => {
  const config = loadConfiguration(process.env);
  if (!config || !Array.isArray(config.providers)) throw new LlmError('LLM_REGISTRY_INVALID', 'The server model provider registry is invalid.');
  const key = JSON.stringify(config) + JSON.stringify((config.providers || []).map(provider => provider.baseUrlRef ? process.env[provider.baseUrlRef.replace(/^env:/, '')] || '' : ''));
  if (!cached || cached.key !== key) cached = { key, registry: new ProviderRegistry(config) };
  return cached.registry;
};
module.exports = { ProviderRegistry, getRegistry, plugins };
