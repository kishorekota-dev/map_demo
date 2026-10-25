/**
 * Live agent chat in the chat backend.
 *
 * What was missing before this module: the chat backend already had agent
 * principals, session rooms, typing indicators, an agent dashboard queue
 * ('agents' room) and transcript persistence — but handleSendMessage always
 * routed every message through the AI orchestrator, even after a human
 * agent took over. So "agent chat" was an escalation notice, not a
 * back-and-forth conversation.
 *
 * This module supplies the missing piece, and only that piece:
 * - a FIFO live-agent queue (per queue name, in-memory; a queue is a
 *   routing aid, not a durable work queue — a restart loses it, and the
 *   customer is told to re-request),
 * - validation that only the session owner (customer) or the assigned
 *   human agent may send live messages,
 * - a transfer context built from session state + recent history, passed
 *   to the assigned agent only (never broadcast to the 'agents' room),
 * - message validation (non-empty, max length) shared by both directions.
 *
 * Transcript persistence is deliberately NOT reinvented here: customer
 * messages go through chatService.processMessage (incoming) and agent
 * messages through chatService.sendResponse with agentType 'human'
 * (outgoing), so live chat lands in the same transcript and the same
 * database table as AI chat. Returning to AI is just clearing the
 * live-agent flag on the session; the customer keeps the same session.
 *
 * No tokens, passwords or customer PII are put in queue broadcasts: the
 * 'agents' room sees sessionId, queue, intent and requestedAt only.
 */

const { randomUUID } = require('crypto');

const MAX_LIVE_MESSAGE_LENGTH = 2000;
const LIVE_REQUEST_TTL_MS = 15 * 60 * 1000;
const queueName = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) throw new Error('Invalid live agent queue'); return value; };
const boundedReason = value => { if (value === undefined) return 'customer_requested'; if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Invalid live agent reason'); return value; };
const hasLiveRequest = session => Boolean(session?.state?.liveAgentRequestedAt && Date.parse(session.state.liveAgentRequestedAt) + LIVE_REQUEST_TTL_MS > Date.now());
const redact = value => typeof value === 'string' ? value.slice(0, 2000).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]').replace(/\b\d{6,}\b/g, '[number]') : null;

class LiveAgentQueue {
  constructor() {
    this.queues = new Map(); // queueName -> [{ sessionId, customerId, intent, requestedAt }]
  }

  enqueue({ queue = 'default', sessionId, customerId, intent = null }) {
    if (!sessionId || !customerId) throw new Error('Live agent queue requires sessionId and customerId');
    queueName(queue);
    for (const [name, items] of this.queues) { const active = items.filter(entry => Date.parse(entry.requestedAt) + LIVE_REQUEST_TTL_MS > Date.now()); if (active.length) this.queues.set(name, active); else this.queues.delete(name); }
    for (const [name, items] of this.queues) if (name !== queue && items.some(entry => entry.sessionId === sessionId)) throw new Error('Session is already queued');
    const list = this.queues.get(queue) || [];
    const existing = list.find((entry) => entry.sessionId === sessionId);
    if (existing) return { ...existing, queuePosition: list.indexOf(existing) + 1, alreadyQueued: true };
    if ([...this.queues.values()].reduce((sum, items) => sum + items.length, 0) >= 1000) throw new Error('Live agent queue is full');
    const entry = { sessionId, customerId, intent, requestedAt: new Date().toISOString() };
    list.push(entry);
    this.queues.set(queue, list);
    return { ...entry, queuePosition: list.length, alreadyQueued: false };
  }

  position(queue, sessionId) {
    const list = this.queues.get(queue) || [];
    const index = list.findIndex((entry) => entry.sessionId === sessionId);
    return index === -1 ? null : index + 1;
  }

  dequeueForAgent(queue = 'default') {
    const list = this.queues.get(queue) || [];
    return list.shift() || null;
  }

  remove(queue, sessionId) {
    const list = this.queues.get(queue) || [];
    this.queues.set(queue, list.filter((entry) => entry.sessionId !== sessionId));
  }

  size(queue = 'default') {
    return (this.queues.get(queue) || []).length;
  }
}

function isLiveAgentSession(session) {
  return Boolean(session?.state?.liveAgentActive && session?.state?.liveAgentId);
}

function assignedLiveAgentId(session) {
  return session?.state?.liveAgentId || null;
}

/**
 * Validate a live-chat sender. Customers must own the session; agents must
 * be the assigned live agent. Anything else is denied, even if the socket
 * is authenticated as an agent principal for another session.
 */
function validateLiveSender({ role, senderId, session }) {
  if (!session) throw new Error('Session not found');
  if (!isLiveAgentSession(session)) throw new Error('Session is not in live agent mode');
  if (role === 'customer') {
    if (String(session.userId) !== String(senderId)) throw new Error('Access denied');
    return true;
  }
  if (role === 'agent') {
    if (String(assignedLiveAgentId(session)) !== String(senderId)) throw new Error('Access denied');
    return true;
  }
  throw new Error('Unknown live chat sender role');
}

function validateLiveContent(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Message content required');
  if (content.length > MAX_LIVE_MESSAGE_LENGTH) throw new Error('Message too long');
  return content;
}

function buildLiveMessage({ sessionId, senderRole, senderId, content }) {
  validateLiveContent(content);
  return {
    id: `live_${randomUUID()}`,
    sessionId,
    senderRole,
    senderId,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Transfer context for the assigned agent. Built from session state and
 * the recent transcript (last 10 messages, content + direction only).
 * Applies bounded credential/long-number redaction to transcript text. This is
 * not comprehensive PII classification; only the assigned agent may receive it.
 */
function buildTransferContext(session, history = []) {
  const state = session?.state || {};
  const recent = (Array.isArray(history) ? history : []).slice(-10).map((message) => ({
    direction: message.direction || null,
    content: redact(message.content),
    timestamp: message.timestamp || null,
  }));
  return {
    sessionId: session?.sessionId || null,
    customerId: session?.userId || null,
    intent: state.lastIntent || state.currentStep || null,
    conversationStage: state.conversationStage || null,
    liveAgentId: state.liveAgentId || null,
    liveAgentStartedAt: state.liveAgentStartedAt || null,
    reason: redact(state.liveAgentReason),
    recentMessages: recent,
  };
}

module.exports = {
  LiveAgentQueue,
  isLiveAgentSession,
  assignedLiveAgentId,
  validateLiveSender,
  validateLiveContent,
  buildLiveMessage,
  buildTransferContext,
  MAX_LIVE_MESSAGE_LENGTH,
  LIVE_REQUEST_TTL_MS, queueName, boundedReason, hasLiveRequest,
};
