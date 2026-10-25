// Final logging boundary: operational enums and measurements only. A caller's
// arbitrary text, exception, identifier or nested metadata is never serialized.
const LEVELS = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'security']);
const NUMBERS = new Set(['duration', 'processingTime', 'responseTime', 'waitTime', 'connectionDuration', 'uptime', 'count', 'total', 'agentCount', 'adapterCount', 'toolCount', 'messageCount', 'sessionCount', 'activeSessions', 'activeConnections', 'queueSize', 'maxQueueSize', 'maxWaitTime', 'escalationThreshold', 'queueCheckInterval', 'attempts', 'maxAttempts', 'retryCount', 'reconnectAttempts', 'maxReconnectAttempts', 'statusCode', 'upstreamStatus', 'contentLength', 'port', 'timeout', 'timeoutMs', 'limit', 'offset']);
const BOOLEANS = new Set(['success', 'connected', 'isConnected', 'hasServer', 'enabled', 'valid', 'configured', 'telemetryUnavailable']);
const ENUMS = {
    method: new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    outcome: new Set(['completed', 'failed', 'uncertain', 'denied']),
    status: new Set(['healthy', 'unhealthy', 'available', 'busy', 'offline', 'away', 'completed', 'failed', 'uncertain']),
    priority: new Set(['critical', 'high', 'medium', 'low']),
    type: new Set(['text', 'file', 'image', 'system']),
    agentType: new Set(['human', 'ai', 'orchestrator'])
};

function operationalLog(info, { service, messages }) {
    const level = LEVELS.has(info.level) ? info.level : 'info';
    const result = { level, service, message: messages.has(info.message) ? info.message : 'Operational event' };
    result[Symbol.for('level')] = level;
    for (const [key, value] of Object.entries(info)) {
        if (NUMBERS.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value;
        else if (BOOLEANS.has(key) && typeof value === 'boolean') result[key] = value;
        else if (ENUMS[key]?.has(value)) result[key] = value;
    }
    return result;
}

module.exports = { operationalLog };
