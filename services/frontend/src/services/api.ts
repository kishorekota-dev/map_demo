import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getRuntimeConfig } from '@/config/runtimeConfig';
import authService from '@/services/authService';
import { 
  ChatResponse, 
  AvailableIntent, 
  SystemStatus, 
  ChatHistory, 
  IntentAnalysis,
  ApiError 
} from '@/types';

// Extend the axios request config so we can flag a request that has already
// been retried after a 401, preventing infinite refresh/retry loops.
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

class ApiService {
  private client: AxiosInstance;
  private sessionId: string;
  private baseURL: string;
  // Holds the in-flight refresh request so that multiple concurrent 401s share
  // a single token refresh instead of each firing their own.
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseURL = getRuntimeConfig().apiBaseUrl.replace(/\/$/, '');
    this.sessionId = this.generateSessionId(); // temporary until we create a real session
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    
    // Initialize a real session with the backend
    this.initializeSession();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers['X-Session-ID'] = this.sessionId;
        config.headers['X-Request-ID'] = uuidv4();

        const accessToken = authService.getAccessToken();
        if (accessToken) {
          config.headers['Authorization'] = `Bearer ${accessToken}`;
        }
        
        if (import.meta.env.DEV) {
          console.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (import.meta.env.DEV) {
          console.debug(`API Response: ${response.status} ${response.config.url}`);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;
        const status = error.response?.status;

        // Automatic 401 handling: attempt a single token refresh and retry the
        // original request. If refresh succeeds, the request is replayed with a
        // fresh Authorization header (added by the request interceptor). If it
        // fails (or there is no refresh token), the user is logged out.
        if (status === 401 && originalRequest && !originalRequest._retried) {
          originalRequest._retried = true;

          const refreshed = await this.refreshAccessToken();

          if (refreshed) {
            // Drop any stale Authorization header so the request interceptor
            // re-attaches the newly minted access token on the replay.
            if (originalRequest.headers) {
              delete originalRequest.headers['Authorization'];
            }
            return this.client(originalRequest);
          }

          // Refresh failed -> force a clean logout so route guards redirect.
          this.handleAuthFailure();
        }

        const apiError: ApiError = {
          message:
            (error.response?.data as any)?.message || error.message || 'Unknown error',
          status: status || 0,
          endpoint: originalRequest?.url,
          timestamp: new Date(),
        };

        console.error('API Response Error:', apiError);

        // Dispatch custom event for global error handling
        window.dispatchEvent(new CustomEvent('api:error', { detail: apiError }));

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Refresh the access token, coalescing concurrent callers onto a single
   * refresh request. Returns true when a new access token is available.
   *
   * NOTE: This relies on authService.refreshToken(), which calls the auth
   * service's POST /auth/refresh endpoint using the stored refresh token. If no
   * refresh token is present (e.g. manual-token auth), refreshToken() returns
   * null and this resolves to false, triggering a logout-on-401 flow.
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = authService
        .refreshToken()
        .then((tokens) => tokens !== null)
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  /**
   * Clear stored credentials and notify the app so the Zustand auth store can
   * react (redirecting to /auth). Decoupled from the router via a window event
   * to keep this service free of React/router dependencies.
   */
  private handleAuthFailure(): void {
    authService.logout();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  public generateSessionId(): string {
    return uuidv4();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private getUserProfile() {
    return authService.getUserProfile();
  }

  private getUserId(): string {
    return this.getUserProfile()?.userId || 'manual-user';
  }

  // Initialize a session with the backend
  private async initializeSession(): Promise<void> {
    try {
      const userProfile = this.getUserProfile();

      const response = await this.client.post('/sessions', {
        userId: this.getUserId(),
        userData: userProfile || {},
        metadata: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      });

      if (response.data.sessionId) {
        this.sessionId = response.data.sessionId;
        if (import.meta.env.DEV) {
          console.debug('Session initialized:', this.sessionId);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to initialize session, using temporary ID:', error);
      }
      // Keep the temporary session ID if backend is unavailable
    }
  }

  // Chat endpoints
  public async sendMessage(message: string, context?: Record<string, any>): Promise<ChatResponse> {
    const response = await this.client.post('/chat/message', {
      message,
      context: context || {},
    });

    return response.data.data;
  }

  public async analyzeMessage(message: string): Promise<IntentAnalysis> {
    const response = await this.client.post('/chat/analyze', {
      message,
    });

    return response.data.data;
  }

  public async getChatHistory(
    sessionId?: string,
    offset: number = 0,
    limit: number = 10
  ): Promise<ChatHistory> {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });

    if (sessionId) {
      params.append('sessionId', sessionId);
    }

    const response = await this.client.get(`/chat/history?${params}`);
    return response.data.data;
  }

  public async resetConversation(sessionId?: string): Promise<void> {
    const params = sessionId ? { sessionId } : {};
    await this.client.delete('/chat/reset', { data: params });
  }

  // Intent endpoints
  public async getAvailableIntents(): Promise<AvailableIntent[]> {
    const response = await this.client.get('/chat/intents');
    return response.data.data.intents;
  }

  // System endpoints
  public async getSystemStatus(): Promise<SystemStatus> {
    const response = await this.client.get('/chat/status');
    return response.data.data;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // Utility methods
  public async testConnection(): Promise<{ success: boolean; latency?: number }> {
    const startTime = Date.now();
    
    try {
      await this.checkHealth();
      const latency = Date.now() - startTime;
      return { success: true, latency };
    } catch {
      return { success: false };
    }
  }

  public getBaseURL(): string {
    return this.baseURL;
  }

  public updateBaseURL(newBaseURL: string): void {
    this.baseURL = newBaseURL;
    this.client.defaults.baseURL = newBaseURL;
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;