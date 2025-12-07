const sequelize = require('./database');
const Session = require('./Session');
const WorkflowExecution = require('./WorkflowExecution');
const HumanFeedback = require('./HumanFeedback');
const logger = require('../utils/logger');

// Define relationships
Session.hasMany(WorkflowExecution, { foreignKey: 'sessionId', sourceKey: 'sessionId' });
WorkflowExecution.belongsTo(Session, { foreignKey: 'sessionId', targetKey: 'sessionId' });

WorkflowExecution.hasMany(HumanFeedback, { foreignKey: 'executionId', sourceKey: 'executionId' });
HumanFeedback.belongsTo(WorkflowExecution, { foreignKey: 'executionId', targetKey: 'executionId' });

/**
 * Initialize database and sync models
 */
async function initializeDatabase() {
  try {
    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (create tables if they don't exist)
    await sequelize.sync({ alter: false }); // Use alter: true in development if needed
    logger.info('Database models synchronized');

    return true;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  Session,
  WorkflowExecution,
  HumanFeedback,
  initializeDatabase
};
