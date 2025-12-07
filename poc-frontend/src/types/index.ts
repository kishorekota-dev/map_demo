// Core types for the chatbot application

export interface ChatMessage {
  id: string;
  content: string;
  type: 'user' | 'bot';
  timestamp: Date;
  intent?: IntentAnalysis;
  metadata?: MessageMetadata;
}

export interface IntentAnalysis {
  detected: string;
  confidence: number;
  entities?: Entity[];
}

export interface Entity {
  type: string;
  value: string;
  confidence: number;
}

export interface MessageMetadata {
  sessionId: string;
  messageId: string;
  processingTime?: number;
  responseType?: string;
}

export interface ChatResponse {
  message: string;
  intent: IntentAnalysis;
  response: {
    type: string;
    timestamp: string;
  };
  conversation: {
    sessionId: string;
    messageId: string;
  };
}

export interface AvailableIntent {
  name: string;
  category?: string;
  description?: string;
  examples?: string[];
}

export interface SystemStatus {
  status: 'healthy' | 'warning' | 'error';
  timestamp: string;
  system: {
    memory: {
      formatted: {
        heapUsed: string;
      };
    };
    process: {
      uptimeFormatted: string;
    };
    performance: {
      activeTimers: number;
    };
  };
  performance: any;
  modules: {
    intentDetector: boolean;
    responseGenerator: boolean;
  };
}

export interface ChatSettings {
  confidenceThreshold: number;
  enableSound: boolean;
  showIntentInfo: boolean;
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'error';
  lastCheck: Date;
  latency?: number;
}

export interface ApiError {
  message: string;
  status: number;
  endpoint?: string;
  timestamp: Date;
}

export interface ChatHistory {
  messages: ChatMessage[];
  session: {
    sessionId: string;
    messageCount: number;
  };
}

// Authentication types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    user: UserProfile;
    tokens: TokenPair;
    roles?: string[];
  };
  user?: UserProfile;
  tokens?: TokenPair;
  error?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface UserProfile {
  userId: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles?: string[];
  customerId?: string;
}

// Session types
export interface SessionDetail {
  id: string;
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  status?: string;
  messageCount?: number;
}

export interface PaginationParams {
  offset: number;
  limit: number;
  total?: number;
}