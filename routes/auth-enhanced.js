const express = require('express');
const { auth, authorize, validateChatBotSession } = require('../../middleware/auth-enhanced');
const { UserService } = require('../../models/users-enhanced');
const router = express.Router();

/**
 * Enhanced authentication endpoint for ChatBot
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, sessionMetadata } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        code: 'AUTH_MISSING_CREDENTIALS'
      });
    }

    // Authenticate user and create session
    const authResult = await UserService.authenticate(
      email, 
      password, 
      {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        chatbotSession: true,
        ...sessionMetadata
      }
    );

    res.json({
      success: true,
      message: 'Authentication successful',
      token: authResult.token,
      sessionId: authResult.sessionId,
      user: authResult.user,
      expiresIn: 1800 // 30 minutes
    });

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
});

/**
 * Token validation endpoint
 */
router.post('/validate', auth, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      permissions: req.user.permissions,
      accountIds: req.user.accountIds,
      sessionId: req.user.sessionId
    },
    expiresAt: new Date(req.user.tokenExpiry * 1000)
  });
});

/**
 * Logout endpoint for ChatBot sessions
 */
router.post('/logout', auth, validateChatBotSession, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // Logout specific session
    await UserService.logout(req.user.userId, sessionId || req.user.sessionId);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * Get user profile with ChatBot permissions
 */
router.get('/profile', auth, (req, res) => {
  res.json({
    success: true,
    user: {
      userId: req.user.userId,
      customerId: req.user.customerId,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      accountIds: req.user.accountIds,
      permissions: req.user.permissions,
      chatbotAccess: UserService.hasChatBotAccess(req.user.role),
      paymentLimits: UserService.getPaymentLimits(req.user.role),
      lastActivity: req.user.lastActivity
    }
  });
});

/**
 * Get active sessions for user
 */
router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await UserService.getActiveSessions(req.user.userId);
    
    res.json({
      success: true,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        metadata: session.metadata,
        isActive: session.isActive,
        isCurrent: session.sessionId === req.user.sessionId
      }))
    });

  } catch (error) {
    console.error('Sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve sessions',
      code: 'SESSIONS_ERROR'
    });
  }
});

/**
 * Logout all sessions
 */
router.post('/logout-all', auth, async (req, res) => {
  try {
    await UserService.logoutAllSessions(req.user.userId);

    res.json({
      success: true,
      message: 'All sessions logged out successfully'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout all sessions',
      code: 'LOGOUT_ALL_ERROR'
    });
  }
});

/**
 * Refresh token endpoint
 */
router.post('/refresh', auth, async (req, res) => {
  try {
    // Create new token with extended expiry
    const user = await UserService.findById(req.user.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Generate new token with same session
    const newAuthResult = await UserService.authenticate(
      user.email, 
      null, // Skip password for refresh
      { 
        refreshToken: true,
        sessionId: req.user.sessionId 
      }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newAuthResult.token,
      sessionId: newAuthResult.sessionId,
      expiresIn: 1800
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      code: 'REFRESH_FAILED'
    });
  }
});

module.exports = router;
