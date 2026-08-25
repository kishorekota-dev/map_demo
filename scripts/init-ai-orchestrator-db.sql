-- AI Orchestrator database bootstrap
--
-- Older releases created sessions/workflow_executions/human_feedbacks with a
-- schema that did not match the Sequelize models (snake_case columns, missing
-- fields, incompatible foreign-key types). Keep those legacy tables intact so
-- an existing volume is never destructively altered. The active models use
-- the namespaced ai_* tables below, whose physical schema exactly matches the
-- model contract. Every statement is safe to run more than once.

SELECT 'CREATE DATABASE ai_orchestrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_orchestrator')\gexec

\connect ai_orchestrator

CREATE TABLE IF NOT EXISTS ai_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_human_input', 'completed', 'failed', 'expired')),
    intent VARCHAR(255),
    current_step VARCHAR(255),
    workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL
        REFERENCES ai_sessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
    execution_id VARCHAR(255) NOT NULL UNIQUE,
    intent VARCHAR(255) NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    current_node VARCHAR(255),
    execution_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
    error JSONB,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_human_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL
        REFERENCES ai_sessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
    execution_id VARCHAR(255) NOT NULL
        REFERENCES ai_workflow_executions(execution_id) ON UPDATE CASCADE ON DELETE CASCADE,
    feedback_type VARCHAR(50) NOT NULL
        CHECK (feedback_type IN ('data_collection', 'confirmation', 'clarification', 'approval')),
    question TEXT NOT NULL,
    required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    response JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'received', 'timeout', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_sessions_user_id ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_session_id ON ai_sessions(session_id);
CREATE INDEX IF NOT EXISTS ai_sessions_status ON ai_sessions(status);
CREATE INDEX IF NOT EXISTS ai_sessions_expires_at ON ai_sessions(expires_at);
CREATE INDEX IF NOT EXISTS ai_sessions_last_activity_at ON ai_sessions(last_activity_at);

CREATE INDEX IF NOT EXISTS ai_workflow_executions_session_id
    ON ai_workflow_executions(session_id);
CREATE INDEX IF NOT EXISTS ai_workflow_executions_execution_id
    ON ai_workflow_executions(execution_id);
CREATE INDEX IF NOT EXISTS ai_workflow_executions_status
    ON ai_workflow_executions(status);
CREATE INDEX IF NOT EXISTS ai_workflow_executions_intent
    ON ai_workflow_executions(intent);
CREATE INDEX IF NOT EXISTS ai_workflow_executions_started_at
    ON ai_workflow_executions(started_at);

CREATE INDEX IF NOT EXISTS ai_human_feedback_session_id
    ON ai_human_feedback(session_id);
CREATE INDEX IF NOT EXISTS ai_human_feedback_execution_id
    ON ai_human_feedback(execution_id);
CREATE INDEX IF NOT EXISTS ai_human_feedback_status
    ON ai_human_feedback(status);
CREATE INDEX IF NOT EXISTS ai_human_feedback_expires_at
    ON ai_human_feedback(expires_at);

CREATE OR REPLACE FUNCTION ai_orchestrator_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_sessions_set_updated_at ON ai_sessions;
CREATE TRIGGER ai_sessions_set_updated_at
    BEFORE UPDATE ON ai_sessions
    FOR EACH ROW
    EXECUTE FUNCTION ai_orchestrator_set_updated_at();

DROP TRIGGER IF EXISTS ai_workflow_executions_set_updated_at ON ai_workflow_executions;
CREATE TRIGGER ai_workflow_executions_set_updated_at
    BEFORE UPDATE ON ai_workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION ai_orchestrator_set_updated_at();

DROP TRIGGER IF EXISTS ai_human_feedback_set_updated_at ON ai_human_feedback;
CREATE TRIGGER ai_human_feedback_set_updated_at
    BEFORE UPDATE ON ai_human_feedback
    FOR EACH ROW
    EXECUTE FUNCTION ai_orchestrator_set_updated_at();

SELECT 'AI Orchestrator database initialized successfully!' AS message;
