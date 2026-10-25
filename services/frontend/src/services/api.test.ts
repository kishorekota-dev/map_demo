import { beforeEach, describe, expect, test, vi } from 'vitest';

const clientMocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

const runtime = vi.hoisted(() => ({ apiBaseUrl: 'http://localhost:3001/api', chatRequestTimeoutMs: 420000 }));

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
  getRuntimeConfig: () => runtime,
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
import axios from 'axios';

describe('apiService NLU contract', () => {
  beforeEach(() => {
    clientMocks.post.mockReset();
    runtime.chatRequestTimeoutMs = 420000;
  });

  test('allows the configured multi-stage chat budget while ordinary API calls keep their 30-second timeout', async () => {
    runtime.chatRequestTimeoutMs = 480000;
    apiService.setSessionId('canonical-session');
    clientMocks.post.mockResolvedValue({ data: { message: 'Ready', conversation: { sessionId: 'canonical-session' } } });
    await apiService.sendMessage('help with servicing');
    expect(clientMocks.post).toHaveBeenCalledWith('/chat/message', {
      message: 'help with servicing', context: {}, sessionId: 'canonical-session',
    }, { timeout: 480000 });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30000 }));
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
