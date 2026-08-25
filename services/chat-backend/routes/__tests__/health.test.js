const express = require('express');
const request = require('supertest');
const healthRoutes = require('../health');

describe('chat health routes', () => {
  test('serves health at the documented mount root', async () => {
    const app = express();
    app.use('/health', healthRoutes);

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      service: 'poc-chat-backend'
    });
  });

  test('reports an enabled database failure as unhealthy', async () => {
    const app = express();
    app.locals.services = {
      databaseService: {
        getHealthStatus: jest.fn().mockResolvedValue({
          status: 'unhealthy',
          connected: false,
          error: 'connection lost'
        })
      }
    };
    app.use('/health', healthRoutes);

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'unhealthy',
      services: {
        database: {
          status: 'unhealthy',
          connected: false
        }
      }
    });
  });
});
