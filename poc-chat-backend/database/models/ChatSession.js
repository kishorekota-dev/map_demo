const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChatSession = sequelize.define('chat_session', {
    session_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      comment: 'Unique session identifier'
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'User identifier associated with this session',
      index: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether the session is currently active',
      index: true
    },
    is_resolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether all user queries in this session have been resolved',
      index: true
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'resolved', 'expired', 'terminated'),
      defaultValue: 'active',
      allowNull: false,
      comment: 'Current status of the session',
      index: true
    },
    last_activity: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp of last activity in this session',
      index: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this session will expire'
    },
    message_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Total number of messages in this session'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Additional session metadata (user agent, IP, device info, etc.)'
    },
    conversation_context: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Current conversation context (intent, entities, banking context, etc.)'
    },
    state: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Session state information (current step, authentication status, etc.)'
    },
    statistics: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Session statistics (agents used, intents processed, errors, etc.)'
    },
    security: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Security-related information (IP, auth checks, trust score, etc.)'
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notes about how the session was resolved'
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the session was ended'
    },
    ended_reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Reason for session termination'
    }
  }, {
    tableName: 'chat_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_chat_session_user_active',
        fields: ['user_id', 'is_active']
      },
      {
        name: 'idx_chat_session_user_unresolved',
        fields: ['user_id', 'is_resolved', 'is_active']
      },
      {
        name: 'idx_chat_session_status',
        fields: ['status']
      },
      {
        name: 'idx_chat_session_last_activity',
        fields: ['last_activity']
      },
      {
        name: 'idx_chat_session_created_at',
        fields: ['created_at']
      }
    ],
    comment: 'Chat sessions for tracking user conversations'
  });

  // Instance methods
  ChatSession.prototype.isExpired = function() {
    return this.expires_at && new Date() > new Date(this.expires_at);
  };

  ChatSession.prototype.incrementMessageCount = async function() {
    this.message_count += 1;
    this.last_activity = new Date();
    await this.save();
  };

  ChatSession.prototype.markResolved = async function(notes = null) {
    this.is_resolved = true;
    this.status = 'resolved';
    this.resolution_notes = notes;
    this.ended_at = new Date();
    await this.save();
  };

  ChatSession.prototype.markActive = async function() {
    this.is_active = true;
    this.status = 'active';
    this.last_activity = new Date();
    await this.save();
  };

  ChatSession.prototype.endSession = async function(reason = 'user_request') {
    this.is_active = false;
    this.status = 'terminated';
    this.ended_at = new Date();
    this.ended_reason = reason;
    await this.save();
  };

  // Class methods
  ChatSession.findActiveByUser = function(userId) {
    return this.findAll({
      where: {
        user_id: userId,
        is_active: true
      },
      order: [['last_activity', 'DESC']]
    });
  };

  ChatSession.findUnresolvedByUser = function(userId) {
    return this.findAll({
      where: {
        user_id: userId,
        is_resolved: false,
        is_active: true
      },
      order: [['last_activity', 'DESC']]
    });
  };

  ChatSession.findRecentByUser = function(userId, limit = 10) {
    return this.findAll({
      where: {
        user_id: userId
      },
      order: [['last_activity', 'DESC']],
      limit
    });
  };

  return ChatSession;
};
