-- Migration: Create additional performance indexes
-- Version: V4
-- Description: Creates specialized indexes for common query patterns
-- Author: POC Development Team
-- Date: 2025-10-11

-- Create composite index for finding unresolved sessions by user
-- This supports the GET /api/users/{userId}/sessions?type=unresolved endpoint
CREATE INDEX IF NOT EXISTS idx_chat_session_user_unresolved_active 
    ON chat_sessions(user_id, is_resolved, is_active, last_activity DESC)
    WHERE is_resolved = FALSE AND is_active = TRUE;

-- Create index for recent sessions by user
-- This supports the GET /api/users/{userId}/sessions?type=recent endpoint
CREATE INDEX IF NOT EXISTS idx_chat_session_user_recent 
    ON chat_sessions(user_id, last_activity DESC);

-- Create index for active sessions by user
-- This supports the GET /api/users/{userId}/sessions?type=active endpoint
CREATE INDEX IF NOT EXISTS idx_chat_session_user_active_recent 
    ON chat_sessions(user_id, is_active, last_activity DESC)
    WHERE is_active = TRUE;

-- Create index for expired sessions cleanup
CREATE INDEX IF NOT EXISTS idx_chat_session_expired 
    ON chat_sessions(expires_at)
    WHERE is_active = TRUE AND expires_at IS NOT NULL;

-- Create index for message content search (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_chat_message_metadata_gin 
    ON chat_messages USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_chat_message_entities_gin 
    ON chat_messages USING GIN (entities);

CREATE INDEX IF NOT EXISTS idx_chat_message_processing_gin 
    ON chat_messages USING GIN (processing);

-- Create index for conversation context search
CREATE INDEX IF NOT EXISTS idx_chat_session_context_gin 
    ON chat_sessions USING GIN (conversation_context);

CREATE INDEX IF NOT EXISTS idx_chat_session_metadata_gin 
    ON chat_sessions USING GIN (metadata);

-- Add comments to indexes
COMMENT ON INDEX idx_chat_session_user_unresolved_active IS 'Optimizes queries for unresolved sessions by user';
COMMENT ON INDEX idx_chat_session_user_recent IS 'Optimizes queries for recent sessions by user';
COMMENT ON INDEX idx_chat_session_user_active_recent IS 'Optimizes queries for active sessions by user';
COMMENT ON INDEX idx_chat_session_expired IS 'Optimizes cleanup queries for expired sessions';
COMMENT ON INDEX idx_chat_message_metadata_gin IS 'Enables fast JSONB queries on message metadata';
COMMENT ON INDEX idx_chat_message_entities_gin IS 'Enables fast JSONB queries on message entities';
COMMENT ON INDEX idx_chat_session_context_gin IS 'Enables fast JSONB queries on conversation context';
