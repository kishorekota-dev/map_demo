const DEVELOPMENT_SECRET = 'development-banking-secret-change-me';
const PLACEHOLDER_SECRETS = new Set([
  DEVELOPMENT_SECRET, 'your-secret-key-change-in-production', 'fallback-secret-change-me',
  'your-super-secret-jwt-key-change-in-production', 'dev-jwt-secret-change-in-production',
  'change-me', 'secret', 'test-secret',
]);

function getJwtSecret(env = process.env) {
  const secret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  if (env.NODE_ENV === 'production' && (!secret || secret.length < 32 || PLACEHOLDER_SECRETS.has(secret))) {
    throw new Error('Production banking requires an explicit non-placeholder JWT_SECRET of at least 32 characters.');
  }
  return secret || DEVELOPMENT_SECRET;
}

module.exports = { getJwtSecret };
