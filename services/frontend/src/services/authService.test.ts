import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import axios from 'axios';
import authService from './authService';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const createJwt = (payload: Record<string, unknown>): string => {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `test.${encodedPayload}.signature`;
};

const postMock = vi.mocked(axios.post);

describe('authService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    postMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('normalizes the banking login contract and persists tokens and profile', async () => {
    const responsePayload = {
      status: 'success',
      data: {
        user: {
          id: 'customer-42',
          username: 'ada',
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          customerId: 'bank-customer-42',
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
        roles: ['customer'],
      },
    };
    postMock.mockResolvedValue({ data: responsePayload });
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const result = await authService.login({ username: 'ada', password: 'correct-password' });

    expect(postMock).toHaveBeenCalledWith(
      'http://localhost:3005/api/v1/auth/login',
      { username: 'ada', password: 'correct-password' },
      expect.objectContaining({
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(result).toBe(responsePayload);
    expect(authService.getAccessToken()).toBe('access-token');
    expect(authService.getRefreshToken()).toBe('refresh-token');
    expect(authService.getUserProfile()).toEqual({
      userId: 'customer-42',
      username: 'ada',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      roles: ['customer'],
      customerId: 'bank-customer-42',
    });
  });

  test('normalizes and persists the supported top-level login response', async () => {
    const responsePayload = {
      success: true,
      user: {
        userId: 'customer-top-level',
        username: 'grace',
        roles: ['customer', 'verified'],
      },
      tokens: {
        accessToken: 'top-level-access-token',
        refreshToken: 'top-level-refresh-token',
      },
    };
    postMock.mockResolvedValue({ data: responsePayload });
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    await authService.login({ username: 'grace', password: 'correct-password' });

    expect(authService.getAccessToken()).toBe('top-level-access-token');
    expect(authService.getRefreshToken()).toBe('top-level-refresh-token');
    expect(authService.getUserProfile()).toMatchObject({
      userId: 'customer-top-level',
      username: 'grace',
      roles: ['customer', 'verified'],
    });
  });

  test('rejects an incomplete login response without persisting partial auth state', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        user: { userId: 'customer-42', username: 'ada' },
        tokens: { accessToken: '', refreshToken: 'orphaned-refresh-token' },
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      authService.login({ username: 'ada', password: 'correct-password' })
    ).rejects.toMatchObject({
      message: 'Authentication service returned an incomplete login response',
      status: 500,
    });

    expect(authService.getAccessToken()).toBeNull();
    expect(authService.getRefreshToken()).toBeNull();
    expect(authService.getUserProfile()).toBeNull();
  });

  test('accepts an unexpired JWT and rejects expired, malformed, or expiry-less tokens', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);

    expect(authService.isTokenValid(createJwt({ exp: 1_800_000_001 }))).toBe(true);
    expect(authService.isTokenValid(createJwt({ exp: 1_799_999_999 }))).toBe(false);
    expect(authService.isTokenValid(createJwt({ sub: 'customer-42' }))).toBe(false);
    expect(authService.isTokenValid('not-a-jwt')).toBe(false);
  });

  test('resets the auth store when the persisted token is expired', async () => {
    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const { default: freshAuthService } = await import('./authService');
    freshAuthService.setManualToken(
      createJwt({ exp: 1_799_999_999 }),
      { userId: 'customer-42', username: 'ada' }
    );
    const { useAuthStore } = await import('../stores/authStore');

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { userId: 'customer-42' },
    });

    useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      user: null,
    });
    expect(freshAuthService.getAccessToken()).toBeNull();
    expect(freshAuthService.getUserProfile()).toBeNull();
  });

  test('clears persisted auth when refresh fails', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        success: true,
        user: { userId: 'customer-42', username: 'ada' },
        tokens: {
          accessToken: 'stale-access-token',
          refreshToken: 'stale-refresh-token',
        },
      },
    });
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    await authService.login({ username: 'ada', password: 'correct-password' });
    postMock.mockRejectedValueOnce(new Error('refresh unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(authService.refreshToken()).resolves.toBeNull();

    expect(authService.getAccessToken()).toBeNull();
    expect(authService.getRefreshToken()).toBeNull();
    expect(authService.getUserProfile()).toBeNull();
  });
});
