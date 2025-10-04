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