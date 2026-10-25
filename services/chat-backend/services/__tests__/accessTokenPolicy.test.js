const jwt = require('jsonwebtoken');
const { verifyConnectionToken, developmentTokensAllowed } = require('../accessTokenPolicy');

const env = { JWT_SECRET: 'connection-policy-synthetic-secret', DEPLOYMENT_TENANT_ID: 'chat-tenant' };
const sign = (claims, options = {}) => jwt.sign({ userId: 'customer-1', type: 'access', tenantId: 'chat-tenant', ...claims }, env.JWT_SECRET, options);

describe('socket connection tokens', () => {
  test('accepts access and development customer tokens for the deployment', () => {
    expect(verifyConnectionToken(sign({}), env).userId).toBe('customer-1');
    expect(verifyConnectionToken(sign({ type: 'websocket_auth', tenantId: undefined }), env).type).toBe('websocket_auth');
  });

  test.each([
    ['a refresh token', () => sign({ type: 'refresh' })],
    ['an evaluation delegation', () => sign({ purpose: 'quality_evaluation', aud: 'servicing-quality' })],
    ['another tenant', () => sign({ tenantId: 'other' })],
    ['no subject', () => sign({ userId: undefined })],
    ['a non-HS256 algorithm', () => sign({}, { algorithm: 'HS512' })],
  ])('refuses %s', (_label, token) => {
    expect(() => verifyConnectionToken(token(), env)).toThrow();
  });
});

test.each([
  [undefined, true], ['development', true], ['test', true],
  ['production', false], ['staging', false], ['uat', false], ['Production', false],
])('credential-free development tokens with NODE_ENV=%s: %s', (nodeEnv, allowed) => {
  expect(developmentTokensAllowed({ NODE_ENV: nodeEnv })).toBe(allowed);
});
