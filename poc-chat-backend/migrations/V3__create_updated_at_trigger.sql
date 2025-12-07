-- Migration: Create updated_at trigger function
-- Version: V3
-- Description: Creates a trigger function to automatically update updated_at timestamp
-- Author: POC Development Team
-- Date: 2025-10-11

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION update_updated_at_column() IS 'Trigger function to automatically update updated_at timestamp on row updates';

-- Create trigger for chat_sessions table
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for chat_messages table
CREATE TRIGGER update_chat_messages_updated_at
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments to triggers
COMMENT ON TRIGGER update_chat_sessions_updated_at ON chat_sessions IS 'Automatically updates updated_at timestamp on row update';
COMMENT ON TRIGGER update_chat_messages_updated_at ON chat_messages IS 'Automatically updates updated_at timestamp on row update';
