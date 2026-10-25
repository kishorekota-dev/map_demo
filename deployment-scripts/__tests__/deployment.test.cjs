'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { parseEnvironment } = require('../lib/environment.cjs');
const { validateProduction } = require('../production-preflight.cjs');
const { migrateComponent } = require('../migrate-servicing.cjs');
const ROOT = path.resolve(__dirname, '../..');
const secret = () => randomBytes(32).toString('hex');
function fixture(directory) {
  const db = secret(); const redis = secret();
  const env = { NODE_ENV: 'production', AUTH_PROVIDER: 'jwt', DEPLOYMENT_TENANT_ID: 'fixture-bank',
    JWT_SECRET: secret(), SERVICING_SERVICE_TOKEN: secret(), SESSION_SECRET: secret(), AUDIT_ACTOR_HASH_KEY: secret(),
    CONTROL_PLANE_ENABLED: 'true', CONTROL_PLANE_ENVIRONMENT: 'production', CHAT_PERSISTENCE_ENABLED: 'true',
    WORKFLOW_DURABLE_EXECUTION: 'true', CHECKPOINT_ENABLED: 'true', CHECKPOINT_BACKEND: 'postgres', CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'false', HANDOFF_STORAGE: 'postgres', FULFILLMENT_WORKER_ENABLED: 'true', INTERNAL_SERVICE_AUTH_REQUIRED: 'true',
    DATABASE_MANAGE_SCHEMA: 'false', CONTROL_PLANE_MANAGE_SCHEMA: 'false', OPERATIONS_MANAGE_SCHEMA: 'false',
    WORKFLOW_SCHEMA_AUTO_MIGRATE: 'false', HANDOFF_SCHEMA_AUTO_MIGRATE: 'false', BANKING_RUN_MIGRATIONS: 'false',
    POSTGRES_PASSWORD: db, REDIS_PASSWORD: redis, REDIS_URL: `redis://:${redis}@redis:6379`,
    FRONTEND_URL: 'https://assistant.test', ALLOWED_ORIGINS: 'https://assistant.test',
    CONTROL_PLANE_DATABASE_URL: `postgresql://poc_user:${db}@postgres:5432/poc_banking`,
    OPERATIONS_DATABASE_URL: `postgresql://poc_user:${db}@postgres:5432/poc_banking`,
    WORKFLOW_DATABASE_URL: `postgresql://poc_user:${db}@postgres:5432/ai_orchestrator`,
    HANDOFF_DATABASE_URL: `postgresql://poc_user:${db}@postgres:5432/poc_chat` };
  if (directory) {
    env.FRONTEND_RUNTIME_CONFIG_FILE = path.join(directory, 'runtime.json');
    env.LLM_PROVIDERS_HOST_FILE = path.join(directory, 'registry.json');
    env.CONNECTOR_SECRET_HOST_DIR = directory;
    fs.writeFileSync(env.FRONTEND_RUNTIME_CONFIG_FILE, JSON.stringify({ tenantId: env.DEPLOYMENT_TENANT_ID,
      apiBaseUrl: 'https://assistant.test/api', authBaseUrl: 'https://assistant.test/api/banking/v1',
      chatRequestTimeoutMs: 420000, features: { allowTokenAuth: false } }));
    fs.writeFileSync(env.LLM_PROVIDERS_HOST_FILE, '{"providers":[]}');
  }
  return env;
}
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'servicing-deployment-'));

test('environment loader preserves spaces and shell syntax as data without executing it', () => {
  const directory = temporary();
  try {
    const marker = path.join(directory, 'must-not-exist');
    const payload = `Acme "Bank" $(touch ${marker}) \`touch ${marker}\` & $HOME`;
    const file = path.join(directory, 'env');
    fs.writeFileSync(file, `ORG_NAME=${JSON.stringify(payload)}\n`);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'deployment-scripts/run-with-env.cjs'), file, process.execPath,
      '-e', 'process.stdout.write(JSON.stringify(process.env.ORG_NAME))'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), payload);
    assert.equal(fs.existsSync(marker), false);
    assert.throws(() => parseEnvironment('echo dangerous'), /Invalid environment assignment/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('an explicitly selected missing environment never executes a command against fallback configuration', () => {
  const directory = temporary();
  try {
    const result = spawnSync('bash', [path.join(ROOT, 'scripts/run-with-env.sh'), process.execPath, '-e', 'console.log("unexpected fallback command")'],
      { cwd: ROOT, env: { ...process.env, APP_ENV_FILE: path.join(directory, 'missing.env') }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /explicitly selected APP_ENV_FILE/);
    assert.doesNotMatch(result.stdout, /unexpected fallback command/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('example profile generates the canonical gateway login path', () => {
  const directory = temporary();
  try {
    const result = spawnSync(process.execPath, ['deployment-scripts/generate-enterprise-assets.mjs', '--output', directory], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'frontend-runtime-config.json'), 'utf8'));
    assert.equal(new URL(runtime.authBaseUrl + '/auth/login').pathname, '/api/banking/v1/auth/login');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('profile generation round-trips quoted branding and rejects environment-line injection', () => {
  const directory = temporary();
  try {
    const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/product/enterprise-profile.example.json')));
    profile.organizationName = 'Acme "Trusted" Bank $(echo ignored)';
    const file = path.join(directory, 'profile.json');
    const output = path.join(directory, 'out');
    fs.writeFileSync(file, JSON.stringify(profile));
    let run = spawnSync(process.execPath, ['deployment-scripts/generate-enterprise-assets.mjs', '--profile', file, '--output', output], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(parseEnvironment(fs.readFileSync(path.join(output, '.env.enterprise.generated'), 'utf8')).ORG_NAME, profile.organizationName);
    profile.organizationName = 'Bank\nJWT_SECRET=injected';
    fs.writeFileSync(file, JSON.stringify(profile));
    run = spawnSync(process.execPath, ['deployment-scripts/generate-enterprise-assets.mjs', '--profile', file, '--validate-only'], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /control characters/);
    assert.doesNotMatch(run.stderr, /JWT_SECRET=injected/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('profile validation rejects unsupported identity and credential-bearing service URLs', () => {
  const directory = temporary();
  try {
    const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/product/enterprise-profile.example.json')));
    profile.identity.provider = 'saml';
    profile.services.apiBaseUrl = 'https://user:private-value@assistant.test/api';
    const file = path.join(directory, 'profile.json'); fs.writeFileSync(file, JSON.stringify(profile));
    const run = spawnSync(process.execPath, ['deployment-scripts/generate-enterprise-assets.mjs', '--profile', file, '--validate-only'], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(run.status, 0); assert.match(run.stderr, /SAML broker is not implemented/);
    assert.match(run.stderr, /services.apiBaseUrl/); assert.doesNotMatch(run.stderr, /private-value/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('preflight accepts completed static configuration without importing runtime clients', () => {
  const directory = temporary();
  try { const result = validateProduction(fixture(directory), { compose: true }); assert.equal(result.ok, true, JSON.stringify(result.failures)); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('preflight rejects default secrets, secret reuse, disabled durability and incoherent deadlines without echoing values', () => {
  const env = fixture();
  env.JWT_SECRET = 'dev-jwt-secret-change-me-in-production-2024';
  env.SERVICING_SERVICE_TOKEN = env.JWT_SECRET;
  env.CHAT_PERSISTENCE_ENABLED = 'false';
  env.SERVICING_REQUEST_TIMEOUT_MS = '2000';
  const result = validateProduction(env, { checkFiles: false });
  assert.equal(result.ok, false);
  for (const code of ['JWT_SECRET', 'SERVICING_SERVICE_TOKEN', 'SECRET_SEPARATION', 'CHAT_PERSISTENCE_ENABLED', 'TIMEOUT_ORDER']) assert.ok(result.failures.some(item => item.code === code));
  assert.ok(!JSON.stringify(result).includes(env.JWT_SECRET));
  assert.ok(!JSON.stringify(result).includes(env.POSTGRES_PASSWORD));
});

test('preflight catches unreadable config paths and public secret fields', () => {
  const directory = temporary();
  try {
    const env = fixture(directory); fs.unlinkSync(env.LLM_PROVIDERS_HOST_FILE);
    const runtime = JSON.parse(fs.readFileSync(env.FRONTEND_RUNTIME_CONFIG_FILE)); runtime.apiSecret = 'must-not-be-printed';
    fs.writeFileSync(env.FRONTEND_RUNTIME_CONFIG_FILE, JSON.stringify(runtime));
    const result = validateProduction(env, { compose: true });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some(item => item.code === 'LLM_PROVIDERS_HOST_FILE'));
    assert.ok(result.failures.some(item => item.code === 'FRONTEND_SECRETS'));
    assert.doesNotMatch(JSON.stringify(result), /must-not-be-printed/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('preflight uses canonical model registry validation and permits an optional endpoint override', () => {
  const directory = temporary();
  try {
    const env = fixture(directory);
    fs.writeFileSync(env.LLM_PROVIDERS_HOST_FILE, JSON.stringify({ providers: [{ id: 'local', type: 'ollama', enabled: true,
      baseUrl: 'http://private-model:11434', baseUrlRef: 'OPTIONAL_ENDPOINT' }] }));
    assert.equal(validateProduction(env, { compose: true }).ok, true);
    for (const entry of [
      { id: 'local', type: 'ollama', enabled: true, baseUrl: 'https://name:private-value@host' },
      { id: 'local', type: 'ollama', enabled: true, arbitrarySecret: 'private-value' },
      { id: 'vertex', type: 'vertex_gemini', enabled: true, project: 'bad project', location: 'us-central1' }
    ]) {
      fs.writeFileSync(env.LLM_PROVIDERS_HOST_FILE, JSON.stringify({ providers: [entry] }));
      const result = validateProduction(env, { compose: true });
      assert.equal(result.ok, false); assert.ok(result.failures.some(item => item.code === 'LLM_REGISTRY'));
      assert.doesNotMatch(JSON.stringify(result), /private-value/);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('preflight accounts for NLU plus workflow inside the outer gateway deadline', () => {
  const env = fixture(); env.NLU_REQUEST_TIMEOUT_MS = '120000'; env.AGENT_RESPONSE_TIMEOUT = '400000'; env.SERVICING_REQUEST_TIMEOUT_MS = '410000';
  assert.ok(validateProduction(env, { checkFiles: false }).failures.some(item => item.code === 'TIMEOUT_ORDER'));
});

test('migration commits under an advisory lock and rolls back failures with redacted output', async () => {
  const calls = []; let ended = false; let fail = false;
  class Pool {
    on() {}
    async connect() { return { query: async sql => { calls.push(sql); if (fail && sql.startsWith('-- Control-plane')) throw new Error('password=private-value'); }, release() { calls.push('RELEASE'); } }; }
    async end() { ended = true; }
  }
  const env = { CONTROL_PLANE_DATABASE_URL: 'postgresql://owner:private-value@localhost/example' };
  assert.deepEqual(await migrateComponent('control-plane', env, Pool), { component: 'control-plane', status: 'applied' });
  assert.equal(calls[0], 'BEGIN'); assert.match(calls[2], /pg_advisory_xact_lock/); assert.ok(calls.includes('COMMIT')); assert.ok(ended);
  calls.length = 0; fail = true; ended = false;
  await assert.rejects(migrateComponent('control-plane', env, Pool), error => /migration failed/.test(error.message) && !error.message.includes('private-value'));
  assert.ok(calls.includes('ROLLBACK')); assert.ok(!calls.includes('COMMIT')); assert.ok(ended);
});

test('production Compose publishes only loopback ingress ports and preserves durable mounts', t => {
  const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8' });
  if (version.status !== 0) return t.skip('Docker Compose unavailable; static preflight still covered.');
  const directory = temporary();
  try {
    const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose-full-stack.yml', '-f', 'docker/docker-compose.production.yml', 'config', '--format', 'json'],
      { cwd: ROOT, env: { ...process.env, ...fixture(directory) }, encoding: 'utf8' });
    assert.equal(result.status, 0, 'Production Compose must render successfully (resolved content intentionally withheld).');
    const { services } = JSON.parse(result.stdout);
    for (const [name, service] of Object.entries(services)) {
      if (['frontend','api-gateway'].includes(name)) assert.deepEqual(service.ports.map(port => port.host_ip), ['127.0.0.1']);
      else assert.ok(!service.ports?.length, `${name} must not publish a host port`);
    }
    for (const name of ['api-gateway','banking-service','mcp-service','nlu-service','agent-ui','frontend']) assert.equal(services[name].user, 'node', `${name} must run as the non-root node user`);
    for (const name of ['ai-orchestrator','chat-backend']) assert.equal(services[name].user, undefined, `${name} must retain its image-defined non-root user`);
    assert.equal(services['banking-service'].environment.BANKING_SEED_DEMO_DATA, 'false');
    assert.equal(services['chat-backend'].environment.CHAT_PERSISTENCE_ENABLED, 'true');
    assert.ok(services.postgres.volumes.some(volume => volume.type === 'volume'));
    assert.ok(services.redis.volumes.some(volume => volume.type === 'volume'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('canonical servicing migrations apply twice and preserve records in disposable PostgreSQL', { skip: !process.env.DEPLOYMENT_TEST_DATABASE_URL }, async () => {
  const { components, loadPool } = require('../migrate-servicing.cjs');
  const Pool = loadPool();
  const admin = new Pool({ connectionString: process.env.DEPLOYMENT_TEST_DATABASE_URL, max: 1 });
  const database = `deployment_migrations_${randomBytes(8).toString('hex')}`;
  let target;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.DEPLOYMENT_TEST_DATABASE_URL); url.pathname = `/${database}`;
    const env = Object.fromEntries(Object.values(components).map(([variable]) => [variable, url.toString()]));
    for (const component of Object.keys(components)) await migrateComponent(component, env, Pool);
    target = new Pool({ connectionString: url.toString(), max: 1 });
    await target.query("INSERT INTO servicing_operations_records(tenant_id,kind,id,document) VALUES('migration-test','fixture','retained','{\"preserved\":true}')");
    for (const component of Object.keys(components)) await migrateComponent(component, env, Pool);
    assert.equal((await target.query("SELECT document->>'preserved' AS preserved FROM servicing_operations_records WHERE tenant_id='migration-test'")).rows[0].preserved, 'true');
    for (const table of ['servicing_control_plane_state','servicing_operations_jobs','ai_sessions','ai_workflow_executions','ai_human_feedback','servicing_tool_operations','servicing_graph_checkpoints','servicing_graph_writes','chat_sessions','chat_messages','servicing_resume_grants']) {
      assert.equal((await target.query('SELECT to_regclass($1) AS name', [table])).rows[0].name, table);
    }
  } finally {
    await target?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});

 test('preflight rejects process-local graph storage and a separately unmigrated checkpoint database', () => {
   const env = fixture(); env.CHECKPOINT_BACKEND = 'memory'; env.CHECKPOINT_DATABASE_URL = 'postgres://separate.invalid/graphs';
   const result = validateProduction(env,{ checkFiles: false });
   assert.ok(result.failures.some(item => item.code === 'CHECKPOINT_BACKEND'));
   assert.ok(result.failures.some(item => item.code === 'CHECKPOINT_DATABASE_URL'));
   assert.doesNotMatch(JSON.stringify(result),/separate.invalid/);
 });
