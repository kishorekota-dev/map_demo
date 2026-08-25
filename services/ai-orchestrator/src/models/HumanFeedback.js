const { DataTypes } = require('sequelize');
const sequelize = require('./database');

/**
 * HumanFeedback Model
 * Stores human-in-the-loop feedback requests and responses
 */
const HumanFeedback = sequelize.define('HumanFeedback', {
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
    index: true
  },
  feedbackType: {
    type: DataTypes.ENUM('data_collection', 'confirmation', 'clarification', 'approval'),
    allowNull: false
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Question or prompt for the user'
  },
  requiredFields: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'List of fields required from user'
  },
  context: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Context information for the feedback request'
  },
  response: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'User response to the feedback request'
  },
  status: {
    type: DataTypes.ENUM('pending', 'received', 'timeout', 'cancelled'),
    defaultValue: 'pending',
    index: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  respondedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'ai_human_feedback',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['session_id'] },
    { fields: ['execution_id'] },
    { fields: ['status'] },
    { fields: ['expires_at'] }
  ]
});

module.exports = HumanFeedback;
