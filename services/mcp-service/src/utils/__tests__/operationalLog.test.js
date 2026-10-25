const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { PassThrough } = require('stream');
const winston = require('winston');
const logger = require('../logger');
const messages = require('../logMessages');
const { operationalLog } = require('../operationalLog');
const root = path.resolve(__dirname, '../../../../..');
const copies = [
  'services/api-gateway/utils/operationalLog.js',
  'services/ai-orchestrator/src/utils/operationalLog.js',
  'services/mcp-service/src/utils/operationalLog.js',
  'services/nlu-service/src/utils/operationalLog.js',
  'services/banking-service/utils/operationalLog.js',
  'services/chat-backend/services/operationalLog.js',
  'services/agent-ui/services/operationalLog.js'
];

test('all seven independently packaged services use the same operational logging boundary', () => {
  const canonical = fs.readFileSync(path.join(root, copies[0]), 'utf8');
  for (const file of copies) expect(fs.readFileSync(path.join(root, file), 'utf8') === canonical).toBe(true);
});

test.each(copies)('service log boundary removes arbitrary text and retains enumerated diagnostics: %s', file => {
  const { operationalLog: boundary } = require(path.join(root, file));
  const sensitive = randomBytes(32).toString('hex');
  const info = boundary({ level: 'security', message: 'HTTP Request', statusCode: 503, duration: 12,
    method: 'POST', outcome: 'uncertain', toolCount: 2, stack: sensitive, headers: { authorization: sensitive },
    url: sensitive, userId: sensitive, ip: sensitive, content: sensitive, accountNumber: sensitive,
    requestBody: { credential: sensitive }, durationText: sensitive, priority: sensitive, timestamp: sensitive,
    [Symbol.for('message')]: sensitive, [Symbol.for('splat')]: [sensitive]
  }, { service: 'test-service', messages });
  expect(JSON.stringify(info).includes(sensitive)).toBe(false);
  expect(info).toMatchObject({ level: 'security', message: 'HTTP Request', statusCode: 503, duration: 12, method: 'POST', outcome: 'uncertain', toolCount: 2 });
  expect(info[Symbol.for('message')]).toBeUndefined();
  expect(info[Symbol.for('splat')]).toBeUndefined();
  expect(boundary({ level: 'error', message: sensitive }, { service: 'test-service', messages }).message).toBe('Operational event');
});

test('the real MCP Winston transport never serializes raw errors, interpolation, headers or provider bodies', async () => {
  const sensitive = randomBytes(32).toString('hex');
  const stream = new PassThrough();
  let output = '';
  stream.on('data', chunk => { output += chunk.toString(); });
  logger.clear();
  logger.add(new winston.transports.Stream({ stream }));
  try {
    logger.info('HTTP Request', { method: 'POST', statusCode: 202, duration: 4,
      headers: { authorization: sensitive }, ip: sensitive, url: sensitive, providerResponse: { credential: sensitive }, stack: sensitive });
    logger.error(Object.assign(new Error(sensitive), { requestBody: { credential: sensitive } }));
    logger.warn('Provider response: %s', sensitive);
    await new Promise(resolve => setImmediate(resolve));
    expect(output.includes(sensitive)).toBe(false);
    const records = output.trim().split('\n').map(line => JSON.parse(line));
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ service: 'poc-mcp-service', message: 'HTTP Request', method: 'POST', statusCode: 202, duration: 4 });
    expect(records[1]).toMatchObject({ level: 'error', message: 'Operational event' });
    expect(records[2].message).toBe('Operational event');
  } finally { logger.close(); stream.end(); }
});

test('invalid measurements and enum strings are omitted instead of becoming untrusted log text', () => {
  const info = operationalLog({ level: 'invalid', message: 'HTTP Request', duration: NaN, count: -1,
    statusCode: '503', method: 'arbitrary', outcome: 'unknown', enabled: 'true' }, { service: 'test-service', messages });
  expect(Object.keys(info).sort()).toEqual(['level', 'message', 'service']);
});
