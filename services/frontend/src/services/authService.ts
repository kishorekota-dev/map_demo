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

      // Store tokens and user profile
      if (data.data?.tokens) {
        this.setTokens(data.data.tokens);
        
        // Ensure user profile has all required fields
        const userProfile: UserProfile = {
          userId: data.data.user.userId || (data.data.user as any).id,
          username: data.data.user.username,
          email: data.data.user.email,
          firstName: data.data.user.firstName,
          lastName: data.data.user.lastName,
          roles: data.data.roles || [],
          customerId: data.data.user.customerId,
        };
        
        if (import.meta.env.DEV) {
          console.debug('Login successful, storing user profile:', userProfile);
        }
        this.setUserProfile(userProfile);
      }

      return data;
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Login error:', error);
      }
      throw {
        message: error.response?.data?.error || 'Login failed. Please check your credentials.',
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
      const response = await axios.post<{ data: { tokens: TokenPair } }>(
        buildAuthUrl('/auth/refresh'),
        { refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const { tokens } = response.data.data;
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
  isTokenValid(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      // Decode JWT (basic check without verification)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000; // Convert to milliseconds
      return Date.now() < expiry;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;
