// Shared utilities for Credit Card Enterprise system

import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';

/**
 * Generate a unique reference number with prefix
 */
export function generateReferenceNumber(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Mask sensitive data (card numbers, account numbers, etc.)
 */
export function maskString(value: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (value.length <= visibleStart + visibleEnd) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, visibleStart);
  const end = value.substring(value.length - visibleEnd);
  const masked = '*'.repeat(value.length - visibleStart - visibleEnd);
  return `${start}${masked}${end}`;
}

/**
 * Generate pagination parameters
 */
export function getPaginationParams(page?: number, limit?: number) {
  const actualPage = Math.max(1, page || 1);
  const actualLimit = Math.min(100, Math.max(1, limit || 10));
  const offset = (actualPage - 1) * actualLimit;
  
  return {
    page: actualPage,
    limit: actualLimit,
    offset,
    actualLimit
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate UUID
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  uuid: Joi.string().uuid().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20),
  currency: Joi.number().positive().precision(2),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  }
};

/**
 * Role hierarchy levels for permission checking
 */
export const ROLE_HIERARCHY = {
  'SUPER_ADMIN': 5,
  'ADMIN': 4,
  'MANAGER': 3,
  'AGENT': 2,
  'CUSTOMER': 1
} as const;

/**
 * Check if a role has sufficient level for action
 */
export function hasRoleLevel(userRole: string, requiredRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as keyof typeof ROLE_HIERARCHY] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole as keyof typeof ROLE_HIERARCHY] || 0;
  return userLevel >= requiredLevel;
}

/**
 * API endpoints configuration
 */
export const API_ENDPOINTS = {
  AUTH: '/api/v1/auth',
  ACCOUNTS: '/api/v1/accounts',
  TRANSACTIONS: '/api/v1/transactions',
  CARDS: '/api/v1/cards',
  DISPUTES: '/api/v1/disputes',
  FRAUD: '/api/v1/fraud',
  BALANCE_TRANSFERS: '/api/v1/balance-transfers'
} as const;

/**
 * Status constants
 */
export const STATUS = {
  ACCOUNT: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    CLOSED: 'CLOSED',
    SUSPENDED: 'SUSPENDED'
  },
  TRANSACTION: {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    DISPUTED: 'DISPUTED'
  },
  CARD: {
    ACTIVE: 'ACTIVE',
    BLOCKED: 'BLOCKED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    PENDING: 'PENDING'
  }
} as const;
