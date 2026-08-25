const request = require('supertest');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const nluServer = require('../../server');

describe('NLU training API contract', () => {
  test('returns 501 for valid training data instead of claiming training started', async () => {
    const response = await request(nluServer.app)
      .post('/api/nlu/train')
      .send({
        trainingData: [
          { message: 'Show my balance', intent: 'balance_inquiry' }
        ]
      })
      .expect(501);

    expect(response.body).toEqual({
      success: false,
      code: 'NLU_TRAINING_UNSUPPORTED',
      error: 'Runtime NLU model training is not supported by this service.'
    });
  });

  test('validates malformed training data before returning unsupported', async () => {
    const response = await request(nluServer.app)
      .post('/api/nlu/train')
      .send({
        trainingData: [
          { message: 'Show my balance' }
        ]
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Validation failed'
    });
  });

  test('does not advertise runtime training in service metadata', async () => {
    const serviceInfo = await request(nluServer.app)
      .get('/api')
      .expect(200);

    expect(serviceInfo.body.endpoints).not.toHaveProperty('train');
    expect(serviceInfo.body.capabilities).not.toContain('Training Data Management');

    const capabilities = await request(nluServer.app)
      .get('/api/nlu/capabilities')
      .expect(200);

    expect(capabilities.body.data.endpoints).not.toHaveProperty('train');
  });
});
