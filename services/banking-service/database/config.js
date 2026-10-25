require('dotenv').config();
const fs = require('fs');

// A production process must identify its banking database explicitly. Servicing
// DATABASE_URL values are separate contracts and must not trigger host defaults.
if (process.env.NODE_ENV === 'production') {
  const missing = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
    .filter(key => typeof process.env[key] !== 'string' || !process.env[key].trim());
  if (missing.length) throw new Error(`Production banking requires explicit nonempty database settings: ${missing.join(', ')}.`);
}

function databaseTls(env = process.env) {
  for (const key of ['DB_SSL', 'DB_SSL_REJECT_UNAUTHORIZED']) {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new Error(`${key} must be true or false.`);
  }
  const insecure = env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
  if (insecure && env.NODE_ENV === 'production') {
    throw new Error('Production banking does not allow DB_SSL_REJECT_UNAUTHORIZED=false.');
  }
  if (env.DB_SSL !== 'true') return false;
  return {
    rejectUnauthorized: !insecure,
    ...(env.DB_SSL_CA_FILE ? { ca: fs.readFileSync(env.DB_SSL_CA_FILE, 'utf8') } : {}),
  };
}

module.exports = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'poc_banking',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
    ssl: databaseTls()
  },
  
  flyway: {
    url: process.env.DATABASE_URL || `jdbc:postgresql://${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'poc_banking'}`,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    locations: ['filesystem:migrations'],
    schemas: ['public'],
    table: 'flyway_schema_history',
    baselineOnMigrate: true,
    baselineVersion: '0',
    validateOnMigrate: true,
    outOfOrder: false,
    cleanDisabled: process.env.NODE_ENV === 'production'
  }
};
module.exports.databaseTls = databaseTls;
