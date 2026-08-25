import { beforeEach, describe, expect, test, vi } from 'vitest';

const clientMocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: clientMocks.post,
      get: clientMocks.get,
      delete: clientMocks.delete,
      defaults: {},
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

vi.mock('@/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    apiBaseUrl: 'http://localhost:3001/api',
  }),
}));

vi.mock('@/services/authService', () => ({
  default: {
    getAccessToken: vi.fn(() => null),
    getUserProfile: vi.fn(() => null),
    refreshToken: vi.fn(),
    logout: vi.fn(),
  },
}));

import apiService from './api';

describe('apiService NLU contract', () => {
  beforeEach(() => {
    clientMocks.post.mockReset();
  });

  test('sends the NLU analyze endpoint its required user_input field', async () => {
    clientMocks.post.mockResolvedValue({
      data: {
        data: {
          intent: 'balance_inquiry',
          confidence: 0.97,
          entities: [],
        },
      },
    });

    await expect(apiService.analyzeMessage('show my balance')).resolves.toEqual({
      detected: 'balance_inquiry',
      confidence: 0.97,
      entities: [],
    });
    expect(clientMocks.post).toHaveBeenCalledWith('/nlu/analyze', {
      user_input: 'show my balance',
    });
  });
});
