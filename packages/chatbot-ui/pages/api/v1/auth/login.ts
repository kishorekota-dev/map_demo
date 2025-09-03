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

    // Return successful authentication response
    return res.status(200).json({
      success: true,
      token: result.token,
      sessionId: result.sessionId,
      user: result.user,
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
