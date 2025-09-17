#!/usr/bin/env node

/**
 * Server Entry Point
 * This file starts the Express server application
 */

require('dotenv').config();

const ChatbotServer = require('./app');
const logger = require('./utils/logger');

// Create and start the server
try {
  const server = new ChatbotServer();
  server.start();
} catch (error) {
  logger.error('Failed to start server:', error);
  process.exit(1);
}