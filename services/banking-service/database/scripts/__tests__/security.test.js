const { getJwtSecret } = require('../../../config/security');
const { databaseTls } = require('../../config');

describe('banking deployment security', () => {
  test.each([undefined, '', 'short', 'dev-jwt-secret-change-in-production', 'your-super-secret-jwt-key-change-in-production'])('rejects missing or placeholder production JWT key: %s', secret => {
    expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow('Production banking requires');
  });
  test('accepts an explicitly configured production key without replacing it', () => {
    const secret = 'isolated-security-fixture-key-32-characters';
    expect(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toBe(secret);
  });
  test('TLS verifies certificates unless explicitly relaxed outside production', () => {
    expect(databaseTls({ DB_SSL: 'true' })).toEqual({ rejectUnauthorized: true });
    expect(databaseTls({ NODE_ENV: 'test', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' })).toEqual({ rejectUnauthorized: false });
    expect(() => databaseTls({ NODE_ENV: 'production', DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' })).toThrow('Production banking does not allow');
    expect(databaseTls({ DB_SSL: 'false' })).toBe(false);
    expect(() => databaseTls({ DB_SSL: 'tru' })).toThrow('must be true or false');
  });
});
