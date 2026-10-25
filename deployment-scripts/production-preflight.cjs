#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readEnvironment } = require('./lib/environment.cjs');
const ROOT = path.resolve(__dirname, '..');
const decode = value => { try { return decodeURIComponent(value); } catch { return ''; } };
const strongSecret = value => typeof value === 'string' && Buffer.byteLength(value) >= 32 && value.length <= 2048
  && new Set(value).size >= 10 && !/(change[-_ ]?me|placeholder|example|development|password|local-servicing|dev-jwt|your[-_ ])/i.test(value);
function validateProduction(env, options = {}) {
  const failures = []; const warnings = []; let checks = 0;
  const check = (condition, code, message) => { checks += 1; if (!condition) failures.push({ code, message }); };
  const requiredSecret = key => check(strongSecret(env[key]), key, `${key} must contain a unique high-entropy secret of at least 32 bytes; replace missing/sample values.`);
  const url = (key, protocols, required = true) => {
    if (!env[key] && !required) return null;
    try {
      const result = new URL(env[key]);
      check(protocols.includes(result.protocol) && !!result.hostname && !result.hash, key, `${key} must be a valid ${protocols.join('/')} URL without a fragment.`);
      return result;
    } catch { check(false, key, `${key} is missing or is not a valid URL.`); return null; }
  };
  check(Number(process.versions.node.split('.')[0]) >= 22, 'NODE_VERSION', 'Run the deployment tooling with Node.js 22 or later.');
  check(env.NODE_ENV === 'production', 'NODE_ENV', 'Set NODE_ENV=production.');
  check(/^[a-z][a-z0-9-]{1,62}$/.test(env.DEPLOYMENT_TENANT_ID || '') && env.DEPLOYMENT_TENANT_ID !== 'default-enterprise', 'DEPLOYMENT_TENANT_ID', 'Choose a non-default deployment tenant identifier.');
  for (const key of ['JWT_SECRET', 'SERVICING_SERVICE_TOKEN', 'SESSION_SECRET', 'AUDIT_ACTOR_HASH_KEY']) requiredSecret(key);
  check(new Set(['JWT_SECRET', 'SERVICING_SERVICE_TOKEN', 'SESSION_SECRET', 'AUDIT_ACTOR_HASH_KEY'].map(key => env[key])).size === 4,
    'SECRET_SEPARATION', 'Use distinct signing, internal-service, browser-session and audit-pseudonym keys.');
  for (const [key, expected] of Object.entries({ CONTROL_PLANE_ENABLED: 'true', CONTROL_PLANE_ENVIRONMENT: 'production',
    CHAT_PERSISTENCE_ENABLED: 'true', WORKFLOW_DURABLE_EXECUTION: 'true', CHECKPOINT_ENABLED: 'true', CHECKPOINT_BACKEND: 'postgres', CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'false', HANDOFF_STORAGE: 'postgres',
    FULFILLMENT_WORKER_ENABLED: 'true', INTERNAL_SERVICE_AUTH_REQUIRED: 'true', DATABASE_MANAGE_SCHEMA: 'false',
    CONTROL_PLANE_MANAGE_SCHEMA: 'false', OPERATIONS_MANAGE_SCHEMA: 'false', WORKFLOW_SCHEMA_AUTO_MIGRATE: 'false',
    HANDOFF_SCHEMA_AUTO_MIGRATE: 'false', BANKING_RUN_MIGRATIONS: 'false' })) {
    check(env[key] === expected, key, `Set ${key}=${expected} for this production deployment.`);
  }
  check(env.BANKING_SEED_DEMO_DATA !== 'true', 'BANKING_SEED_DEMO_DATA', 'Demo data seeding must be disabled in production.');
  check(env.CONNECTOR_ALLOW_LOCAL !== 'true' && env.OIDC_ALLOW_LOCAL !== 'true', 'LOCAL_EXCEPTIONS', 'Disable development-only connector/OIDC local exceptions.');
  check(env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', 'DATABASE_TLS', 'Do not disable database certificate verification in production.');
  for (const key of ['CONTROL_PLANE_DATABASE_URL', 'OPERATIONS_DATABASE_URL', 'WORKFLOW_DATABASE_URL', 'HANDOFF_DATABASE_URL']) {
    const parsed = url(key, ['postgres:', 'postgresql:']);
    if (parsed) {
      check(parsed.pathname.length > 1 && !!parsed.username && strongSecret(decode(parsed.password)), key,
        `${key} requires a database name, user and non-placeholder password of at least 32 bytes.`);
      check(!['no-verify', 'disable'].includes(parsed.searchParams.get('sslmode')) || (options.compose && parsed.hostname === 'postgres'), key,
        `${key} must not disable certificate verification for an external database.`);
      if (options.compose) {
        check(parsed.hostname === 'postgres' && parsed.username === 'poc_user', key, `${key} must target private postgres with user poc_user for the bundled production Compose deployment.`);
        const database = key === 'WORKFLOW_DATABASE_URL' ? '/ai_orchestrator' : key === 'HANDOFF_DATABASE_URL' ? '/poc_chat' : '/poc_banking';
        check(parsed.pathname === database, key, `${key} must target its documented service database for the bundled deployment.`);
      }
    }
  }
  if (env.CHECKPOINT_DATABASE_URL) check(env.CHECKPOINT_DATABASE_URL === env.WORKFLOW_DATABASE_URL, 'CHECKPOINT_DATABASE_URL',
    'This migration/deployment profile requires checkpoints in WORKFLOW_DATABASE_URL; separately review and migrate any custom checkpoint database.');
  const redis = url('REDIS_URL', ['redis:', 'rediss:']);
  if (redis) {
    check(strongSecret(decode(redis.password)), 'REDIS_URL', 'REDIS_URL requires an authenticated, non-placeholder password.');
    if (options.compose) check(redis.hostname === 'redis', 'REDIS_URL', 'Use the private redis service for the bundled production Compose deployment.');
  }
  if (options.compose) {
    for (const key of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD']) {
      requiredSecret(key);
      check(/^[A-Za-z0-9_-]+$/.test(env[key] || ''), key, `${key} must be URL-safe (letters, digits, underscore or hyphen) for the bundled Compose configuration.`);
    }
    for (const key of ['CONTROL_PLANE_DATABASE_URL', 'OPERATIONS_DATABASE_URL', 'WORKFLOW_DATABASE_URL', 'HANDOFF_DATABASE_URL']) {
      try { check(decode(new URL(env[key]).password) === env.POSTGRES_PASSWORD, key, `${key} password must match POSTGRES_PASSWORD for the bundled database.`); } catch { /* URL check above reports the field. */ }
    }
    if (redis) check(decode(redis.password) === env.REDIS_PASSWORD, 'REDIS_URL', 'REDIS_URL password must match REDIS_PASSWORD.');
  }
  const frontend = url('FRONTEND_URL', ['https:']);
  if (frontend) check(!frontend.username && !frontend.password && frontend.pathname === '/' && !frontend.search, 'FRONTEND_URL', 'FRONTEND_URL must be an HTTPS origin without embedded credentials.');
  const origins = (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  check(origins.length > 0 && origins.every(origin => { try { const parsed = new URL(origin); return parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password; } catch { return false; } }), 'ALLOWED_ORIGINS', 'Set exact HTTPS browser origins; wildcards and paths are not allowed.');
  check(['jwt', 'oidc'].includes(env.AUTH_PROVIDER), 'AUTH_PROVIDER', 'AUTH_PROVIDER must be jwt or oidc; no SAML broker is implemented.');
  if (env.AUTH_PROVIDER === 'oidc') {
    check(Boolean(env.OIDC_CLIENT_ID), 'OIDC_CLIENT_ID', 'Configure the registered OIDC client identifier.');
    for (const key of ['OIDC_ISSUER', 'OIDC_AUTHORIZATION_ENDPOINT', 'OIDC_TOKEN_ENDPOINT', 'OIDC_JWKS_URI', 'OIDC_REDIRECT_URI']) {
      const parsed = url(key, ['https:']);
      if (parsed) check(!parsed.username && !parsed.password && !parsed.search, key, `${key} must not contain embedded credentials or query parameters.`);
    }
    try { check(new URL(env.OIDC_REDIRECT_URI).pathname === '/api/identity/callback', 'OIDC_REDIRECT_URI', 'Register the exact /api/identity/callback endpoint.'); } catch { /* Above. */ }
    if (env.OIDC_CLIENT_SECRET_REF) {
      check(env.OIDC_CLIENT_SECRET_REF === 'env:OIDC_CLIENT_SECRET' && Boolean(env.OIDC_CLIENT_SECRET), 'OIDC_CLIENT_SECRET_REF',
        'Use env:OIDC_CLIENT_SECRET and inject its value through the server environment. Credential files are unsupported.');
    }
    warnings.push('OIDC discovery, callback registration, local identity mappings and provider acceptance require a live deployment check.');
  }
  const number = (key, fallback, min, max) => {
    const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
    check(Number.isInteger(value) && value >= min && value <= max, key, `${key} must be an integer between ${min} and ${max} milliseconds.`);
    return value;
  };
  const nlu = number('NLU_REQUEST_TIMEOUT_MS', 5000, 1000, 120000);
  const workflow = number('AGENT_RESPONSE_TIMEOUT', 400000, 1000, 590000);
  const gateway = number('SERVICING_REQUEST_TIMEOUT_MS', 410000, 1000, 600000);
  check(nlu + workflow + 1000 <= gateway, 'TIMEOUT_ORDER', 'SERVICING_REQUEST_TIMEOUT_MS must cover NLU_REQUEST_TIMEOUT_MS + AGENT_RESPONSE_TIMEOUT + at least 1000ms overhead.');
  let runtime;
  function readJsonSetting(key, required) {
    if (!env[key] && !required) return null;
    if (!env[key] || !path.isAbsolute(env[key])) { check(false, key, `${key} must name an absolute readable host file path.`); return null; }
    try {
      check(fs.statSync(env[key]).isFile() && fs.statSync(env[key]).size <= 64000, key, `${key} must be a regular file no larger than 64 KB.`);
      return JSON.parse(fs.readFileSync(env[key], 'utf8'));
    } catch { check(false, key, `${key} is missing, unreadable or invalid JSON.`); return null; }
  }
  if (options.checkFiles !== false) {
    runtime = readJsonSetting('FRONTEND_RUNTIME_CONFIG_FILE', true);
    if (runtime) {
      check(runtime.tenantId === env.DEPLOYMENT_TENANT_ID, 'FRONTEND_TENANT', 'Frontend display tenant must match DEPLOYMENT_TENANT_ID.');
      for (const field of ['apiBaseUrl', 'authBaseUrl']) {
        try { const parsed = new URL(runtime[field]); check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash, 'FRONTEND_ENDPOINT', `Frontend ${field} must be an HTTPS API base without credentials.`); }
        catch { check(false, 'FRONTEND_ENDPOINT', `Frontend ${field} is missing or invalid.`); }
      }
      check(!Object.keys(runtime).some(key => /secret|password|token|credential|database/i.test(key)), 'FRONTEND_SECRETS', 'Frontend runtime configuration must not contain server credentials.');
      check(runtime.features?.allowTokenAuth === false, 'FRONTEND_TOKEN_AUTH', 'Disable manual browser token entry in the production runtime configuration.');
      check(Number.isInteger(runtime.chatRequestTimeoutMs) && runtime.chatRequestTimeoutMs > gateway && runtime.chatRequestTimeoutMs <= 600000,
        'BROWSER_TIMEOUT', 'Set runtime chatRequestTimeoutMs above the gateway budget and at most 600000ms.');
    }
    const registryKey = options.compose ? 'LLM_PROVIDERS_HOST_FILE' : env.LLM_PROVIDERS_HOST_FILE ? 'LLM_PROVIDERS_HOST_FILE' : 'LLM_PROVIDERS_FILE';
    const registry = readJsonSetting(registryKey, true);
    if (registry) {
      try {
        // The runtime's canonical parser is data-only when a transport is supplied.
        // Neither constructor nor list() makes HTTP/ADC/model calls.
        const { ProviderRegistry } = require('../services/ai-orchestrator/src/llm/registry');
        const parsed = new ProviderRegistry(registry, { env, http: {} });
        for (const provider of parsed.list()) {
          if (provider.enabled) {
            check(provider.configured, 'LLM_CREDENTIAL', 'An enabled model provider has an unresolved explicit credential reference.');
            warnings.push('An enabled model provider requires separate reachability, authorization, quality and latency checks; no provider was contacted.');
          }
        }
      } catch { check(false, 'LLM_REGISTRY', 'The model registry violates the runtime provider schema; check endpoints, credential references, provider types and model restrictions.'); }
    }
    if (env.CONNECTORS_CONFIG_PATH) {
      try {
        require('../services/api-gateway/operations/connectorCatalog').loadConnectorCatalog({ ...env, NODE_ENV: 'production' });
        check(true, 'CONNECTOR_CATALOG', 'Server-owned connector declarations and environment references are valid.');
      } catch { check(false, 'CONNECTOR_CATALOG', 'Check CONNECTORS_CONFIG_PATH, endpoint allowlists and referenced credential environment variables.'); }
    }
    check(!env.AUDIT_SIGNING_KEY_FILE && !env.CONNECTOR_SECRET_HOST_DIR && !env.CONNECTOR_SECRET_ROOT,
      'ENVIRONMENT_CREDENTIALS', 'Inject signing/connector credentials through named environment variables; legacy credential file settings are unsupported.');
  }
  warnings.push('This is static configuration validation. It does not verify live databases, migrations, backups, TLS termination, provider contracts, model quality or production capacity.');
  return { ok: failures.length === 0, scope: 'production configuration preflight; no network or model calls', checks, failures, warnings: [...new Set(warnings)] };
}
function main(args = process.argv.slice(2)) {
  let envFile; let compose = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--env' && args[i + 1]) envFile = args[++i];
    else if (args[i] === '--compose') compose = true;
    else if (args[i] === '--help') { console.log('Usage: production-preflight.cjs --env ABSOLUTE_FILE [--compose]\nStatic, redacted checks. --compose also validates Docker Compose >=2.24.4 and the merged production manifest without starting services.'); return 0; }
    else { console.error('Unknown or incomplete option. Use --help.'); return 2; }
  }
  if (!envFile) { console.error('Provide --env with a completed production environment file.'); return 2; }
  let env;
  try { env = { ...process.env, ...readEnvironment(envFile) }; }
  catch (error) { console.error(error.message); return 1; }
  const result = validateProduction(env, { compose });
  if (compose) {
    const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 10000 });
    const parts = String(version.stdout || '').trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    const compatible = parts && (Number(parts[1]) > 2 || Number(parts[1]) === 2 && (Number(parts[2]) > 24 || Number(parts[2]) === 24 && Number(parts[3]) >= 4));
    if (!compatible) result.failures.push({ code: 'COMPOSE_VERSION', message: 'Install Docker Compose 2.24.4 or later for safe port-list replacement.' });
    else if (result.ok) {
      const rendered = spawnSync('docker', ['compose', '-f', 'docker/docker-compose-full-stack.yml', '-f', 'docker/docker-compose.production.yml', 'config', '--quiet'],
        { cwd: ROOT, env, encoding: 'utf8', timeout: 15000 });
      if (rendered.status !== 0) result.failures.push({ code: 'COMPOSE_CONFIG', message: 'Merged production Compose configuration failed validation; review required variables and mount paths locally. Output is suppressed to protect credentials.' });
    }
    result.ok = result.failures.length === 0;
    result.scope = 'static production configuration and Compose validation; no services started or providers contacted';
  }
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}
if (require.main === module) process.exitCode = main();
module.exports = { strongSecret, validateProduction, main };
