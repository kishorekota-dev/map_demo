const { Sequelize } = require('sequelize');
const config = require('../../config');
const logger = require('../utils/logger');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool
  }
);

// Test connection
sequelize
  .authenticate()
  .then(() => {
    logger.info('Database connection established successfully');
  })
  .catch((err) => {
    logger.error('Unable to connect to database:', err);
  });

module.exports = sequelize;
