-- Migration: Create views for analytics and reporting
-- Version: V5
-- Description: Creates views for session statistics and analytics
-- Author: POC Development Team
-- Date: 2025-10-11

-- Create view for session statistics
CREATE OR REPLACE VIEW v_session_statistics AS
SELECT 
    cs.session_id,
    cs.user_id,
    cs.status,
    cs.is_active,
    cs.is_resolved,
    cs.created_at,
    cs.ended_at,
    cs.last_activity,
    cs.message_count,
    COUNT(cm.message_id) AS actual_message_count,
    COUNT(CASE WHEN cm.direction = 'incoming' THEN 1 END) AS incoming_messages,
    COUNT(CASE WHEN cm.direction = 'outgoing' THEN 1 END) AS outgoing_messages,
    AVG(cm.confidence_score) AS avg_confidence_score,
    AVG(cm.processing_time_ms) AS avg_processing_time_ms,
    MAX(cm.created_at) AS last_message_at,
    EXTRACT(EPOCH FROM (COALESCE(cs.ended_at, NOW()) - cs.created_at)) AS session_duration_seconds
FROM chat_sessions cs
LEFT JOIN chat_messages cm ON cs.session_id = cm.session_id
GROUP BY cs.session_id;

-- Create view for user statistics
CREATE OR REPLACE VIEW v_user_statistics AS
SELECT 
    user_id,
    COUNT(DISTINCT session_id) AS total_sessions,
    COUNT(DISTINCT CASE WHEN is_active = TRUE THEN session_id END) AS active_sessions,
    COUNT(DISTINCT CASE WHEN is_resolved = TRUE THEN session_id END) AS resolved_sessions,
    COUNT(DISTINCT CASE WHEN is_resolved = FALSE AND is_active = TRUE THEN session_id END) AS unresolved_sessions,
    SUM(message_count) AS total_messages,
    MAX(last_activity) AS last_activity,
    MIN(created_at) AS first_session_at
FROM chat_sessions
GROUP BY user_id;

-- Create view for recent unresolved sessions (last 7 days)
CREATE OR REPLACE VIEW v_recent_unresolved_sessions AS
SELECT 
    cs.session_id,
    cs.user_id,
    cs.status,
    cs.last_activity,
    cs.message_count,
    cs.created_at,
    EXTRACT(EPOCH FROM (NOW() - cs.last_activity)) / 3600 AS hours_since_activity,
    (SELECT content FROM chat_messages WHERE session_id = cs.session_id ORDER BY sequence_number DESC LIMIT 1) AS last_message
FROM chat_sessions cs
WHERE cs.is_resolved = FALSE 
    AND cs.is_active = TRUE
    AND cs.created_at > NOW() - INTERVAL '7 days'
ORDER BY cs.last_activity DESC;

-- Create view for message intent analysis
CREATE OR REPLACE VIEW v_intent_statistics AS
SELECT 
    intent,
    COUNT(*) AS message_count,
    COUNT(DISTINCT session_id) AS session_count,
    COUNT(DISTINCT user_id) AS user_count,
    AVG(confidence_score) AS avg_confidence,
    AVG(processing_time_ms) AS avg_processing_time
FROM chat_messages
WHERE intent IS NOT NULL
GROUP BY intent
ORDER BY message_count DESC;

-- Add comments to views
COMMENT ON VIEW v_session_statistics IS 'Provides detailed statistics for each chat session';
COMMENT ON VIEW v_user_statistics IS 'Provides aggregated statistics per user';
COMMENT ON VIEW v_recent_unresolved_sessions IS 'Lists unresolved sessions from the last 7 days';
COMMENT ON VIEW v_intent_statistics IS 'Provides statistics on detected intents';
