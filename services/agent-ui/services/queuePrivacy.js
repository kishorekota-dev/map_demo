const intent = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(value) ? value : null;

// Queue views and unaccepted offers are routing metadata, never customer context.
function queueView(entry) {
    return {
        queueId: entry.queueId, sessionId: entry.sessionId, intent: intent(entry.intent),
        priority: entry.priority, queuedAt: entry.queuedAt,
        estimatedWaitTime: entry.estimatedWaitTime, attempts: entry.attempts
    };
}

module.exports = { queueView, intent };
