/**
 * Server-side credential resolution for generic backend adapters.
 *
 * Credentials live in environment variables named by the adapter definition
 * and are resolved at execution time only. Nothing in this module ever logs
 * a credential value, and error messages name the missing variable, never
 * its value. A caller can never supply a credential in a request body: the
 * request path has no field for it.
 */

const axios = require('axios');

class AdapterAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdapterAuthError';
  }
}

function requiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AdapterAuthError(`Adapter credential missing: environment variable "${name}" is not set`);
  }
  return value;
}

// OAuth2 client-credentials tokens are cached in-process until shortly
// before expiry so a token fetch does not happen on every tool call. The
// cache holds tokens only in memory, keyed by token URL + client id.
const tokenCache = new Map();

function tokenCacheKey(auth) {
  return `${auth.tokenUrl}::${auth.envVarClientId}`;
}

async function resolveOAuthToken(auth, env, httpClient) {
  const key = tokenCacheKey(auth);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const clientId = requiredEnv(env, auth.envVarClientId);
  const clientSecret = requiredEnv(env, auth.envVarClientSecret);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (auth.scope) body.set('scope', auth.scope);
  let response;
  try {
    response = await httpClient({
      method: 'POST',
      url: auth.tokenUrl,
      data: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
  } catch (error) {
    throw new AdapterAuthError('Failed to obtain OAuth2 client-credentials token');
  }
  const data = response.data || {};
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new AdapterAuthError('OAuth2 token endpoint did not return an access_token');
  }
  const expiresIn = Number.isFinite(data.expires_in) ? data.expires_in : 3600;
  // Refresh 60s early, but never cache for less than 60s.
  const ttlMs = Math.max(60, expiresIn - 60) * 1000;
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + ttlMs });
  return data.access_token;
}

/**
 * Resolve the Authorization / API-key headers for one adapter.
 * @param {object} adapter normalized adapter definition
 * @param {object} [env] defaults to process.env
 * @param {function} [httpClient] injectable for tests; defaults to axios
 * @returns {Promise<object>} headers (never includes a credential value in a log)
 */
async function resolveAuthHeaders(adapter, env = process.env, httpClient = axios) {
  const auth = adapter.auth || { type: 'none' };
  switch (auth.type) {
    case 'none':
      return {};
    case 'apiKey':
      return { [auth.headerName || 'X-Api-Key']: requiredEnv(env, auth.envVar) };
    case 'bearer':
      return { Authorization: `Bearer ${requiredEnv(env, auth.envVar)}` };
    case 'basic': {
      const username = requiredEnv(env, auth.envVarUsername);
      const password = requiredEnv(env, auth.envVarPassword);
      return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
    }
    case 'oauth2-client-credentials': {
      const token = await resolveOAuthToken(auth, env, httpClient);
      return { Authorization: `Bearer ${token}` };
    }
    default:
      throw new AdapterAuthError(`Unsupported auth type "${auth.type}"`);
  }
}

module.exports = { AdapterAuthError, resolveAuthHeaders, _tokenCache: tokenCache };
