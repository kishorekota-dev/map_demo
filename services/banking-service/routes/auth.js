const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// JWT Configuration
const JWT_SECRET = require('../config').security.jwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// Consecutive failed passwords before a temporary lock. The counter resets when
// the lock is applied and on every successful sign-in.
const positiveInt = (value, fallback) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
const MAX_FAILED_LOGINS = positiveInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 5);
const LOCKOUT_MINUTES = positiveInt(process.env.AUTH_LOCKOUT_MINUTES, 15);

// Unknown usernames still pay for one bcrypt comparison (cost 12, like real
// accounts), so response timing does not reveal which usernames exist.
const TIMING_EQUALIZER_HASH = '$2a$12$TPza3BzlliaOZDdukJtIqey6RPcLB2lSX0lQ1AWrcZKawCDPKLXva';

// Refresh tokens are stored as digests. The raw value is still matched so rows
// written before digests were introduced remain valid until they expire.
const refreshTokenDigest = (token) => `sha256:${createHash('sha256').update(token).digest('hex')}`;

// Helper function to generate access token
const generateAccessToken = (user, permissions, roles = []) => {
  // Authorization claims must come from the database on both login and
  // refresh. Browser profile data is never a source of operator privileges.
  const roleNames = roles.map(role => role.name.toLowerCase());
  return jwt.sign(
    {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      customerId: user.customer_id,
      tenantId: process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
      roles: roleNames,
      role: roleNames.includes('admin') ? 'admin' : (roleNames[0] || 'customer'),
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
      userId: user.user_id,
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
    JOIN user_roles ur ON u.user_id = ur.user_id
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.user_id = $1
      AND u.is_active = TRUE
      AND NOT u.is_locked
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
    // Validation
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password
      || username.length > 255 || password.length > 1024) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Get user from database
    const userQuery = `
      SELECT u.*, c.customer_number, 
             CONCAT(c.first_name, ' ', c.last_name) as full_name
      FROM users u
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE u.username = $1
    `;
    
    const userResult = await db.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      await bcrypt.compare(password, TIMING_EQUALIZER_HASH);
      await createAuditLog(
        null,
        'login_failed',
        'authentication',
        { username, reason: 'user_not_found' },
        ipAddress,
        'failure',
        'Invalid credentials'
      );

      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    const user = userResult.rows[0];

    // A temporary lock is reported without evaluating the password, so a
    // locked account cannot be used as a password-guessing oracle.
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await createAuditLog(
        user.user_id,
        'login_failed',
        'authentication',
        { username, reason: 'temporarily_locked' },
        ipAddress,
        'failure',
        'Account temporarily locked'
      );

      res.set('Retry-After', String(Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000))));
      return res.status(429).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          message: 'Too many failed sign-in attempts. Please try again later.'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Verify the password before disclosing any other account state.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Count the failure and apply a temporary lock atomically.
      await db.query(
        `UPDATE users SET
           failed_login_attempts = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= $2 THEN 0 ELSE COALESCE(failed_login_attempts, 0) + 1 END,
           locked_until = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= $2 THEN NOW() + ($3 * INTERVAL '1 minute') ELSE locked_until END
         WHERE user_id = $1`,
        [user.user_id, MAX_FAILED_LOGINS, LOCKOUT_MINUTES]
      );

      await createAuditLog(
        user.user_id,
        'login_failed',
        'authentication',
        { username, reason: 'invalid_password' },
        ipAddress,
        'failure',
        'Invalid password'
      );

      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Check if user is active
    if (!user.is_active) {
      await createAuditLog(
        user.user_id,
        'login_failed',
        'authentication',
        { username, reason: 'account_inactive' },
        ipAddress,
        'failure',
        'Account inactive'
      );

      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is inactive. Please contact support.'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Check if an administrator has locked the account
    if (user.is_locked) {
      await createAuditLog(
        user.user_id,
        'login_failed',
        'authentication',
        { username, reason: 'account_locked' },
        ipAddress,
        'failure',
        'Account locked'
      );

      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Account is locked. Please contact support.'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Get user permissions and roles
    const permissions = await getUserPermissions(user.user_id);
    const roles = await getUserRoles(user.user_id);

    // Generate tokens
    const accessToken = generateAccessToken(user, permissions, roles);
    const refreshToken = generateRefreshToken(user);

    // Store a digest of the refresh token; its expiry matches the signed token.
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, created_by_ip)
       VALUES ($1, $2, to_timestamp($3), $4)`,
      [user.user_id, refreshTokenDigest(refreshToken), jwt.decode(refreshToken).exp, ipAddress]
    );

    // Update user last login
    await db.query(
      `UPDATE users 
       SET last_login_at = NOW(), 
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );

    // Log successful login
    await createAuditLog(
      user.user_id,
      'login_success',
      'authentication',
      { username },
      ipAddress,
      'success'
    );

    // Return response
    res.json({
      status: 'success',
      data: {
        user: {
          userId: user.user_id,  // Changed from 'id' to 'userId' for frontend compatibility
          id: user.user_id,      // Keep 'id' for backward compatibility
          username: user.username,
          email: user.email,
          customerId: user.customer_id,
          customerNumber: user.customer_number,
          name: user.full_name,
          firstName: user.full_name?.split(' ')[0],
          lastName: user.full_name?.split(' ').slice(1).join(' '),
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
        correlationId: uuidv4()
      }
    });

  } catch (error) {
    console.error('Login error');
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred during login'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
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

  try {
    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET, { algorithms: ['HS256'] });

    if (decoded.type !== 'refresh' || decoded.purpose === 'quality_evaluation' || [decoded.aud].flat().includes('servicing-quality')) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token type'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Check if refresh token exists and is not revoked
    const tokenQuery = `
      SELECT * FROM refresh_tokens 
      WHERE token IN ($1, $3) AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
    `;
    
    const tokenResult = await db.query(tokenQuery, [refreshTokenDigest(refreshToken), decoded.userId, refreshToken]);

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Refresh token is invalid or has been revoked'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Get user
    const userQuery = 'SELECT * FROM users WHERE user_id = $1 AND is_active = TRUE AND NOT is_locked';
    const userResult = await db.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or account is inactive'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    const user = userResult.rows[0];

    // Re-read authorization on refresh so revoked roles are not renewed.
    const permissions = await getUserPermissions(user.user_id);
    const roles = await getUserRoles(user.user_id);

    // Generate new access token
    const accessToken = generateAccessToken(user, permissions, roles);

    res.json({
      status: 'success',
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: JWT_EXPIRES_IN
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Refresh token has expired'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    console.error('Token refresh error');
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while refreshing token'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user and revoke refresh token
 */
router.post('/logout', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;

  try {
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: uuidv4()
        }
      });
    }

    // Revoke the refresh token
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token IN ($1, $3) AND user_id = $2',
      [refreshTokenDigest(refreshToken), req.user.userId, refreshToken]
    );

    // Log logout
    await createAuditLog(
      req.user.userId,
      'logout',
      'authentication',
      { username: req.user.username },
      req.ip || req.connection.remoteAddress,
      'success'
    );

    res.json({
      status: 'success',
      data: {
        message: 'Logged out successfully'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });

  } catch (error) {
    console.error('Logout error');
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred during logout'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user details
    const userQuery = `
      SELECT u.*, c.customer_number, 
             CONCAT(c.first_name, ' ', c.last_name) as full_name
      FROM users u
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE u.user_id = $1
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
          correlationId: uuidv4()
        }
      });
    }

    const user = userResult.rows[0];

    // Get roles and permissions
    const roles = await getUserRoles(user.user_id);
    const permissions = await getUserPermissions(user.user_id);

    res.json({
      status: 'success',
      data: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        customerId: user.customer_id,
        customerNumber: user.customer_number,
        name: user.full_name,
        isVerified: user.is_verified,
        twoFactorEnabled: user.two_factor_enabled,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        roles,
        permissions
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });

  } catch (error) {
    console.error('Get user profile error');
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching user profile'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: uuidv4()
      }
    });
  }
});

module.exports = router;
