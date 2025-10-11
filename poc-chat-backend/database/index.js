const { Sequelize } = require('sequelize');
const config = require('./config');
const logger = require('../services/logger');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

// Import models
const ChatSession = require('./models/ChatSession')(sequelize);
const ChatMessage = require('./models/ChatMessage')(sequelize);

// Define relationships
ChatSession.hasMany(ChatMessage, {
  foreignKey: 'session_id',
  as: 'messages',
  onDelete: 'CASCADE'
});

ChatMessage.belongsTo(ChatSession, {
  foreignKey: 'session_id',
  as: 'session'
});

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully', {
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port
    });
    return true;
  } catch (error) {
    logger.error('Unable to connect to database', {
      error: error.message,
      database: dbConfig.database,
      host: dbConfig.host
    });
    return false;
  }
};

// Sync database (creates tables if they don't exist)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force, alter: !force && env === 'development' });
    logger.info('Database synchronized successfully', {
      force,
      environment: env
    });
    return true;
  } catch (error) {
    logger.error('Database synchronization failed', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
};

// Close database connection
const closeConnection = async () => {
  try {
    await sequelize.close();
    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error('Error closing database connection', {
      error: error.message
    });
  }
};

// Health check
const healthCheck = async () => {
  try {
    await sequelize.authenticate();
    const [[result]] = await sequelize.query('SELECT NOW() as current_time, version() as db_version');
    return {
      status: 'healthy',
      timestamp: result.current_time,
      version: result.db_version,
      pool: {
        size: sequelize.connectionManager.pool.size,
        available: sequelize.connectionManager.pool.available,
        using: sequelize.connectionManager.pool.using,
        waiting: sequelize.connectionManager.pool.waiting
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

module.exports = {
  sequelize,
  models: {
    ChatSession,
    ChatMessage
  },
  testConnection,
  syncDatabase,
  closeConnection,
  healthCheck,
  Sequelize
};
