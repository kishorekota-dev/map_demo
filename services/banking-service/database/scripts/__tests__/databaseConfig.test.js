const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('banking database configuration at process startup', () => {
  let directory;
  const configurationPath = path.resolve(__dirname, '../../config.js');
  const database = {
    DB_HOST: 'database.fixture.invalid', DB_NAME: 'banking_fixture',
    DB_USER: 'banking_fixture_role', DB_PASSWORD: 'Synthetic-Database-Fixture42!',
  };
  beforeAll(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'banking-config-')); });
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
  const load = env => spawnSync(process.execPath, ['-e', `
    const config = require(${JSON.stringify(configurationPath)}).database;
    console.log(JSON.stringify({ host: config.host, database: config.database, user: config.user,
      port: config.port, passwordMatches: config.password === process.env.DB_PASSWORD }));
  `], { cwd: directory, env, encoding: 'utf8', timeout: 5000 });

  test('rejects production with only a servicing DATABASE_URL instead of using host defaults', () => {
    const result = load({ NODE_ENV: 'production', DATABASE_URL: 'postgres://other-fixture.invalid/servicing' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production banking requires explicit nonempty database settings: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD.');
    expect(result.stdout).toBe('');
  });

  test('rejects each omitted or whitespace-only production setting without exposing configured values', () => {
    for (const key of Object.keys(database)) {
      for (const empty of [undefined, '  ']) {
        const env = { NODE_ENV: 'production', ...database };
        if (empty === undefined) delete env[key];
        else env[key] = empty;
        const result = load(env);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(`database settings: ${key}.`);
        expect(result.stdout).toBe('');
        for (const value of Object.values(database)) expect(result.stderr).not.toContain(value);
      }
    }
  });

  test('accepts an explicit production database and keeps the default PostgreSQL port', () => {
    const result = load({ NODE_ENV: 'production', ...database });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ host: database.DB_HOST, database: database.DB_NAME,
      user: database.DB_USER, port: 5432, passwordMatches: true });
    expect(result.stderr).toBe('');
  });

  test('preserves the documented development connection defaults', () => {
    const result = load({ NODE_ENV: 'development' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ host: 'localhost', database: 'poc_banking', user: 'postgres', port: 5432 });
  });
});
