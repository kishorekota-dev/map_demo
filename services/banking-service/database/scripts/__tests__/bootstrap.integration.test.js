const { Pool } = require('pg');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runMigrations } = require('../migrate');
const { runSeeds } = require('../seed');
const { bootstrap } = require('../bootstrap');
const { resetDatabase } = require('../reset');
const { provisionAdministrator } = require('../bootstrap-admin');
const bcrypt = require('bcryptjs');

const url = process.env.BANKING_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('banking bootstrap on disposable PostgreSQL', () => {
  let admin, database, name, temporary;
  const log = () => {};
  beforeAll(async () => {
    if (new URL(url).pathname !== '/banking_test') throw new Error('BANKING_TEST_DATABASE_URL must name the disposable banking_test database.');
    admin = new Pool({ connectionString: url });
    await admin.query('SELECT 1');
  });
  beforeEach(async () => {
    name = `banking_test_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(url); connection.pathname = `/${name}`;
    database = { connectionString: connection.toString() };
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'banking-bootstrap-'));
  });
  afterEach(async () => { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await fs.rm(temporary, { recursive: true, force: true }); });
  afterAll(async () => { if (admin) await admin.end(); });
  const query = async (sql, parameters) => { const pool = new Pool(database); try { return await pool.query(sql, parameters); } finally { await pool.end(); } };

  test('serializes concurrent migrations and seeds, preserves seeded balances on repeat, and fully resets owned tables', async () => {
    const migrations = await Promise.all([runMigrations({ database, log }), runMigrations({ database, log })]);
    expect(migrations.map(result => result.applied).sort((a,b) => a-b)).toEqual([0, 10]);
    const seeded = await Promise.all([runSeeds({ database }), runSeeds({ database })]);
    expect(seeded.filter(result => result.applied)).toHaveLength(1);
    expect(Number((await query('SELECT COUNT(*) FROM users')).rows[0].count)).toBeGreaterThan(5);
    await query('UPDATE accounts SET balance = 123.45 WHERE account_id = $1', ['660e8400-e29b-41d4-a716-446655449001']);
    expect((await runSeeds({ database })).applied).toBe(false);
    expect((await query('SELECT balance FROM accounts WHERE account_id = $1', ['660e8400-e29b-41d4-a716-446655449001'])).rows[0].balance).toBe('123.45');
    await resetDatabase({ database, env: { NODE_ENV: 'test', BANKING_ALLOW_DATABASE_RESET: 'true' }, confirmed: true });
    expect((await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows).toHaveLength(0);
    expect((await runMigrations({ database, log })).applied).toBe(10);
  }, 30000);

  test('orders V2 before V10 and rolls back failed SQL together with its history', async () => {
    await fs.writeFile(path.join(temporary, 'V1__create.sql'), 'CREATE TABLE ordered_steps (position INTEGER);');
    await fs.writeFile(path.join(temporary, 'V10__tenth.sql'), 'INSERT INTO ordered_steps VALUES (10);');
    await fs.writeFile(path.join(temporary, 'V2__second.sql'), 'INSERT INTO ordered_steps VALUES (2);');
    await runMigrations({ database, directory: temporary, log });
    expect((await query('SELECT position FROM ordered_steps')).rows.map(row => row.position)).toEqual([2, 10]);
    await fs.writeFile(path.join(temporary, 'V11__failure.sql'), 'CREATE TABLE partial_migration (id INTEGER); SELECT * FROM absent_fixture;');
    await expect(runMigrations({ database, directory: temporary, log })).rejects.toThrow('rolled back');
    expect((await query("SELECT to_regclass('partial_migration') AS name")).rows[0].name).toBeNull();
    expect((await query("SELECT 1 FROM flyway_schema_history WHERE version = '11'")).rowCount).toBe(0);
    await fs.writeFile(path.join(temporary, 'V2__second.sql'), 'INSERT INTO ordered_steps VALUES (200);');
    await expect(runMigrations({ database, directory: temporary, log })).rejects.toThrow('has changed');
  });

  test('failed demo seed leaves no partial writes, and an existing business record blocks demo seeding', async () => {
    await runMigrations({ database, log });
    await fs.writeFile(path.join(temporary, '01_fixture.sql'), "INSERT INTO users (email,password_hash,first_name,last_name) VALUES ('fixture@example.invalid','fixture','Test','User'); SELECT * FROM absent_fixture;");
    await expect(runSeeds({ database, directory: temporary })).rejects.toThrow();
    expect((await query('SELECT 1 FROM users')).rowCount).toBe(0);
    expect((await query("SELECT to_regclass('banking_demo_seed_history') AS name")).rows[0].name).toBeNull();
    await query("INSERT INTO users (email,password_hash,first_name,last_name) VALUES ('existing@example.invalid','fixture','Existing','User')");
    await expect(runSeeds({ database })).rejects.toThrow('empty banking database');
    expect((await query('SELECT 1 FROM users')).rowCount).toBe(1);
  });

  test('bootstrap defaults to migrations without demo users and blocks production seed/reset', async () => {
    await bootstrap({ database, env: { NODE_ENV: 'test', JWT_SECRET: require('crypto').randomBytes(32).toString('hex') }, log });
    expect((await query('SELECT 1 FROM users')).rowCount).toBe(0);
    const env = { NODE_ENV: 'production', JWT_SECRET: 'isolated-production-fixture-key-at-least32', BANKING_SEED_DEMO_DATA: 'true' };
    await expect(bootstrap({ database, env, log })).rejects.toThrow('cannot be enabled');
    await expect(runSeeds({ database, env })).rejects.toThrow('disabled in production');
    await expect(resetDatabase({ database, env, confirmed: true })).rejects.toThrow('disabled in production');
  });

  test('entrypoint never starts the application after a migration failure and undo exits unsuccessfully', async () => {
    await query('CREATE TABLE users (incompatible INTEGER)');
    const connection = new URL(database.connectionString);
    const environment = { ...process.env, NODE_ENV: 'test', DB_HOST: connection.hostname, DB_PORT: connection.port, DB_USER: decodeURIComponent(connection.username), DB_PASSWORD: decodeURIComponent(connection.password) || require('crypto').randomBytes(24).toString('hex'), DB_NAME: name, DB_SSL: 'false', BANKING_DB_READY_TIMEOUT_MS: '1000', BANKING_RUN_MIGRATIONS: 'true', BANKING_SEED_DEMO_DATA: 'false' };
    const service = path.resolve(__dirname, '../../..');
    const result = spawnSync('/bin/sh', [path.join(service, 'docker-entrypoint.sh'), process.execPath, '-e', 'process.stdout.write("APPLICATION_STARTED")'], { env: environment, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('APPLICATION_STARTED');
    expect(result.stderr).toContain('Banking startup blocked');
    const undo = spawnSync(process.execPath, [path.resolve(__dirname, '../migrate.js'), 'undo'], { env: environment, encoding: 'utf8' });
    expect(undo.status).toBe(1);
    expect(undo.stderr).toContain('rollback are not supported');
  });

  test('provisions an explicitly confirmed administrator without demo data and never resets an existing password', async () => {
    await runMigrations({ database, log });
    const env = { NODE_ENV: 'production', JWT_SECRET: 'isolated-admin-key-at-least32-characters', DEPLOYMENT_TENANT_ID: 'banking-fixture', BANKING_ADMIN_TENANT_ID: 'banking-fixture', BANKING_ADMIN_EMAIL: 'operator@example.invalid', BANKING_ADMIN_PASSWORD: 'Fixture-Only-Passphrase42!' };
    const created = await provisionAdministrator({ database, env });
    expect(created).toMatchObject({ created: true, roleGranted: true, username: 'operator@example.invalid', existingPasswordChanged: false });
    const before = (await query('SELECT password_hash FROM users WHERE user_id = $1', [created.userId])).rows[0].password_hash;
    expect(await bcrypt.compare(env.BANKING_ADMIN_PASSWORD, before)).toBe(true);
    const repeat = await provisionAdministrator({ database, env: { ...env, BANKING_ADMIN_PASSWORD: 'ignored' }, existingOnly: true });
    expect(repeat).toMatchObject({ created: false, roleGranted: false });
    expect((await query('SELECT password_hash FROM users WHERE user_id = $1', [created.userId])).rows[0].password_hash).toBe(before);
    const audit = (await query("SELECT details FROM audit_logs WHERE action = 'platform_admin_bootstrapped'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ actorType: 'deployment_cli', actor: 'platform-bootstrap-cli', role: 'control_plane_admin' });
    expect(JSON.stringify(audit)).not.toContain(env.BANKING_ADMIN_PASSWORD);
    expect((await query('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1', [created.userId])).rows).toEqual([{ name: 'CONTROL_PLANE_ADMIN' }]);
    await expect(provisionAdministrator({ database, env: { ...env, BANKING_ADMIN_TENANT_ID: 'wrong' } })).rejects.toThrow('confirm');
    await expect(provisionAdministrator({ database, env: { ...env, BANKING_ADMIN_EMAIL: 'missing@example.invalid' }, existingOnly: true })).rejects.toThrow('does not create');
    await expect(provisionAdministrator({ database, env: { ...env, BANKING_ADMIN_EMAIL: 'weak@example.invalid', BANKING_ADMIN_PASSWORD: 'weak' } })).rejects.toThrow('16–72');
    await query('UPDATE users SET is_locked = true WHERE user_id = $1', [created.userId]);
    await expect(provisionAdministrator({ database, env })).rejects.toThrow('active, unlocked');
  }, 10000);

  test('administrator CLI accepts secret input through stdin without echoing it and rejects password arguments', async () => {
    await runMigrations({ database, log });
    const connection = new URL(database.connectionString);
    const password = 'Synthetic-Input-Only42!';
    const environment = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'isolated-admin-key-at-least32-characters', DEPLOYMENT_TENANT_ID: 'banking-fixture', BANKING_ADMIN_TENANT_ID: 'banking-fixture', BANKING_ADMIN_EMAIL: 'stdin-operator@example.invalid', DB_HOST: connection.hostname, DB_PORT: connection.port, DB_USER: decodeURIComponent(connection.username), DB_PASSWORD: decodeURIComponent(connection.password) || require('crypto').randomBytes(24).toString('hex'), DB_NAME: name, DB_SSL: 'false' };
    delete environment.BANKING_ADMIN_PASSWORD;
    const script = path.resolve(__dirname, '../bootstrap-admin.js');
    const result = spawnSync(process.execPath, [script, '--password-stdin'], { env: environment, input: `${password}\n`, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ created: true, roleGranted: true });
    expect(result.stdout + result.stderr).not.toContain(password);
    const hash = (await query('SELECT password_hash FROM users WHERE email = $1', [environment.BANKING_ADMIN_EMAIL])).rows[0].password_hash;
    expect(await bcrypt.compare(password, hash)).toBe(true);
    const service = path.resolve(__dirname, '../../..');
    const smoke = spawnSync(process.execPath, ['-e', `
      const express = require('express'); const jwt = require('jsonwebtoken');
      const password = require('fs').readFileSync(0, 'utf8').trimEnd();
      const app = express(); app.use(express.json()); app.use('/auth', require('./routes/auth'));
      const server = app.listen(0, '127.0.0.1', async () => {
        try {
          const base = 'http://127.0.0.1:' + server.address().port;
          const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.BANKING_ADMIN_EMAIL, password }) });
          const body = await login.json();
          if (login.status !== 200) throw new Error('Bootstrap administrator login failed');
          const token = body.data.tokens.accessToken; const claims = jwt.verify(token, process.env.JWT_SECRET);
          const me = await fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
          if (me.status !== 200) throw new Error('Banking middleware rejected the issued access token');
          if ((await me.json()).data.id !== claims.userId) throw new Error('Profile does not match the authenticated administrator');
          console.log('AUTH_SMOKE:' + JSON.stringify({ roles: claims.roles, tenantId: claims.tenantId }));
        } catch (error) { console.error(error.message); process.exitCode = 1; }
        finally { await new Promise(resolve => server.close(resolve)); await require('./database').close(); }
      });
    `], { cwd: service, env: environment, input: password, encoding: 'utf8', timeout: 10000 });
    if (smoke.status !== 0) throw new Error(`Actual authentication smoke failed: ${smoke.stderr}`);
    expect(smoke.stdout).toContain('AUTH_SMOKE:{"roles":["control_plane_admin"],"tenantId":"banking-fixture"}');
    expect(smoke.stdout + smoke.stderr).not.toContain(password);
    const invalid = spawnSync(process.execPath, [script, '--password', password], { env: environment, encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Never put passwords in command arguments');
    expect(invalid.stdout + invalid.stderr).not.toContain(password);
  }, 10000);
});
