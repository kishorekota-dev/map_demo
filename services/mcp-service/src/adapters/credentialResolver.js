/** Server-owned credential references; OAuth tokens never cross adapter identities. */
const { createHash } = require("crypto");
const {
  createSecureHttpClient,
  validateEndpoint,
} = require("./adapterNetwork");
class AdapterAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterAuthError";
  }
}
function requiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.trim())
    throw new AdapterAuthError(
      `Adapter credential missing: environment variable "${name}" is not set`,
    );
  if (value.length > 16384 || /[\r\n\0]/.test(value))
    throw new AdapterAuthError("Invalid adapter credential value");
  return value;
}
const tokenCache = new Map();
async function resolveOAuthToken(auth, env, httpClient) {
  validateEndpoint(auth.tokenUrl, env);
  const clientId = requiredEnv(env, auth.envVarClientId);
  const clientSecret = requiredEnv(env, auth.envVarClientSecret);
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        auth.tokenUrl,
        clientId,
        clientSecret,
        auth.scope || "",
        env.DEPLOYMENT_TENANT_ID || "",
      ]),
    )
    .digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  for (const [cacheKey, entry] of tokenCache)
    if (entry.expiresAt <= Date.now()) tokenCache.delete(cacheKey);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (auth.scope) body.set("scope", auth.scope);
  let response;
  try {
    response = await httpClient({
      method: "POST",
      url: auth.tokenUrl,
      data: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
      maxRedirects: 0,
      proxy: false,
      maxContentLength: 1048576,
      maxBodyLength: 65536,
    });
  } catch {
    throw new AdapterAuthError(
      "Failed to obtain OAuth2 client-credentials token",
    );
  }
  const data = response.data || {};
  if (
    !(response.status >= 200 && response.status < 300) ||
    typeof data.access_token !== "string" ||
    !data.access_token ||
    data.access_token.length > 16384 ||
    /\s/.test(data.access_token)
  )
    throw new AdapterAuthError(
      "OAuth2 token endpoint did not return a valid access_token",
    );
  const seconds = data.expires_in;
  // No invented validity period; short-lived tokens are never cached beyond expiry.
  if (Number.isFinite(seconds) && seconds > 0 && tokenCache.size < 1000) {
    const ttl = Math.min(seconds * 1000, 3600000);
    tokenCache.set(key, {
      token: data.access_token,
      expiresAt: Date.now() + ttl - Math.min(60000, ttl / 10),
    });
  }
  return data.access_token;
}
async function resolveAuthHeaders(
  adapter,
  env = process.env,
  httpClient = createSecureHttpClient(env),
) {
  const auth = adapter.auth || { type: "none" };
  switch (auth.type) {
    case "none":
      return {};
    case "apiKey":
      return {
        [auth.headerName || "X-Api-Key"]: requiredEnv(env, auth.envVar),
      };
    case "bearer":
      return { Authorization: `Bearer ${requiredEnv(env, auth.envVar)}` };
    case "basic":
      return {
        Authorization: `Basic ${Buffer.from(`${requiredEnv(env, auth.envVarUsername)}:${requiredEnv(env, auth.envVarPassword)}`).toString("base64")}`,
      };
    case "oauth2-client-credentials":
      return {
        Authorization: `Bearer ${await resolveOAuthToken(auth, env, httpClient)}`,
      };
    default:
      throw new AdapterAuthError("Unsupported adapter auth type");
  }
}
module.exports = {
  AdapterAuthError,
  resolveAuthHeaders,
  _tokenCache: tokenCache,
};
