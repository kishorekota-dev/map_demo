// Core types for the chatbot application

// ============================================
// Authentication Types
// ============================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  status: string;
  data: {
    user: UserProfile;
    tokens: TokenPair;
    roles: string[];
    permissions: string[];
  };
  metadata?: ResponseMetadata;
}

export interface UserProfile {
  userId: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  customerId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  processingTime?: number;
}

// ============================================
// Session Types
// ============================================

export interface SessionResponse {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
  status: 'active' | 'pending' | 'resolved' | 'expired' | 'terminated';
}

export interface SessionDetail extends SessionResponse {
  lastActivity: string;
  messageCount: number;
  conversationContext?: any;
  metadata?: any;
  isResolved?: boolean;
}

export interface UserSessionsResponse {
  userId: string;
  type: 'active' | 'unresolved' | 'recent';
  count: number;
  sessions: SessionDetail[];
}

export interface SessionResumeResponse {
  success: boolean;
  sessionId: string;
  session: {
    userId: string;
    isActive: boolean;
    lastActivity: string;
    messageCount: number;
    conversationContext?: any;
  };
  history: MessageRecord[];
  message: string;
  timestamp: string;
}

export interface MessageRecord {
  message_id: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  message_type?: string;
  intent?: string;
  confidence_score?: number;
  created_at: string;
  sequence_number?: number;
}

export interface ConversationHistoryResponse {
  sessionId: string;
  history: MessageRecord[];
  count: number;
  hasMore: boolean;
  timestamp: string;
}

export interface SendMessageRequest {
  content: string;
  type?: 'text' | 'image' | 'file' | 'action';
  metadata?: any;
  sessionId?: string;
  userId?: string;
}

// ============================================
// Message & Chat Types
// ============================================

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
  agentsInvolved?: string[];
  isError?: boolean;
}

export interface ChatResponse {
  sessionId: string;
  message: {
    id: string;
    sessionId: string;
    userId: string;
    content: string;
    type: string;
    timestamp: string;
    direction: string;
    metadata: any;
    processing: any;
  };
  response: {
    id: string;
    sessionId: string;
    userId: string;
    content: string;
    type: string;
    timestamp: string;
    direction: string;
    agentInfo: {
      agentId: string;
      agentType: string;
      confidence: number | null;
      processingTime: number | null;
    };
    metadata: any;
  };
  agent: {
    type: string;
    confidence: number;
    agentsInvolved?: string[];
  };
  timestamp: string;
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

export interface PaginationParams {
  offset: number;
  limit: number;
  total?: number;
}