const sequelize = require('./database');
const Session = require('./Session');
const WorkflowExecution = require('./WorkflowExecution');
const HumanFeedback = require('./HumanFeedback');
const logger = require('../utils/logger');
const { initializeModelSchema } = require('./schema');

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

    await initializeModelSchema(sequelize);
    logger.info('Database model schema verified');

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
