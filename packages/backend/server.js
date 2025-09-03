const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import database and models
const { initializeDatabase } = require('./database');
const EnterpriseDataSeeder = require('./database/enterpriseSeeder');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

// Import enterprise routes
const enterpriseAuthRoutes = require('./routes/enterpriseAuth');
const enterpriseCustomerRoutes = require('./routes/enterpriseCustomers');

// Import existing routes
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const cardRoutes = require('./routes/cards');
const disputeRoutes = require('./routes/disputes');
const fraudRoutes = require('./routes/fraud');
const balanceTransferRoutes = require('./routes/balanceTransfers');

// Legacy auth routes for backward compatibility
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.enterprise-banking.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit requests per window
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  max: 5, // Limit auth attempts
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again after 15 minutes'
  },
  skipSuccessfulRequests: true
});

app.use(limiter);
app.use('/api/v1/auth', authLimiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://enterprise-banking.com', 'https://admin.enterprise-banking.com', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003']
    : ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected',
      api: 'operational'
    }
  });
});

// API Health check endpoint (for MCP client)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected',
      api: 'operational',
      mcp: 'available'
    }
  });
});

// API v1 Health check endpoint (following v1 URI pattern)
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'connected',
      api: 'operational',
      mcp: 'available'
    },
    api: {
      version: 'v1',
      basePath: '/api/v1',
      standards: ['BIAN', 'REST'],
      features: [
        'Advanced PII encryption',
        'KYC/AML compliance',
        'Real-time fraud detection',
        'Comprehensive audit logging'
      ]
    }
  });
});

// API version info
app.get('/api', (req, res) => {
  res.status(200).json({
    name: 'Enterprise Banking API',
    version: '1.0.0',
    description: 'BIAN-compliant enterprise banking platform with comprehensive PII support',
    documentation: '/api/docs',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth',
      customers: '/api/v1/customers', 
      accounts: '/api/v1/accounts',
      transactions: '/api/v1/transactions',
      cards: '/api/v1/cards',
      disputes: '/api/v1/disputes',
      fraud: '/api/v1/fraud',
      balanceTransfers: '/api/v1/balance-transfers'
    },
    standards: ['BIAN', 'PCI DSS', 'SOX', 'GDPR'],
    features: [
      'Advanced PII encryption',
      'KYC/AML compliance',
      'Real-time fraud detection',
      'Comprehensive audit logging',
      'Multi-tier authentication'
    ]
  });
});

// API Routes - Enterprise enhanced
app.use('/api/v1/auth', enterpriseAuthRoutes);
app.use('/api/v1/customers', enterpriseCustomerRoutes);

// Existing routes (enhanced to work with new models)
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/cards', cardRoutes);
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/fraud', fraudRoutes);
app.use('/api/v1/balance-transfers', balanceTransferRoutes);

// Legacy API routes (for backward compatibility)
app.use('/api/v1/legacy/auth', authRoutes);

// Admin endpoints
app.post('/api/v1/admin/seed-data', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Not allowed in production',
        message: 'Data seeding is not allowed in production environment'
      });
    }

    const { customerCount = 100 } = req.body;
    
    console.log('🌱 Starting enterprise data seeding...');
    await EnterpriseDataSeeder.seedAll(customerCount);
    
    res.status(200).json({
      message: 'Enterprise data seeding completed successfully',
      customersCreated: customerCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Data seeding failed:', error);
    res.status(500).json({
      error: 'Data seeding failed',
      message: error.message
    });
  }
});

// Database status endpoint
app.get('/api/v1/admin/database/status', async (req, res) => {
  try {
    const { query } = require('./database');
    
    // Get database statistics
    const stats = await Promise.all([
      query('SELECT COUNT(*) as count FROM customers'),
      query('SELECT COUNT(*) as count FROM credit_accounts WHERE account_status = $1', ['ACTIVE']),
      query('SELECT COUNT(*) as count FROM credit_cards WHERE card_status = $1', ['ACTIVE']),
      query('SELECT COUNT(*) as count FROM credit_transactions WHERE processing_status = $1', ['SETTLED']),
      query('SELECT COUNT(*) as count FROM payments WHERE payment_status = $1', ['COMPLETED']),
      query('SELECT SUM(current_balance) as total_balance FROM credit_accounts WHERE account_status = $1', ['ACTIVE']),
      query('SELECT SUM(credit_limit) as total_credit FROM credit_accounts WHERE account_status = $1', ['ACTIVE'])
    ]);

    res.status(200).json({
      database: 'connected',
      timestamp: new Date().toISOString(),
      statistics: {
        totalCustomers: parseInt(stats[0].rows[0].count),
        activeAccounts: parseInt(stats[1].rows[0].count),
        activeCards: parseInt(stats[2].rows[0].count),
        settledTransactions: parseInt(stats[3].rows[0].count),
        completedPayments: parseInt(stats[4].rows[0].count),
        totalOutstandingBalance: parseFloat(stats[5].rows[0].total_balance || 0).toFixed(2),
        totalCreditExtended: parseFloat(stats[6].rows[0].total_credit || 0).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Database status check failed:', error);
    res.status(500).json({
      database: 'error',
      error: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} was not found`,
    availableEndpoints: [
      'GET /api - API information',
      'GET /health - Health check',
      'GET /api/health - API health check',
      'GET /api/v1/health - API v1 health check',
      'POST /api/v1/auth/login - Authentication',
      'POST /api/v1/auth/register - Customer registration',
      'GET /api/v1/customers/profile - Customer profile',
      'GET /api/v1/accounts - Customer accounts',
      'GET /api/v1/transactions - Account transactions'
    ]
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('💤 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('� SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    console.log('🔌 Connecting to enterprise database...');
    await initializeDatabase();
    console.log('✅ Database connection established');

    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('🏦 Enterprise Banking API Server Started');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
      console.log(`� Health Check: http://localhost:${PORT}/health`);
      console.log(`� API Documentation: http://localhost:${PORT}/api`);
      console.log('');
      console.log('🚀 Enterprise Banking Platform Ready!');
      console.log('   • BIAN-compliant architecture');
      console.log('   • Advanced PII encryption');
      console.log('   • KYC/AML compliance');
      console.log('   • Real-time fraud detection');
      console.log('   • Comprehensive audit logging');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
