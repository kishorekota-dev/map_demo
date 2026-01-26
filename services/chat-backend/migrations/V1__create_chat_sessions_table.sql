-- Migration: Create chat_sessions table
-- Version: V1
-- Description: Creates the main chat_sessions table for storing user chat sessions
-- Author: POC Development Team
-- Date: 2025-10-11

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    message_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    conversation_context JSONB DEFAULT '{}',
    state JSONB DEFAULT '{}',
    statistics JSONB DEFAULT '{}',
    security JSONB DEFAULT '{}',
    resolution_notes TEXT,
    ended_at TIMESTAMP,
    ended_reason VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add comments to table and columns
COMMENT ON TABLE chat_sessions IS 'Stores all chat sessions with full context and state information';
COMMENT ON COLUMN chat_sessions.session_id IS 'Unique identifier for the chat session';
COMMENT ON COLUMN chat_sessions.user_id IS 'User identifier associated with this session';
COMMENT ON COLUMN chat_sessions.is_active IS 'Whether the session is currently active';
COMMENT ON COLUMN chat_sessions.is_resolved IS 'Whether all user queries in this session have been resolved';
COMMENT ON COLUMN chat_sessions.status IS 'Current status of the session (active, pending, resolved, expired, terminated)';
COMMENT ON COLUMN chat_sessions.last_activity IS 'Timestamp of last activity in this session';
COMMENT ON COLUMN chat_sessions.expires_at IS 'When this session will expire';
COMMENT ON COLUMN chat_sessions.message_count IS 'Total number of messages in this session';
COMMENT ON COLUMN chat_sessions.metadata IS 'Additional session metadata (user agent, IP, device info, etc.)';
COMMENT ON COLUMN chat_sessions.conversation_context IS 'Current conversation context (intent, entities, banking context, etc.)';
COMMENT ON COLUMN chat_sessions.state IS 'Session state information (current step, authentication status, etc.)';
COMMENT ON COLUMN chat_sessions.statistics IS 'Session statistics (agents used, intents processed, errors, etc.)';
COMMENT ON COLUMN chat_sessions.security IS 'Security-related information (IP, auth checks, trust score, etc.)';
COMMENT ON COLUMN chat_sessions.resolution_notes IS 'Notes about how the session was resolved';
COMMENT ON COLUMN chat_sessions.ended_at IS 'When the session was ended';
COMMENT ON COLUMN chat_sessions.ended_reason IS 'Reason for session termination';

-- Create indexes for performance
CREATE INDEX idx_chat_session_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_session_user_active ON chat_sessions(user_id, is_active);
CREATE INDEX idx_chat_session_user_unresolved ON chat_sessions(user_id, is_resolved, is_active);
CREATE INDEX idx_chat_session_status ON chat_sessions(status);
CREATE INDEX idx_chat_session_last_activity ON chat_sessions(last_activity);
CREATE INDEX idx_chat_session_created_at ON chat_sessions(created_at);

-- Add constraint to ensure valid status values
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_status_check 
    CHECK (status IN ('active', 'pending', 'resolved', 'expired', 'terminated'));
