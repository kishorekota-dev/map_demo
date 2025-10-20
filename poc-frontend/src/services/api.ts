import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import authService from './authService';
import { 
  ChatResponse, 
  AvailableIntent, 
  SystemStatus, 
  ChatHistory, 
  IntentAnalysis,
  ApiError,
  SessionResponse,
  SessionDetail,
  UserSessionsResponse,
  SessionResumeResponse,
  ConversationHistoryResponse,
  SendMessageRequest,
  MessageRecord,
} from '@/types';

// Chat backend URL - the only backend service we communicate with (except login)
const CHAT_BACKEND_URL = import.meta.env.VITE_CHAT_BACKEND_URL || 'http://localhost:3006';

class ApiService {
  private client: AxiosInstance;
  private sessionId: string | null = null;
  private baseURL: string;

  constructor() {
    this.baseURL = CHAT_BACKEND_URL;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - Add auth token and session ID
    this.client.interceptors.request.use(
      (config) => {
        // Add Authorization header
        const token = authService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add Session ID header if available
        if (this.sessionId) {
          config.headers['X-Session-ID'] = this.sessionId;
        }

        // Add Request ID for tracing
        config.headers['X-Request-ID'] = uuidv4();
        
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - Handle errors and token refresh
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized - try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newTokens = await authService.refreshToken();
            if (newTokens) {
              originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            window.location.href = '/auth';
            return Promise.reject(refreshError);
          }
        }

        const apiError: ApiError = {
          message: error.response?.data?.error || error.message || 'Unknown error',
          status: error.response?.status || 0,
          endpoint: error.config?.url,
          timestamp: new Date(),
        };

        console.error('API Response Error:', apiError);
        
        // Dispatch custom event for global error handling
        window.dispatchEvent(new CustomEvent('api:error', { detail: apiError }));
        
        return Promise.reject(apiError);
      }
    );
  }

  // ============================================
  // Session Management
  // ============================================

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  public async createSession(userId: string, metadata?: any): Promise<SessionResponse> {
    const response = await this.client.post<any>('/api/sessions', {
      userId,
      metadata,
    });
    
    // Backend returns sessionId in different places depending on implementation
    // Try root level first, then fall back to session.sessionId
    const sessionId = response.data.sessionId || response.data.session?.sessionId;
    
    if (sessionId) {
      this.sessionId = sessionId;
    }
    
    return {
      sessionId,
      userId,
      createdAt: response.data.timestamp || new Date().toISOString(),
      isActive: true,
      status: 'active'
    } as SessionResponse;
  }

  public async getSession(sessionId: string): Promise<SessionDetail> {
    const response = await this.client.get<SessionDetail>(`/api/sessions/${sessionId}`);
    return response.data;
  }

  public async getUserSessions(
    userId: string, 
    type: 'active' | 'unresolved' | 'recent' = 'active',
    limit?: number
  ): Promise<UserSessionsResponse> {
    const params = new URLSearchParams({ type });
    if (limit) params.append('limit', limit.toString());
    
    const response = await this.client.get<UserSessionsResponse>(
      `/api/users/${userId}/sessions?${params}`
    );
    return response.data;
  }

  public async resumeSession(sessionId: string): Promise<SessionResumeResponse> {
    const response = await this.client.post<SessionResumeResponse>(
      `/api/sessions/${sessionId}/resume`
    );
    
    this.sessionId = sessionId;
    return response.data;
  }

  public async endSession(sessionId: string, reason?: string): Promise<void> {
    await this.client.delete(`/api/sessions/${sessionId}`, {
      data: { reason },
    });
    
    if (this.sessionId === sessionId) {
      this.sessionId = null;
    }
  }

  public async resolveSession(sessionId: string, notes?: string): Promise<void> {
    await this.client.post(`/api/sessions/${sessionId}/resolve`, {
      notes,
    });
  }

  public async getConversationHistory(
    sessionId: string,
    offset: number = 0,
    limit: number = 50
  ): Promise<ConversationHistoryResponse> {
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });
    
    const response = await this.client.get<ConversationHistoryResponse>(
      `/api/sessions/${sessionId}/history?${params}`
    );
    return response.data;
  }

  // ============================================
  // Message Operations
  // ============================================

  public async sendMessage(
    message: string, 
    sessionId?: string,
    metadata?: any
  ): Promise<ChatResponse> {
    const requestData: SendMessageRequest = {
      content: message,
      type: 'text',
      metadata,
    };

    // Include sessionId if provided
    if (sessionId) {
      requestData.sessionId = sessionId;
    } else if (this.sessionId) {
      requestData.sessionId = this.sessionId;
    }

    // Add userId from auth
    const user = authService.getUserProfile();
    if (user) {
      requestData.userId = user.userId;
    }

    const response = await this.client.post<ChatResponse>('/api/chat/message', requestData);

    // Update session ID if backend returns one (auto-created)
    if (response.data.sessionId && response.data.sessionId !== this.sessionId) {
      this.sessionId = response.data.sessionId;
    }

    return response.data;
  }

  public async sendMessageInSession(
    sessionId: string,
    message: string,
    metadata?: any
  ): Promise<ChatResponse> {
    const requestData: SendMessageRequest = {
      content: message,
      type: 'text',
      metadata,
    };

    const response = await this.client.post<ChatResponse>(
      `/api/sessions/${sessionId}/messages`,
      requestData
    );

    return response.data;
  }

  // ============================================
  // Legacy Methods (for backward compatibility)
  // ============================================

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
    if (sessionId) {
      const history = await this.getConversationHistory(sessionId, offset, limit);
      return {
        messages: history.history.map(this.convertMessageRecordToChatMessage),
        session: {
          sessionId: history.sessionId,
          messageCount: history.count,
        },
      };
    }

    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });

    const response = await this.client.get(`/api/chat/history?${params}`);
    return response.data;
  }

  private convertMessageRecordToChatMessage(record: MessageRecord): any {
    return {
      id: record.message_id,
      messageId: record.message_id,
      content: record.content,
      type: record.direction === 'incoming' ? 'user' : 'bot',
      message: record.content,
      text: record.content,
      timestamp: record.created_at,
      intent: record.intent ? {
        detected: record.intent,
        name: record.intent,
        confidence: record.confidence_score || 0,
      } : undefined,
      metadata: {
        messageId: record.message_id,
        sequenceNumber: record.sequence_number,
      },
    };
  }

  // ============================================
  // System & Health
  // ============================================

  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  public async getSystemStatus(): Promise<SystemStatus> {
    const response = await this.client.get('/chat/status');
    return response.data.data;
  }

  public async getAvailableIntents(): Promise<AvailableIntent[]> {
    const response = await this.client.get('/chat/intents');
    return response.data.data.intents;
  }

  // ============================================
  // Utility Methods
  // ============================================

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
