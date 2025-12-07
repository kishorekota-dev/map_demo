const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ChatMessage = sequelize.define('chat_message', {
    message_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      comment: 'Unique message identifier'
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Reference to the chat session',
      references: {
        model: 'chat_sessions',
        key: 'session_id'
      },
      onDelete: 'CASCADE',
      index: true
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'User identifier who sent/received this message',
      index: true
    },
    direction: {
      type: DataTypes.ENUM('incoming', 'outgoing'),
      allowNull: false,
      comment: 'Message direction: incoming from user or outgoing to user',
      index: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Message content'
    },
    message_type: {
      type: DataTypes.STRING(50),
      defaultValue: 'text',
      allowNull: false,
      comment: 'Type of message: text, image, file, action, etc.'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Message metadata (client info, attachments, etc.)'
    },
    processing: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Processing status flags (nlp, nlu, mcp, banking processed)'
    },
    agent_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Information about agents that processed this message'
    },
    intent: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Detected intent from NLU processing',
      index: true
    },
    entities: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Extracted entities from message'
    },
    sentiment: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Detected sentiment: positive, negative, neutral'
    },
    confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Confidence score from NLU/agent processing'
    },
    processing_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Time taken to process this message in milliseconds'
    },
    error_info: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Error information if message processing failed'
    },
    parent_message_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Reference to parent message if this is a reply',
      references: {
        model: 'chat_messages',
        key: 'message_id'
      }
    },
    sequence_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Sequence number within the session'
    }
  }, {
    tableName: 'chat_messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_chat_message_session',
        fields: ['session_id', 'sequence_number']
      },
      {
        name: 'idx_chat_message_user',
        fields: ['user_id', 'created_at']
      },
      {
        name: 'idx_chat_message_direction',
        fields: ['direction']
      },
      {
        name: 'idx_chat_message_intent',
        fields: ['intent']
      },
      {
        name: 'idx_chat_message_created_at',
        fields: ['created_at']
      },
      {
        name: 'idx_chat_message_parent',
        fields: ['parent_message_id']
      }
    ],
    comment: 'Chat messages within sessions'
  });

  // Instance methods
  ChatMessage.prototype.markProcessed = async function(processingType, data = {}) {
    if (!this.processing) {
      this.processing = {};
    }
    this.processing[processingType] = {
      processed: true,
      timestamp: new Date(),
      ...data
    };
    await this.save();
  };

  ChatMessage.prototype.setError = async function(error) {
    this.error_info = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date()
    };
    await this.save();
  };

  // Class methods
  ChatMessage.findBySession = function(sessionId, options = {}) {
    const { limit = 100, offset = 0, order = 'ASC' } = options;
    return this.findAll({
      where: { session_id: sessionId },
      order: [['sequence_number', order]],
      limit,
      offset
    });
  };

  ChatMessage.findByUser = function(userId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    return this.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
  };

  ChatMessage.findByIntent = function(intent, options = {}) {
    const { limit = 100 } = options;
    return this.findAll({
      where: { intent },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  ChatMessage.getConversationHistory = function(sessionId, limit = 50) {
    return this.findAll({
      where: { session_id: sessionId },
      order: [['sequence_number', 'ASC']],
      limit,
      attributes: [
        'message_id',
        'direction',
        'content',
        'message_type',
        'intent',
        'confidence_score',
        'created_at'
      ]
    });
  };

  return ChatMessage;
};
