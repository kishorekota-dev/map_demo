const fs = require('fs');
function databaseTls(env = process.env) {
  for (const key of ['DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED']) {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new Error(`${key} must be true or false`);
  }
  if (env.NODE_ENV === 'production' && env.DB_SSL_REJECT_UNAUTHORIZED === 'false') throw new Error('Production does not allow DB_SSL_REJECT_UNAUTHORIZED=false');
  if (env.DB_SSL !== 'true') return false;
  return { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(env.DB_SSL_CA_FILE ? { ca: fs.readFileSync(env.DB_SSL_CA_FILE, 'utf8') } : {}) };
}
function pgOptions(connectionString, fallback, env = process.env) {
  const ssl = databaseTls(env);
  if (!connectionString) return { ...fallback, ssl };
  const url = new URL(connectionString);
  if (env.DB_SSL !== undefined) {
    // Explicit server TLS settings take precedence over pg's connection-string parsing.
    for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
    return { connectionString: url.toString(), ssl };
  }
  if (env.NODE_ENV === 'production' && (url.searchParams.get('sslmode') === 'no-verify' || url.searchParams.get('uselibpqcompat') === 'true')) {
    throw new Error('Production database URLs must not disable certificate verification');
  }
  return { connectionString };
}
module.exports = { databaseTls, pgOptions };
