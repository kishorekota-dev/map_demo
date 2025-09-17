// Type definitions for the Enterprise Banking ChatBot

// Authentication and User Types
export interface AuthenticationContext {
  token: string;
  sessionId: string;
  userId: string;
  customerId: string;
  email: string;
  role: UserRole;
  permissions: string[];
  accountIds: string[];
  isAuthenticated: boolean;
  expiresAt: Date;
  lastActivity: Date;
  paymentLimits: PaymentLimits;
}

export interface UserProfile {
  userId: string;
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accountIds: string[];
  permissions: string[];
  chatbotAccess: boolean;
  paymentLimits: PaymentLimits;
  securitySettings: SecuritySettings;
}

export interface PaymentLimits {
  daily: number;
  transaction: number;
}

export interface SecuritySettings {
  mfaEnabled: boolean;
  sessionTimeout: number;
  maxSessions: number;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER' | 'GUEST';

// Enhanced authentication request/response types
export interface AuthenticationRequest {
  email: string;
  password: string;
  sessionMetadata?: {
    userAgent?: string;
    ipAddress?: string;
    deviceId?: string;
  };
}

export interface AuthenticationResponse {
  success: boolean;
  token?: string;
  sessionId?: string;
  user?: UserProfile;
  error?: string;
  code?: string;
}

// Session management types
export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  metadata: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  intent?: DetectedIntent;
  mcpAction?: MCPAction;
  status?: 'pending' | 'completed' | 'error';
  metadata?: Record<string, any>;
}

export interface DetectedIntent {
  name: string;
  displayName: string;
  confidence: number;
  parameters?: Record<string, any>;
  fulfillmentText?: string;
  category: IntentCategory;
}

export type IntentCategory = 
  | 'authentication'
  | 'account_inquiry'
  | 'payment'
  | 'card_management'
  | 'dispute'
  | 'fraud_report'
  | 'general_inquiry'
  | 'customer_service'
  | 'transaction_history'
  | 'balance_inquiry'
  | 'profile_management';

export interface MCPAction {
  tool: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface ChatSession {
  id: string;
  userId?: string;
  isAuthenticated: boolean;
  authContext?: AuthenticationContext;
  userRole?: UserRole;
  messages: ChatMessage[];
  context: SessionContext;
  startTime: Date;
  lastActivity: Date;
}

export interface SessionContext {
  currentIntent?: string;
  conversationFlow?: string;
  collectedData?: Record<string, any>;
  awaitingConfirmation?: boolean;
  multiStepProcess?: MultiStepProcess;
  customerInfo?: CustomerContext;
}

export interface MultiStepProcess {
  processType: 'payment' | 'card_application' | 'dispute_filing' | 'profile_update';
  currentStep: number;
  totalSteps: number;
  stepData: Record<string, any>;
  isComplete: boolean;
}

export interface CustomerContext {
  customerId?: string;
  customerNumber?: string;
  name?: string;
  email?: string;
  accountSummary?: AccountSummary[];
  preferredLanguage?: string;
}

export interface AccountSummary {
  accountId: string;
  accountType: string;
  balance: number;
  status: string;
  lastActivity: Date;
}

export interface DialogFlowConfig {
  projectId: string;
  sessionId: string;
  languageCode: string;
  credentials?: any;
}

export interface MCPClientConfig {
  serverPath?: string;
  apiBaseUrl: string;
  mcpServerUrl?: string;
  timeout: number;
  retryAttempts: number;
  transport?: 'stdio' | 'http';
}

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools: string[];
}

export interface ConversationFlow {
  id: string;
  name: string;
  steps: FlowStep[];
  conditions?: FlowCondition[];
}

export interface FlowStep {
  id: string;
  name: string;
  type: 'prompt' | 'action' | 'condition' | 'data_collection';
  content: string;
  actions?: MCPAction[];
  nextStep?: string;
  validationRules?: ValidationRule[];
}

export interface FlowCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: any;
  nextStep: string;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'email' | 'phone' | 'ssn' | 'amount' | 'date';
  message: string;
  pattern?: string;
}

export interface ChatBotState {
  currentSession: ChatSession | null;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  config: {
    dialogFlow: DialogFlowConfig;
    mcp: MCPClientConfig;
    agent: AgentConfig;
  };
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  intent: string;
  parameters?: Record<string, any>;
  category: IntentCategory;
}

export interface SuggestedReply {
  text: string;
  intent?: string;
  confidence?: number;
}
