const { randomBytes } = require('crypto');
const winston = require('winston');
const { operationalLog } = require('../operationalLog');
const messages = require('../logMessages');

test('operational logging drops arbitrary text, identities, nested payloads and error details', () => {
    const sensitive = randomBytes(32).toString('hex');
    const info = operationalLog({ level: 'error', message: 'Message processing error',
        error: sensitive, stack: sensitive, headers: { authorization: sensitive }, url: sensitive,
        userId: sensitive, ip: sensitive, content: sensitive, messageContent: sensitive,
        duration: 12, statusCode: 503, method: 'POST', outcome: 'uncertain', priority: sensitive
    }, { service: 'poc-chat-backend', messages });
    expect(JSON.stringify(info).includes(sensitive)).toBe(false);
    expect(info).toMatchObject({ message: 'Message processing error', duration: 12, statusCode: 503, method: 'POST', outcome: 'uncertain' });
    expect(info).not.toHaveProperty('priority');
    expect(operationalLog({ level: 'warn', message: sensitive }, { service: 'poc-chat-backend', messages }).message).toBe('Operational event');
});

test('the Winston final format cannot serialize exception or debug payloads', () => {
    const sensitive = randomBytes(32).toString('hex');
    const format = winston.format.combine(winston.format.errors({ stack: true }),
        winston.format(info => operationalLog(info, { service: 'poc-chat-backend', messages }))(),
        winston.format.timestamp(), winston.format.json());
    const error = Object.assign(new Error(sensitive), { level: 'error', requestBody: { credential: sensitive } });
    const output = format.transform(error)[Symbol.for('message')];
    expect(output.includes(sensitive)).toBe(false);
    expect(JSON.parse(output)).toMatchObject({ message: 'Operational event', service: 'poc-chat-backend', level: 'error' });
});
