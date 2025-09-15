const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// Import configurations
const config = require('./config/config');
const logger = require('./utils/logger');

// Import routes
const chatRoutes = require('./routes/chat');
const healthRoutes = require('./routes/health');

class ChatbotServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  initializeRoutes() {
    // API routes
    this.app.use('/api/chat', chatRoutes);
    this.app.use('/api/health', healthRoutes);

    // Serve main application
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        timestamp: new Date().toISOString()
      });
    });
  }

  initializeErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      
      const status = error.status || 500;
      const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;

      res.status(status).json({
        success: false,
        message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    });
  }

  start() {
    this.app.listen(this.port, () => {
      logger.info(`Chatbot server running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Base URL: http://localhost:${this.port}${process.env.API_BASE_URL || '/api'}`);
    });
  }
}

// Start server
const server = new ChatbotServer();
server.start();

module.exports = server;