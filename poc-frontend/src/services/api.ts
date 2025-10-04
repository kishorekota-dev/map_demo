import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { 
  ChatResponse, 
  AvailableIntent, 
  SystemStatus, 
  ChatHistory, 
  IntentAnalysis,
  ApiError 
} from '@/types';

class ApiService {
  private client: AxiosInstance;
  private sessionId: string;
  private baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
    this.sessionId = this.generateSessionId();
    
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
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers['X-Session-ID'] = this.sessionId;
        config.headers['X-Request-ID'] = uuidv4();
        
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
        console.log(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || 'Unknown error',
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

  public generateSessionId(): string {
    return uuidv4();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  // Chat endpoints
  public async sendMessage(message: string, context?: Record<string, any>): Promise<ChatResponse> {
    const response = await this.client.post('/chat/message', {
      message,
      context: context || {},
    });

    // Backend returns data directly, not wrapped in data.data
    return response.data;
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