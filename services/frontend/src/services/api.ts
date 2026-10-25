import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getRuntimeConfig } from '@/config/runtimeConfig';
import authService from '@/services/authService';
import type {
  ApiError,
  AvailableIntent,
  ChatHistory,
  ChatResponse,
  IntentAnalysis,
  SystemStatus,
} from '@/types';

export type ConversationChannel = 'digital' | 'ava' | 'ivr';
export interface ChannelHandoff { grant: string; expiresAt: string; sessionId: string; targetChannel: ConversationChannel }

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

const unwrapPayload = (value: any): any => value?.data?.data ?? value?.data ?? value;

const readApiErrorMessage = (error: AxiosError): string => {
  const data = error.response?.data as any;
  const nestedError = data?.error;

  if (typeof nestedError === 'string') return nestedError;
  if (typeof nestedError?.message === 'string') return nestedError.message;
  return data?.message || error.message || 'The request could not be completed.';
};

class ApiService {
  private client: AxiosInstance;
  private sessionId = uuidv4();
  private sessionOwnerId: string | null = null;
  private sessionInitialized = false;
  private sessionPromise: Promise<string> | null = null;
  private baseURL: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseURL = getRuntimeConfig().apiBaseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        config.headers['X-Session-ID'] = this.sessionId;
        config.headers['X-Request-ID'] = uuidv4();

        const accessToken = authService.getAccessToken();
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }

        if (import.meta.env.DEV) {
          console.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;
        const status = error.response?.status;

        if (status === 401 && originalRequest && !originalRequest._retried) {
          originalRequest._retried = true;
          const refreshed = await this.refreshAccessToken();

          if (refreshed) {
            if (originalRequest.headers) {
              delete originalRequest.headers.Authorization;
            }
            return this.client(originalRequest);
          }

          this.handleAuthFailure();
        }

        const apiError: ApiError = {
          message: readApiErrorMessage(error),
          status: status || 0,
          endpoint: originalRequest?.url,
          timestamp: new Date(),
        };

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('api:error', { detail: apiError }));
        }

        return Promise.reject(apiError);
      }
    );
  }

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

  private handleAuthFailure(): void {
    authService.logout();
    this.clearSession(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
  }

  private getUserProfile() {
    return authService.getUserProfile();
  }

  private getUserId(): string {
    return this.getUserProfile()?.userId || 'manual-user';
  }

  private sessionStorageKey(): string { return `servicing-chat:${getRuntimeConfig().tenantId}:${this.baseURL}:${this.getUserId()}`; }

  private rememberSession(): void {
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(this.sessionStorageKey(), this.sessionId); } catch { /* Browser storage may be disabled. */ }
  }

  private clearSession(forget = true): void {
    try { if (forget && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.sessionStorageKey()); } catch { /* No persistent browser state. */ }
    this.sessionId = uuidv4();
    this.sessionOwnerId = null;
    this.sessionInitialized = false;
    this.sessionPromise = null;
  }

  public generateSessionId(): string {
    return uuidv4();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.sessionOwnerId = this.getUserId();
    this.sessionInitialized = true;
    this.sessionPromise = null;
    this.rememberSession();
  }

  /** Create one canonical backend session and share the in-flight request. */
  public async ensureSession(): Promise<string> {
    const ownerId = this.getUserId();

    if (this.sessionInitialized && this.sessionOwnerId === ownerId) {
      return this.sessionId;
    }

    if (this.sessionOwnerId && this.sessionOwnerId !== ownerId) {
      this.clearSession(false);
    }

    if (!this.sessionPromise) {
      // Reuse only an account-scoped tab session after server ownership checks.
      let remembered: string | null = null;
      try { remembered = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(this.sessionStorageKey()) : null; } catch { /* Storage disabled. */ }
      if (remembered) {
        this.sessionPromise = this.client.get(`/sessions/${encodeURIComponent(remembered)}`)
          .then(() => { this.setSessionId(remembered!); return remembered!; })
          .catch(async (error: ApiError) => {
            if (![404, 410].includes(error.status || 0)) throw error;
            this.clearSession(); return this.ensureSession();
          }).finally(() => { this.sessionPromise = null; });
        return this.sessionPromise;
      }
      this.sessionPromise = this.client
        .post('/sessions', {
          userId: ownerId,
          userData: this.getUserProfile() || {},
          metadata: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        })
        .then((response) => {
          const payload = unwrapPayload(response.data);
          const sessionId = payload?.sessionId || payload?.session?.sessionId;

          if (!sessionId) {
            throw new Error('The chat service did not return a session ID.');
          }

          this.sessionId = sessionId;
          this.sessionOwnerId = ownerId;
          this.sessionInitialized = true;
          this.rememberSession();
          return sessionId;
        })
        .finally(() => {
          this.sessionPromise = null;
        });
    }

    return this.sessionPromise;
  }

  public async startNewSession(): Promise<string> {
    const previousSessionId = this.sessionInitialized ? this.sessionId : null;

    if (previousSessionId) {
      try {
        await this.client.delete(`/sessions/${encodeURIComponent(previousSessionId)}`, {
          data: { reason: 'new_conversation' },
        });
      } catch {
        // Expired sessions should not prevent a customer from starting over.
      }
    }

    this.clearSession();
    return this.ensureSession();
  }

  public async sendMessage(
    message: string,
    context?: Record<string, unknown>
  ): Promise<ChatResponse> {
    const sessionId = await this.ensureSession();
    const response = await this.client.post('/chat/message', {
      message,
      context: context || {},
      ...(context?.channel ? { metadata: { channel: context.channel } } : {}),
      sessionId,
    }, { timeout: getRuntimeConfig().chatRequestTimeoutMs });
    return this.mapChatResponse(unwrapPayload(response.data), sessionId);
  }

  private mapChatResponse(payload: any, sessionId: string): ChatResponse {
    if (typeof payload?.message === 'string' && payload?.conversation) {
      return payload as ChatResponse;
    }

    const outgoing = payload?.response || {};
    const intentName =
      outgoing?.metadata?.intent ||
      payload?.agentResult?.intent ||
      payload?.intent?.detected ||
      'general_inquiry';

    return {
      message: outgoing.content || outgoing.message || 'No response was returned.',
      intent: {
        detected: intentName,
        confidence: outgoing?.agentInfo?.confidence ?? payload?.intent?.confidence ?? 0.9,
        entities: payload?.intent?.entities || [],
      },
      response: {
        type: outgoing.type || outgoing?.metadata?.responseType || 'text',
        timestamp: outgoing.timestamp || new Date().toISOString(),
      },
      conversation: {
        sessionId: outgoing.sessionId || sessionId,
        messageId: outgoing.id || outgoing.messageId || uuidv4(),
      },
      metadata: {
        processingTime:
          outgoing?.agentInfo?.processingTime || payload?.agentResult?.processingTime,
      },
    };
  }

  public async getConversationChannel(sessionId = this.sessionId): Promise<ConversationChannel> {
    const response = await this.client.get(`/sessions/${encodeURIComponent(sessionId)}`);
    const channel = unwrapPayload(response.data)?.session?.metadata?.channel || 'digital';
    if (!['digital', 'ava', 'ivr'].includes(channel)) throw new Error('The conversation channel could not be verified.');
    return channel;
  }

  public async createChannelHandoff(targetChannel: ConversationChannel): Promise<ChannelHandoff> {
    const sessionId = await this.ensureSession();
    const response = await this.client.post(`/sessions/${encodeURIComponent(sessionId)}/handoff`, { targetChannel });
    return unwrapPayload(response.data);
  }

  public async resumeChannelHandoff(grant: string, targetChannel: ConversationChannel): Promise<{ sessionId: string; channel: ConversationChannel }> {
    // Never store grants in browser storage or URLs. Destination authentication
    // is supplied by the normal verified access-token interceptor.
    const response = await this.client.post('/sessions/resume', { grant, targetChannel });
    const result = unwrapPayload(response.data);
    if (result.channel !== targetChannel || typeof result.sessionId !== 'string') throw new Error('The destination conversation could not be verified.');
    this.setSessionId(result.sessionId);
    return { sessionId: result.sessionId, channel: result.channel };
  }

  public async getRecoveryContext(sessionId = this.sessionId): Promise<{ recoveryRequired: boolean }> {
    const chat = await this.client.get(`/sessions/${encodeURIComponent(sessionId)}`);
    const deliveryPending = unwrapPayload(chat.data)?.session?.state?.workflowRecoveryRequired === true;
    try {
      const response = await this.client.get(`/orchestrator/session/${encodeURIComponent(sessionId)}/context`);
      return { recoveryRequired: deliveryPending || unwrapPayload(response.data)?.recoveryRequired === true };
    } catch (error) {
      if ((error as ApiError).status === 404) return { recoveryRequired: deliveryPending };
      throw error;
    }
  }

  public async recoverConversation(): Promise<ChatResponse> {
    const sessionId = await this.ensureSession();
    const response = await this.client.post('/chat/recover', { sessionId }, { timeout: getRuntimeConfig().chatRequestTimeoutMs });
    return this.mapChatResponse(unwrapPayload(response.data), sessionId);
  }

  public async getChatHistory(
    sessionId?: string,
    offset = 0,
    limit = 50
  ): Promise<ChatHistory> {
    const activeSessionId = sessionId || (await this.ensureSession());
    const params = new URLSearchParams({
      sessionId: activeSessionId,
      offset: offset.toString(),
      limit: limit.toString(),
    });
    const response = await this.client.get(`/chat/history?${params}`);
    const payload = unwrapPayload(response.data);
    const messages = payload?.messages || payload?.history || [];

    return {
      messages,
      session: payload?.session || {
        sessionId: payload?.sessionId || activeSessionId,
        messageCount: payload?.count ?? messages.length,
      },
    };
  }

  public async resetConversation(): Promise<void> {
    await this.startNewSession();
  }

  public async analyzeMessage(message: string): Promise<IntentAnalysis> {
    const response = await this.client.post('/nlu/analyze', { user_input: message });
    const payload = unwrapPayload(response.data);
    return {
      detected: payload?.intent || payload?.detected || 'general_inquiry',
      confidence: payload?.confidence ?? 0,
      entities: payload?.entities || [],
    };
  }

  public async getAvailableIntents(): Promise<AvailableIntent[]> {
    const response = await this.client.get('/nlu/intents/available');
    const payload = unwrapPayload(response.data);
    return payload?.intents || payload?.banking || [];
  }

  public async getSystemStatus(): Promise<SystemStatus> {
    const response = await this.client.get('/health');
    return unwrapPayload(response.data) as SystemStatus;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  public async testConnection(): Promise<{ success: boolean; latency?: number }> {
    const startedAt = Date.now();
    const success = await this.checkHealth();
    return success ? { success: true, latency: Date.now() - startedAt } : { success: false };
  }

  public getBaseURL(): string {
    return this.baseURL;
  }

  public updateBaseURL(newBaseURL: string): void {
    this.baseURL = newBaseURL.replace(/\/$/, '');
    this.client.defaults.baseURL = this.baseURL;
    this.clearSession();
  }
}

const apiService = new ApiService();

export default apiService;
