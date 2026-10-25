const fs = require('fs'); const os = require('os'); const path = require('path');
const { databaseTls, pgOptions } = require('../tls');
test('TLS is verified by default, supports enterprise CA, and production rejects insecure settings', () => {
  expect(databaseTls({ DB_SSL: 'true' })).toEqual({ rejectUnauthorized: true });
  expect(databaseTls({})).toBe(false);
  expect(() => databaseTls({ DB_SSL: 'yes' })).toThrow('true or false');
  expect(() => databaseTls({ NODE_ENV: 'production', DB_SSL_REJECT_UNAUTHORIZED: 'false' })).toThrow('Production');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'servicing-ca-')); const file = path.join(directory, 'ca.pem');
  try { fs.writeFileSync(file, 'test enterprise CA'); expect(databaseTls({ DB_SSL: 'true', DB_SSL_CA_FILE: file })).toEqual({ rejectUnauthorized: true, ca: 'test enterprise CA' }); }
  finally { fs.rmSync(directory, { recursive: true }); }
});
test('server TLS policy applies to URL pools and cannot be downgraded by pg URL parameters', () => {
  const options = pgOptions('postgres://user:password@db/service?sslmode=no-verify&application_name=servicing', {}, { NODE_ENV: 'production', DB_SSL: 'true' });
  expect(options.ssl).toEqual({ rejectUnauthorized: true });
  expect(options.connectionString).not.toContain('sslmode'); expect(options.connectionString).toContain('application_name');
  expect(() => pgOptions('postgres://db/service?sslmode=no-verify', {}, { NODE_ENV: 'production' })).toThrow('verification');
  expect(pgOptions(undefined, { host: 'db' }, { DB_SSL: 'false' })).toEqual({ host: 'db', ssl: false });
});
