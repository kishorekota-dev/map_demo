const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// Helper function to generate access token
const generateAccessToken = (user, permissions) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      customerId: user.customer_id,
      permissions: permissions || [],
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Helper function to generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

// Helper function to get user permissions
const getUserPermissions = async (userId) => {
  const query = `
    SELECT DISTINCT p.name, p.resource, p.action
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.id = $1
      AND u.is_active = TRUE
      AND NOT u.is_locked
  `;
  
  const result = await db.query(query, [userId]);
  return result.rows;
};

// Helper function to get user roles
const getUserRoles = async (userId) => {
  const query = `
    SELECT r.name, r.description
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = $1
  `;
  
  const result = await db.query(query, [userId]);
  return result.rows;
};

// Helper function to create audit log
const createAuditLog = async (userId, action, resource, details, ipAddress, status, errorMessage = null) => {
  const query = `
    INSERT INTO audit_logs (user_id, action, resource, details, ip_address, status, error_message)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  
  await db.query(query, [
    userId,
    action,
    resource,
    JSON.stringify(details),
    ipAddress,
    status,
    errorMessage
  ]);
};

/**
 * POST /api/v1/auth/login
 * User login - returns JWT tokens
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  
  try {
    req.logger.info('Login attempt', { username, ip: ipAddress });
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Username and password are required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Find user
    const userQuery = `
      SELECT u.*, c.customer_number, c.first_name, c.last_name
      FROM users u
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE u.username = $1 OR u.email = $1
    `;
    
    const userResult = await db.query(userQuery, [username]);
    
    if (userResult.rows.length === 0) {
      // Log failed attempt
      await createAuditLog(null, 'LOGIN', 'auth', 
        { username, reason: 'User not found' },
        ipAddress, 'FAILED', 'Invalid credentials');
      
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    const user = userResult.rows[0];
    
    // Check if account is locked
    if (user.is_locked) {
      await createAuditLog(user.id, 'LOGIN', 'auth',
        { username, reason: 'Account locked' },
        ipAddress, 'FAILED', 'Account is locked');
      
      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Your account has been locked due to multiple failed login attempts. Please contact support.'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Check if account is active
    if (!user.is_active) {
      await createAuditLog(user.id, 'LOGIN', 'auth',
        { username, reason: 'Account inactive' },
        ipAddress, 'FAILED', 'Account is inactive');
      
      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Your account is inactive. Please contact support.'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      await db.query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
        [user.id]
      );
      
      await createAuditLog(user.id, 'LOGIN', 'auth',
        { username, reason: 'Invalid password' },
        ipAddress, 'FAILED', 'Invalid credentials');
      
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Get user permissions and roles
    const permissions = await getUserPermissions(user.id);
    const roles = await getUserRoles(user.id);
    
    // Generate tokens
    const accessToken = generateAccessToken(user, permissions);
    const refreshToken = generateRefreshToken(user);
    
    // Save refresh token to database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, created_by_ip)
       VALUES ($1, $2, $3, $4)`,
      [user.id, refreshToken, expiresAt, ipAddress]
    );
    
    // Update user's last login
    await db.query(
      `UPDATE users 
       SET last_login_at = CURRENT_TIMESTAMP, 
           last_login_ip = $1, 
           failed_login_attempts = 0 
       WHERE id = $2`,
      [ipAddress, user.id]
    );
    
    // Log successful login
    await createAuditLog(user.id, 'LOGIN', 'auth',
      { username, method: 'password' },
      ipAddress, 'SUCCESS');
    
    req.logger.info('Login successful', { userId: user.id, username: user.username });
    
    // Return success response
    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          customerId: user.customer_id,
          customerNumber: user.customer_number,
          name: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : null,
          isVerified: user.is_verified,
          mustChangePassword: user.must_change_password,
          twoFactorEnabled: user.two_factor_enabled
        },
        tokens: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: JWT_EXPIRES_IN
        },
        roles: roles.map(r => r.name),
        permissions: permissions.map(p => p.name)
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
    
  } catch (error) {
    req.logger.error('Login error', { error: error.message, username });
    
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during login'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  
  try {
    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token is required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token type'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Check if refresh token exists and is valid
    const tokenQuery = `
      SELECT rt.*, u.*, c.customer_number, c.first_name, c.last_name
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.id
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE rt.token = $1 
        AND rt.revoked_at IS NULL 
        AND rt.expires_at > CURRENT_TIMESTAMP
    `;
    
    const tokenResult = await db.query(tokenQuery, [refreshToken]);
    
    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired refresh token'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    const user = tokenResult.rows[0];
    
    // Check if user is still active
    if (!user.is_active || user.is_locked) {
      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is no longer active'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Get user permissions
    const permissions = await getUserPermissions(user.user_id);
    
    // Generate new access token
    const newAccessToken = generateAccessToken({
      id: user.user_id,
      username: user.username,
      email: user.email,
      customer_id: user.customer_id
    }, permissions);
    
    // Log token refresh
    await createAuditLog(user.user_id, 'TOKEN_REFRESH', 'auth',
      { username: user.username },
      ipAddress, 'SUCCESS');
    
    res.json({
      status: 'success',
      data: {
        accessToken: newAccessToken,
        tokenType: 'Bearer',
        expiresIn: JWT_EXPIRES_IN
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    req.logger.error('Token refresh error', { error: error.message });
    
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during token refresh'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user and revoke refresh token
 */
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  
  try {
    if (refreshToken) {
      // Revoke refresh token
      await db.query(
        `UPDATE refresh_tokens 
         SET revoked_at = CURRENT_TIMESTAMP, revoked_by_ip = $1
         WHERE token = $2`,
        [ipAddress, refreshToken]
      );
      
      // Try to get user info for logging
      try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        await createAuditLog(decoded.userId, 'LOGOUT', 'auth',
          { username: decoded.username },
          ipAddress, 'SUCCESS');
      } catch (err) {
        // Token might be expired, that's okay
      }
    }
    
    res.json({
      status: 'success',
      message: 'Logged out successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
    
  } catch (error) {
    req.logger.error('Logout error', { error: error.message });
    
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during logout'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user information
 * Requires authentication
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user will be set by the authenticateToken middleware
    
    const userQuery = `
      SELECT u.id, u.username, u.email, u.customer_id, u.is_verified,
             u.two_factor_enabled, u.last_login_at, u.created_at,
             c.customer_number, c.first_name, c.last_name, c.status as customer_status
      FROM users u
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE u.id = $1
    `;
    
    const userResult = await db.query(userQuery, [req.user.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    const user = userResult.rows[0];
    const roles = await getUserRoles(user.id);
    const permissions = await getUserPermissions(user.id);
    
    res.json({
      status: 'success',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        customerId: user.customer_id,
        customerNumber: user.customer_number,
        name: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : null,
        isVerified: user.is_verified,
        twoFactorEnabled: user.two_factor_enabled,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        roles: roles.map(r => ({ name: r.name, description: r.description })),
        permissions: permissions.map(p => ({ name: p.name, resource: p.resource, action: p.action }))
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
    
  } catch (error) {
    req.logger.error('Get user info error', { error: error.message });
    
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred retrieving user information'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
});

module.exports = router;
