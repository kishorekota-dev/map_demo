// Shared types and interfaces for Credit Card Enterprise system

export interface User {
  id: string;
  email: string;
  role: UserRole;
  permissions: string[];
  createdAt: Date;
  lastLogin?: Date;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER';

export interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  accountType: AccountType;
  balance: number;
  creditLimit?: number;
  status: AccountStatus;
  createdAt: Date;
}

export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'BUSINESS';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'SUSPENDED';

export interface Transaction {
  id: string;
  accountId: string;
  userId: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  merchantName?: string;
  description: string;
  transactionDate: Date;
  authorizationCode?: string;
}

export type TransactionType = 'PURCHASE' | 'PAYMENT' | 'TRANSFER' | 'WITHDRAWAL' | 'DEPOSIT' | 'FEE' | 'REFUND';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DISPUTED';

export interface Card {
  id: string;
  accountId: string;
  userId: string;
  cardNumber: string;
  cardType: CardType;
  status: CardStatus;
  expiryDate: string;
  isBlocked: boolean;
  dailyLimit: number;
  monthlyLimit: number;
}

export type CardType = 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER';
export type CardStatus = 'ACTIVE' | 'BLOCKED' | 'CANCELLED' | 'EXPIRED' | 'PENDING';

export interface Dispute {
  id: string;
  userId: string;
  transactionId: string;
  disputeType: DisputeType;
  status: DisputeStatus;
  disputeAmount: number;
  reason: string;
  referenceNumber: string;
  createdAt: Date;
}

export type DisputeType = 'UNAUTHORIZED_CHARGE' | 'BILLING_ERROR' | 'DEFECTIVE_MERCHANDISE' | 'SERVICE_NOT_RECEIVED' | 'DUPLICATE_CHARGE' | 'INCORRECT_AMOUNT' | 'CANCELLED_TRANSACTION' | 'FRAUD';
export type DisputeStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

export interface FraudCase {
  id: string;
  userId: string;
  type: FraudType;
  status: FraudStatus;
  severity: FraudSeverity;
  description: string;
  referenceNumber: string;
  createdAt: Date;
}

export type FraudType = 'SUSPICIOUS_ACTIVITY' | 'UNAUTHORIZED_TRANSACTION' | 'ACCOUNT_TAKEOVER' | 'IDENTITY_THEFT' | 'CARD_SKIMMING' | 'PHISHING' | 'OTHER';
export type FraudStatus = 'REPORTED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// API Response interfaces
export interface ApiResponse<T> {
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Security and Permission types
export interface SecurityContext {
  userId: string;
  role: UserRole;
  permissions: string[];
  sessionId?: string;
}

export interface SecurityPolicy {
  roles: UserRole[];
  permission: string;
  scope: 'own' | 'team' | 'organization' | 'all' | 'conditional';
}

export interface SecurityEvent {
  type: string;
  userId: string;
  resource: string;
  action: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// UI-specific types
export interface UIConfig {
  theme: 'light' | 'dark';
  features: string[];
  rolePermissions: Record<UserRole, string[]>;
}

export interface ChatbotConfig extends UIConfig {
  conversationSettings: {
    maxTurns: number;
    contextWindow: number;
    enabledCommands: string[];
  };
}

export interface AgentUIConfig extends UIConfig {
  dashboardSettings: {
    defaultView: string;
    enabledWidgets: string[];
    refreshInterval: number;
  };
}

export interface WebUIConfig extends UIConfig {
  navigationSettings: {
    enabledMenus: string[];
    landingPage: string;
  };
}
