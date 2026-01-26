const { DataTypes } = require('sequelize');
const sequelize = require('./database');

/**
 * WorkflowExecution Model
 * Tracks workflow execution history and checkpoints
 */
const WorkflowExecution = sequelize.define('WorkflowExecution', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  executionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  intent: {
    type: DataTypes.STRING,
    allowNull: false
  },
  input: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Initial input to the workflow'
  },
  output: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Final output from the workflow'
  },
  status: {
    type: DataTypes.ENUM('running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'running',
    index: true
  },
  currentNode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Current node being executed'
  },
  executionPath: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of nodes executed in order'
  },
  checkpoints: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of workflow checkpoints for resumption'
  },
  error: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Error details if workflow failed'
  },
  metrics: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Execution metrics (duration, tokens used, etc.)'
  },
  startedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'workflow_executions',
  timestamps: true,
  indexes: [
    { fields: ['sessionId'] },
    { fields: ['executionId'] },
    { fields: ['status'] },
    { fields: ['intent'] },
    { fields: ['startedAt'] }
  ]
});

module.exports = WorkflowExecution;
