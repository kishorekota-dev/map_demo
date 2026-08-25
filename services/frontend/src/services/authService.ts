import axios from 'axios';
import { getRuntimeConfig } from '@/config/runtimeConfig';
import type { LoginRequest, LoginResponse, TokenPair, UserProfile } from '@/types';

const STORAGE_NAMESPACE = 'enterprise-chat';

const getStorageKey = (suffix: string): string => {
  const { tenantId } = getRuntimeConfig();
  return `${STORAGE_NAMESPACE}:${tenantId}:${suffix}`;
};

const buildAuthUrl = (path: string): string => {
  const baseUrl = getRuntimeConfig().authBaseUrl.replace(/\/$/, '');
  return `${baseUrl}${path}`;
};

class AuthService {
  private getErrorMessage(error: any, fallback: string): string {
    const responseError = error?.response?.data?.error;

    if (typeof responseError === 'string') {
      return responseError;
    }

    if (responseError && typeof responseError.message === 'string') {
      return responseError.message;
    }

    return error?.response?.data?.message || error?.message || fallback;
  }

  /**
   * Login via the configured authentication API directly (unauthenticated)
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await axios.post<LoginResponse>(
        buildAuthUrl('/auth/login'),
        credentials,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const { data } = response;
      const payload = data.data || (data.user && data.tokens
        ? {
            user: data.user,
            tokens: data.tokens,
            roles: data.user.roles || [],
          }
        : null);

      if (!payload?.user || !payload.tokens?.accessToken) {
        throw new Error('Authentication service returned an incomplete login response');
      }

      const userId = payload.user.userId || (payload.user as any).id;
      if (!userId) {
        throw new Error('Authentication service did not return a user ID');
      }

      // Normalize both the banking service's nested response and the supported
      // top-level LoginResponse shape before persisting any authentication data.
      const userProfile: UserProfile = {
        userId,
        username: payload.user.username,
        email: payload.user.email,
        firstName: payload.user.firstName,
        lastName: payload.user.lastName,
        roles: payload.roles || payload.user.roles || [],
        customerId: payload.user.customerId,
      };

      this.setTokens(payload.tokens);
      this.setUserProfile(userProfile);

      if (import.meta.env.DEV) {
        console.debug('Login successful, storing user profile:', userProfile);
      }

      return data;
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Login error:', error);
      }
      throw {
        message: this.getErrorMessage(
          error,
          'Login failed. Please check your credentials.'
        ),
        status: error.response?.status || 500,
      };
    }
  }

  /**
   * Set access token manually (for users who have a token already)
   */
  setManualToken(accessToken: string, userProfile?: Partial<UserProfile>): void {
    localStorage.setItem(getStorageKey('access_token'), accessToken);
    
    if (userProfile) {
      const profile: UserProfile = {
        userId: userProfile.userId || 'manual-user',
        username: userProfile.username || 'Manual User',
        email: userProfile.email,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        roles: userProfile.roles || [],
        customerId: userProfile.customerId,
      };
      this.setUserProfile(profile);
    }
  }

  /**
   * Logout user
   */
  logout(): void {
    localStorage.removeItem(getStorageKey('access_token'));
    localStorage.removeItem(getStorageKey('refresh_token'));
    localStorage.removeItem(getStorageKey('user_profile'));
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem(getStorageKey('access_token'));
  }

  /**
   * Get stored refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(getStorageKey('refresh_token'));
  }

  /**
   * Get stored user profile
   */
  getUserProfile(): UserProfile | null {
    const profileStr = localStorage.getItem(getStorageKey('user_profile'));
    if (!profileStr) return null;
    
    try {
      return JSON.parse(profileStr);
    } catch {
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Store tokens
   */
  private setTokens(tokens: TokenPair): void {
    localStorage.setItem(getStorageKey('access_token'), tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(getStorageKey('refresh_token'), tokens.refreshToken);
    }
  }

  /**
   * Store user profile
   */
  private setUserProfile(profile: UserProfile): void {
    localStorage.setItem(getStorageKey('user_profile'), JSON.stringify(profile));
  }

  /**
   * Refresh access token using refresh token
  * This would typically call the configured authentication service
   */
  async refreshToken(): Promise<TokenPair | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await axios.post<{
        data: { tokens?: TokenPair; accessToken?: string; expiresIn?: number | string }
      }>(
        buildAuthUrl('/auth/refresh'),
        { refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const payload = response.data.data;
      const tokens: TokenPair = payload.tokens || {
        accessToken: payload.accessToken || '',
        refreshToken,
        expiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : undefined,
      };

      if (!tokens.accessToken) {
        throw new Error('Authentication service did not return an access token');
      }

      this.setTokens(tokens);
      return tokens;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.logout();
      return null;
    }
  }

  /**
   * Validate token by checking if it's expired (basic JWT decode)
   */
  isTokenValid(candidateToken?: string | null): boolean {
    const token = candidateToken ?? this.getAccessToken();
    if (!token) return false;

    try {
      // Decode JWT (basic check without verification)
      const segment = token.split('.')[1];
      if (!segment) return false;

      const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));

      // Tokens without an expiry are not accepted by the protected UI.
      return typeof payload.exp === 'number' && Date.now() < payload.exp * 1000;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;
