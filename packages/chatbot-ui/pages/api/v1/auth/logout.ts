import { NextApiRequest, NextApiResponse } from 'next';

interface LogoutRequest {
  sessionId: string;
}

interface LogoutResponse {
  success: boolean;
  message?: string;
  code?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LogoutResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const { sessionId } = req.body as LogoutRequest;
    const authToken = req.headers.authorization?.replace('Bearer ', '');

    if (!authToken && !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Authentication token or session ID required',
        code: 'MISSING_AUTH'
      });
    }

    // Get backend API URL from environment
    const backendUrl = process.env.BANKING_API_URL || 'http://backend:3000/api/v1';

    // Call backend logout API
    const response = await fetch(`${backendUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
      body: JSON.stringify({
        sessionId
      }),
    });

    // Even if backend logout fails, we consider it successful on frontend
    // since we're clearing the session anyway
    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout API error:', error);
    // Still return success for logout to ensure session is cleared
    return res.status(200).json({
      success: true,
      message: 'Logout completed'
    });
  }
}
