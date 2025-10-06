-- Create AI Orchestrator database
CREATE DATABASE ai_orchestrator;

-- Connect to ai_orchestrator database
\c ai_orchestrator;

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    workflow_state JSONB DEFAULT '{}'::jsonb,
    conversation_history JSONB DEFAULT '[]'::jsonb,
    collected_data JSONB DEFAULT '{}'::jsonb,
    required_data JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create workflow_executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    workflow_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error JSONB,
    execution_path TEXT[],
    checkpoints JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER
);

-- Create human_feedbacks table
CREATE TABLE IF NOT EXISTS human_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL,
    request_message TEXT NOT NULL,
    required_fields JSONB DEFAULT '[]'::jsonb,
    response TEXT,
    response_data JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at);

CREATE INDEX idx_workflow_executions_session_id ON workflow_executions(session_id);
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);

CREATE INDEX idx_human_feedbacks_session_id ON human_feedbacks(session_id);
CREATE INDEX idx_human_feedbacks_execution_id ON human_feedbacks(execution_id);
CREATE INDEX idx_human_feedbacks_status ON human_feedbacks(status);
CREATE INDEX idx_human_feedbacks_created_at ON human_feedbacks(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sessions table
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Insert sample data for testing (optional)
-- INSERT INTO sessions (user_id, session_id, status) 
-- VALUES ('test-user', 'test-session-123', 'active');

-- Display table information
\dt
\di

SELECT 'AI Orchestrator database initialized successfully!' as message;
