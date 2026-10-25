const { createHash, createHmac, timingSafeEqual } = require('crypto');
const TTL_MS = 5 * 60 * 1000;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SCOPES = new Set(['banking_tool', 'banking_http', 'servicing_case']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
function requestDigest(body) {
  const value = JSON.stringify(canonical(body === undefined ? null : body));
  if (Buffer.byteLength(value) > 65536) throw Object.assign(new Error('Mutation request exceeds its limit'), { status: 400 });
  return createHash('sha256').update(value).digest('hex');
}
function secret(env) {
  if (typeof env.SERVICING_SERVICE_TOKEN !== 'string' || Buffer.byteLength(env.SERVICING_SERVICE_TOKEN) < 32) throw Object.assign(new Error('SERVICING_SERVICE_TOKEN must configure a strong mutation signing identity'), { status: 503 });
  return env.SERVICING_SERVICE_TOKEN;
}
function binding(input) {
  if (!SCOPES.has(input.scope) || typeof input.principalId !== 'string' || !input.principalId || input.principalId.length > 200
    || typeof input.tenantId !== 'string' || !input.tenantId || input.tenantId.length > 200 || !KEY.test(input.key || '')
    || !['POST', 'PUT', 'PATCH', 'DELETE', 'CALL'].includes(input.method) || typeof input.path !== 'string' || !input.path || input.path.length > 500) {
    throw Object.assign(new Error('Invalid mutation confirmation context'), { status: 400 });
  }
  return { v: 1, scope: input.scope, principalId: input.principalId, tenantId: input.tenantId, key: input.key,
    method: input.method, path: input.path, digest: requestDigest(input.body) };
}
function issueProof(input, env = process.env, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...binding(input), expiresAt: now + TTL_MS })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret(env)).update(payload).digest('base64url');
}
function verifyProof(proof, input, env = process.env, now = Date.now()) {
  const signingKey = secret(env);
  if (typeof proof !== 'string' || proof.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof)) return false;
  const [encoded, supplied] = proof.split('.');
  const actual = Buffer.from(supplied, 'base64url');
  const expected = createHmac('sha256', signingKey).update(encoded).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const context = binding(input);
    return Object.keys(payload).length === Object.keys(context).length + 1 && Number.isSafeInteger(payload.expiresAt)
      && payload.expiresAt > now && payload.expiresAt <= now + TTL_MS
      && Object.entries(context).every(([key, value]) => payload[key] === value);
  } catch { return false; }
}
function toolArguments(parameters) {
  const metadata = new Set(['authToken', 'authorization', 'userId', 'tenantId', 'sessionId', 'interactionId', 'runtimeContext', 'idempotencyKey', 'confirmationProof']);
  return Object.fromEntries(Object.entries(parameters || {}).filter(([key]) => !metadata.has(key)));
}
module.exports = { issueProof, verifyProof, requestDigest, toolArguments, KEY, TTL_MS };
