import { NextApiRequest, NextApiResponse } from 'next';

interface AuthRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  success: boolean;
  token?: string;
  sessionId?: string;
  user?: {
    userId: string;
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    accountIds: string[];
    paymentLimits: {
      transaction: number;
      daily: number;
      monthly: number;
    };
  };
  message?: string;
  code?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const { email, password } = req.body as AuthRequest;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Get backend API URL from environment
    const backendUrl = process.env.BANKING_API_URL || 'http://backend:3000/api/v1';

    // Call backend authentication API
    const response = await fetch(`${backendUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: result.message || 'Authentication failed',
        code: result.code || 'AUTH_FAILED'
      });
    }

    // Map backend response to expected frontend format
    const mappedUser = {
      userId: result.customer.id,
      customerId: result.customer.id,
      email: result.customer.email,
      firstName: result.customer.firstName,
      lastName: result.customer.lastName,
      role: 'CUSTOMER',
      permissions: [
        'accounts:read',
        'transactions:read',
        'cards:read',
        'disputes:create',
        'fraud:create',
        'payments:initiate',
        'cards:update'
      ],
      accountIds: result.customer.accounts?.map((account: any) => account.id) || [],
      paymentLimits: {
        transaction: 10000,
        daily: 25000,
        monthly: 100000
      }
    };

    // Return successful authentication response
    return res.status(200).json({
      success: true,
      token: result.token,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: mappedUser,
      message: 'Authentication successful'
    });

  } catch (error) {
    console.error('Authentication API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}
