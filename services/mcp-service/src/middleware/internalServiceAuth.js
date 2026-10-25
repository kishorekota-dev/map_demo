const { timingSafeEqual } = require('crypto');

// This authenticates the calling service, independently of a banking user's JWT.
const required = (env = process.env) => env.NODE_ENV === 'production' || env.INTERNAL_SERVICE_AUTH_REQUIRED === 'true';
function validateConfiguration(env = process.env) {
  if (!required(env)) return;
  const token = env.SERVICING_SERVICE_TOKEN;
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32 || new Set(token).size < 10 || /(change[-_ ]?me|replace[-_ ]?(?:me|with)|placeholder|example|development|password|local-servicing|dev-jwt|your[-_ ])/i.test(token)) {
    throw new Error('Internal service authentication requires a non-placeholder SERVICING_SERVICE_TOKEN of at least 32 bytes');
  }
}
function authorized(req, env = process.env) {
  if (!required(env)) return true;
  try { validateConfiguration(env); } catch { return false; }
  const token = req.headers?.['x-servicing-service-token'];
  if (typeof token !== 'string') return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(env.SERVICING_SERVICE_TOKEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function authenticate(req, res, next) {
  if (authorized(req)) return next();
  return res.status(401).json({ error: 'Internal service authentication required', code: 'INTERNAL_SERVICE_UNAUTHORIZED' });
}
function verifyClient(info, done) {
  done(authorized(info.req), 401, 'Internal service authentication required');
}
module.exports = { required, validateConfiguration, authorized, authenticate, verifyClient };
