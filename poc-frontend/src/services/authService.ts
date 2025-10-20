import axios from 'axios';
import type { LoginRequest, LoginResponse, TokenPair, UserProfile } from '@/types';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'poc_access_token',
  REFRESH_TOKEN: 'poc_refresh_token',
  USER_PROFILE: 'poc_user_profile',
};

// Banking service URL for direct login (unauthenticated)
const BANKING_SERVICE_URL = import.meta.env.VITE_BANKING_SERVICE_URL || 'http://localhost:3010/api/v1';

class AuthService {
  /**
   * Login via banking service directly (unauthenticated)
   * This is the only direct API connection outside of poc-chat-backend
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await axios.post<LoginResponse>(
        `${BANKING_SERVICE_URL}/auth/login`,
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
        
        console.log('Login successful, storing user profile:', userProfile);
        this.setUserProfile(userProfile);
      }

      return data;
    } catch (error: any) {
      console.error('Login error:', error);
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
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    
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
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Get stored refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Get stored user profile
   */
  getUserProfile(): UserProfile | null {
    const profileStr = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
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
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    }
  }

  /**
   * Store user profile
   */
  private setUserProfile(profile: UserProfile): void {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  }

  /**
   * Refresh access token using refresh token
   * This would typically call the banking service or chat backend
   */
  async refreshToken(): Promise<TokenPair | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await axios.post<{ data: { tokens: TokenPair } }>(
        `${BANKING_SERVICE_URL}/auth/refresh`,
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
