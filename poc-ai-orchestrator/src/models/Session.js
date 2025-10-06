const { DataTypes } = require('sequelize');
const sequelize = require('./database');

/**
 * Session Model
 * Stores conversation sessions with workflow state
 */
const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    index: true
  },
  status: {
    type: DataTypes.ENUM('active', 'waiting_human_input', 'completed', 'failed', 'expired'),
    defaultValue: 'active',
    index: true
  },
  intent: {
    type: DataTypes.STRING,
    allowNull: true
  },
  currentStep: {
    type: DataTypes.STRING,
    allowNull: true
  },
  workflowState: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Current state of the workflow'
  },
  conversationHistory: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of messages in the conversation'
  },
  collectedData: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Data collected from user during workflow'
  },
  requiredData: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of data fields still needed from user'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional metadata'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'sessions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['sessionId'] },
    { fields: ['status'] },
    { fields: ['expiresAt'] },
    { fields: ['lastActivityAt'] }
  ]
});

module.exports = Session;
