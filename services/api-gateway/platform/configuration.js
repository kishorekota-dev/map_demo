const placeholder = value => typeof value !== 'string' || value.length < 32
  || /change[-_ ]?me|replace[-_ ]|your[-_ ]|dev-jwt|local-servicing|example-secret/i.test(value)
  || new Set(value).size < 8;
const postgres = value => {
  try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); } catch { return false; }
};
function configurationChecks(env = process.env) {
  const check = (id, passed, message) => ({ id, status: passed ? 'passed' : 'failed', message });
  return [
    check('jwt_secret', !placeholder(env.JWT_SECRET), 'Use a random JWT_SECRET with at least 32 characters.'),
    check('service_identity', !placeholder(env.SERVICING_SERVICE_TOKEN) && env.JWT_SECRET !== env.SERVICING_SERVICE_TOKEN,
      'Use a separate random SERVICING_SERVICE_TOKEN with at least 32 characters.'),
    check('control_plane', env.CONTROL_PLANE_ENABLED === 'true' && postgres(env.CONTROL_PLANE_DATABASE_URL),
      'Enable the control plane and configure its PostgreSQL database.'),
    check('operations_storage', postgres(env.OPERATIONS_DATABASE_URL || env.CONTROL_PLANE_DATABASE_URL || env.DATABASE_URL),
      'Configure PostgreSQL for durable servicing operations.'),
    check('redis', (() => { try { return ['redis:', 'rediss:'].includes(new URL(env.REDIS_URL).protocol); } catch { return false; } })(),
      'Configure REDIS_URL for shared production rate limits.'),
    check('durable_runtime', env.WORKFLOW_DURABLE_EXECUTION === 'true' && env.HANDOFF_STORAGE === 'postgres',
      'Enable durable workflow execution and PostgreSQL handoff grants across services.'),
    check('durable_graph', env.CHECKPOINT_ENABLED === 'true' && env.CHECKPOINT_BACKEND === 'postgres' && env.CHECKPOINT_SCHEMA_AUTO_MIGRATE === 'false',
      'Enable PostgreSQL graph checkpoints and preinstall the V2 checkpoint schema.'),
    check('connector_network', env.CONNECTOR_ALLOW_LOCAL !== 'true' && env.OIDC_ALLOW_LOCAL !== 'true',
      'Disable development-only local connector and identity allowances.'),
    check('browser_origins', !!env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.split(',').every(value => {
      try { const url = new URL(value.trim()); return url.protocol === 'https:' && url.origin === value.trim() && !url.username && !url.password; } catch { return false; }
    }), 'Set ALLOWED_ORIGINS to exact HTTPS browser origins.')
  ];
}
function assertProductionConfiguration(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const failures = configurationChecks(env).filter(check => check.status === 'failed');
  if (failures.length) {
    const error = new Error(`Production configuration failed: ${failures.map(check => check.id).join(', ')}.`);
    error.code = 'PRODUCTION_CONFIGURATION_INVALID';
    throw error;
  }
}
module.exports = { configurationChecks, assertProductionConfiguration };
