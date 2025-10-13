-- Migration: Create chat_messages table
-- Version: V2
-- Description: Creates the chat_messages table for storing all chat messages
-- Author: POC Development Team
-- Date: 2025-10-11

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    processing JSONB DEFAULT '{}',
    agent_info JSONB DEFAULT '{}',
    intent VARCHAR(100),
    entities JSONB DEFAULT '{}',
    sentiment VARCHAR(50),
    confidence_score FLOAT,
    processing_time_ms INTEGER,
    error_info JSONB,
    parent_message_id UUID,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_chat_messages_session 
        FOREIGN KEY (session_id) 
        REFERENCES chat_sessions(session_id) 
        ON DELETE CASCADE,
    
    -- Self-referencing foreign key for parent message
    CONSTRAINT fk_chat_messages_parent 
        FOREIGN KEY (parent_message_id) 
        REFERENCES chat_messages(message_id) 
        ON DELETE SET NULL
);

-- Add comments to table and columns
COMMENT ON TABLE chat_messages IS 'Stores all chat messages with processing metadata and agent information';
COMMENT ON COLUMN chat_messages.message_id IS 'Unique identifier for the message';
COMMENT ON COLUMN chat_messages.session_id IS 'Reference to the chat session';
COMMENT ON COLUMN chat_messages.user_id IS 'User identifier who sent/received this message';
COMMENT ON COLUMN chat_messages.direction IS 'Message direction: incoming from user or outgoing to user';
COMMENT ON COLUMN chat_messages.content IS 'Message content';
COMMENT ON COLUMN chat_messages.message_type IS 'Type of message: text, image, file, action, etc.';
COMMENT ON COLUMN chat_messages.metadata IS 'Message metadata (client info, attachments, etc.)';
COMMENT ON COLUMN chat_messages.processing IS 'Processing status flags (nlp, nlu, mcp, banking processed)';
COMMENT ON COLUMN chat_messages.agent_info IS 'Information about agents that processed this message';
COMMENT ON COLUMN chat_messages.intent IS 'Detected intent from NLU processing';
COMMENT ON COLUMN chat_messages.entities IS 'Extracted entities from message';
COMMENT ON COLUMN chat_messages.sentiment IS 'Detected sentiment: positive, negative, neutral';
COMMENT ON COLUMN chat_messages.confidence_score IS 'Confidence score from NLU/agent processing';
COMMENT ON COLUMN chat_messages.processing_time_ms IS 'Time taken to process this message in milliseconds';
COMMENT ON COLUMN chat_messages.error_info IS 'Error information if message processing failed';
COMMENT ON COLUMN chat_messages.parent_message_id IS 'Reference to parent message if this is a reply';
COMMENT ON COLUMN chat_messages.sequence_number IS 'Sequence number within the session for ordering';

-- Create indexes for performance
CREATE INDEX idx_chat_message_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_message_session_sequence ON chat_messages(session_id, sequence_number);
CREATE INDEX idx_chat_message_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_message_user_created ON chat_messages(user_id, created_at);
CREATE INDEX idx_chat_message_direction ON chat_messages(direction);
CREATE INDEX idx_chat_message_intent ON chat_messages(intent);
CREATE INDEX idx_chat_message_created_at ON chat_messages(created_at);
CREATE INDEX idx_chat_message_parent ON chat_messages(parent_message_id);

-- Add constraints to ensure valid values
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_direction_check 
    CHECK (direction IN ('incoming', 'outgoing'));

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_confidence_check 
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
