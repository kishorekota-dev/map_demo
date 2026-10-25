/**
 * Outcome analytics from runtime + case events (pure computation).
 *
 * The operations service already reports /analytics (intent/channel/
 * outcome counts, p95, repeat customers) and /costs (cost per completed
 * interaction). What was missing for a "best-in-class" claim was:
 * first-contact resolution (FCR), AI containment, and a channel
 * breakdown that includes live agent and IVR — computed from the same
 * event stream, with the definition stated in code, not in a slide.
 *
 * Definitions (all over the supplied event window):
 * - interaction: distinct (sessionId, interactionId) pairs are NOT in
 *   these events, so an interaction here is a distinct sessionId with at
 *   least one runtime.execution event at stage 'conversation'.
 * - completed: a session whose last conversation-stage outcome is
 *   complete/completed/succeeded.
 * - firstContactResolution: a completed session whose customer (actorHash)
 *   has no case.created event and no new session starting within 7 days
 *   after the session's last event. This is a proxy, not a survey: a
 *   customer who never returns is counted resolved, and a customer who
 *   returns for an unrelated reason is counted unresolved. Both limits
 *   are stated in the response, not hidden.
 * - containment: completed sessions with no case.created event and no
 *   live-agent transfer event (kind 'live.agent.started' when present)
 *   in the same session, over all sessions.
 * - repeatContactRate: customers with >1 session in the window over all
 *   customers in the window.
 *
 * Input events (normalized from the operations store documents):
 * [{ sessionId, actorHash, channel, intent, outcome, stage, type,
 *    createdAt (ISO string), kind? }]
 * type is 'runtime.execution' or 'case.created'.
 */

const COMPLETED_OUTCOMES = new Set(['complete', 'completed', 'succeeded']);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function computeOutcomeMetrics(events) {
  const list = Array.isArray(events) ? events : [];
  const conversations = list.filter((e) => e.type === 'runtime.execution' && e.stage === 'conversation' && e.sessionId);
  const cases = list.filter((e) => e.type === 'case.created');

  const sessions = new Map(); // sessionId -> { channel, intent, actorHash, lastOutcome, lastAt, firstAt }
  for (const event of conversations) {
    const at = Date.parse(event.createdAt) || 0;
    const existing = sessions.get(event.sessionId);
    if (!existing || at >= existing.lastAt) {
      sessions.set(event.sessionId, {
        channel: event.channel || null,
        intent: event.intent || null,
        actorHash: event.actorHash || null,
        lastOutcome: event.outcome || null,
        lastAt: at,
        firstAt: existing ? existing.firstAt : at,
      });
    }
  }

  const caseSessionIds = new Set(cases.map((e) => e.sessionId).filter(Boolean));
  const caseCustomers = new Set(cases.map((e) => e.actorHash).filter(Boolean));
  const liveAgentSessionIds = new Set(list.filter((e) => e.kind === 'live.agent.started').map((e) => e.sessionId).filter(Boolean));

  // Sessions per customer, in time order, for the 7-day FCR window.
  const sessionsByCustomer = new Map();
  for (const [sessionId, session] of sessions) {
    if (!session.actorHash) continue;
    if (!sessionsByCustomer.has(session.actorHash)) sessionsByCustomer.set(session.actorHash, []);
    sessionsByCustomer.get(session.actorHash).push({ sessionId, ...session });
  }
  for (const arr of sessionsByCustomer.values()) arr.sort((a, b) => a.firstAt - b.firstAt);

  let completed = 0;
  let firstContactResolved = 0;
  let contained = 0;
  const byChannel = new Map();

  for (const [sessionId, session] of sessions) {
    const isCompleted = COMPLETED_OUTCOMES.has(session.lastOutcome);
    if (isCompleted) completed += 1;
    const channelEntry = byChannel.get(session.channel || 'unknown') || { interactions: 0, completed: 0 };
    channelEntry.interactions += 1;
    if (isCompleted) channelEntry.completed += 1;
    byChannel.set(session.channel || 'unknown', channelEntry);

    if (isCompleted) {
      const laterSessions = (sessionsByCustomer.get(session.actorHash) || []).filter(
        (s) => s.sessionId !== sessionId && s.firstAt > session.lastAt && s.firstAt - session.lastAt <= SEVEN_DAYS_MS,
      );
      const hasCase = caseCustomers.has(session.actorHash) || caseSessionIds.has(sessionId);
      if (!hasCase && laterSessions.length === 0) firstContactResolved += 1;
    }
    if (!caseSessionIds.has(sessionId) && !liveAgentSessionIds.has(sessionId)) contained += 1;
  }

  const customers = sessionsByCustomer.size;
  const repeatCustomers = [...sessionsByCustomer.values()].filter((arr) => new Set(arr.map((s) => s.sessionId)).size > 1).length;

  return {
    interactions: sessions.size,
    completed,
    completionRate: sessions.size ? Number((completed / sessions.size).toFixed(4)) : null,
    firstContactResolved,
    firstContactResolutionRate: completed ? Number((firstContactResolved / completed).toFixed(4)) : null,
    containmentRate: sessions.size ? Number((contained / sessions.size).toFixed(4)) : null,
    repeatContactRate: customers ? Number((repeatCustomers / customers).toFixed(4)) : null,
    byChannel: [...byChannel.entries()].map(([channel, entry]) => ({
      channel,
      interactions: entry.interactions,
      completed: entry.completed,
      completionRate: entry.interactions ? Number((entry.completed / entry.interactions).toFixed(4)) : null,
    })),
    limitations: [
      'FCR is a proxy: no return within 7 days and no case is counted as resolved; an unrelated return counts as unresolved.',
      'Containment counts sessions with no case and no live-agent transfer; it does not prove the customer was satisfied.',
      'Only events in the supplied window are used; a return after the window is invisible.',
    ],
  };
}

module.exports = { computeOutcomeMetrics };
