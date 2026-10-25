/** Observed runtime-event metrics, not independently verified customer outcomes. */
const COMPLETED_OUTCOMES = new Set(['complete', 'completed', 'succeeded']);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const OUTCOME_EVENT_LIMIT = 50000;
const validId = value => typeof value === 'string' && value.length > 0;
const rate = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(4)) : null;

function computeOutcomeMetrics(events, { windowEnd = new Date().toISOString() } = {}) {
  const end = Date.parse(windowEnd);
  if (!Number.isFinite(end)) throw new Error('A valid observation cutoff is required.');
  const list = (Array.isArray(events) ? events : []).filter(event => event && typeof event === 'object'
    && Number.isFinite(Date.parse(event.createdAt)) && Date.parse(event.createdAt) <= end)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || Number(a.sequence || 0) - Number(b.sequence || 0));
  const interactions = new Map();
  for (const event of list) {
    if (event.type !== 'runtime.execution' || event.stage !== 'conversation' || !validId(event.sessionId)) continue;
    // Legacy events without an interaction ID have one explicitly labeled session bucket.
    const key = JSON.stringify([event.sessionId, validId(event.interactionId) ? event.interactionId : null]);
    const at = Date.parse(event.createdAt);
    const previous = interactions.get(key);
    interactions.set(key, { sessionId: event.sessionId, interactionId: event.interactionId || null,
      channel: event.channel || previous?.channel || 'unknown', actorHash: event.actorHash || previous?.actorHash || null,
      lastOutcome: event.outcome, firstAt: previous ? Math.min(previous.firstAt, at) : at, lastAt: at,
      handoffObserved: previous?.handoffObserved || event.outcome === 'handoff' || event.outcome === 'human_escalation' });
  }
  const cases = list.filter(event => event.type === 'case.created');
  const transfers = list.filter(event => ['live.agent.started', 'live.agent.transferred'].includes(event.type)
    || ['live.agent.started', 'live.agent.transferred'].includes(event.kind));
  const contactIndex = events => {
    const result = new Map();
    for (const event of events) {
      if (!validId(event.sessionId)) continue;
      const item = result.get(event.sessionId) || { any: false, ids: new Set() };
      if (validId(event.interactionId)) item.ids.add(event.interactionId); else item.any = true;
      result.set(event.sessionId, item);
    }
    return result;
  };
  const caseContacts = contactIndex(cases), transferContacts = contactIndex(transfers);
  const linked = (index, item) => {
    const match = index.get(item.sessionId);
    return !!match && (match.any || !item.interactionId || match.ids.has(item.interactionId));
  };
  const caseTimes = new Map();
  for (const event of cases) if (validId(event.actorHash)) {
    if (!caseTimes.has(event.actorHash)) caseTimes.set(event.actorHash, []);
    caseTimes.get(event.actorHash).push(Date.parse(event.createdAt));
  }
  for (const times of caseTimes.values()) times.sort((a, b) => a - b);
  const sessions = new Map();
  for (const item of interactions.values()) {
    const previous = sessions.get(item.sessionId);
    sessions.set(item.sessionId, { actorHash: item.actorHash || previous?.actorHash,
      firstAt: Math.min(item.firstAt, previous?.firstAt ?? item.firstAt) });
  }
  const byCustomer = new Map();
  for (const session of sessions.values()) {
    if (!validId(session.actorHash)) continue;
    if (!byCustomer.has(session.actorHash)) byCustomer.set(session.actorHash, []);
    byCustomer.get(session.actorHash).push(session.firstAt);
  }
  for (const times of byCustomer.values()) times.sort((a, b) => a - b);
  const inRange = (times = [], from, to) => {
    let low = 0, high = times.length;
    while (low < high) { const mid = (low + high) >>> 1; if (times[mid] < from) low = mid + 1; else high = mid; }
    return low < times.length && times[low] <= to;
  };
  let completed = 0, resolved = 0, eligible = 0, pendingObservation = 0, unknownCustomer = 0, automated = 0;
  const channels = new Map();
  for (const item of interactions.values()) {
    const isCompleted = COMPLETED_OUTCOMES.has(item.lastOutcome);
    const channel = channels.get(item.channel) || { interactions: 0, completed: 0 };
    channel.interactions++;
    if (isCompleted) { completed++; channel.completed++; }
    channels.set(item.channel, channel);
    const hasCase = linked(caseContacts, item);
    const hasTransfer = item.handoffObserved || linked(transferContacts, item);
    if (isCompleted && !hasCase && !hasTransfer) automated++;
    if (!isCompleted) continue;
    if (!validId(item.actorHash)) { unknownCustomer++; continue; }
    if (item.lastAt + SEVEN_DAYS_MS > end) { pendingObservation++; continue; }
    eligible++;
    const returned = inRange(byCustomer.get(item.actorHash), item.lastAt + 1, item.lastAt + SEVEN_DAYS_MS);
    const followupCase = inRange(caseTimes.get(item.actorHash), item.firstAt, item.lastAt + SEVEN_DAYS_MS);
    if (!hasCase && !followupCase && !hasTransfer && !returned) resolved++;
  }
  const repeatCustomers = [...byCustomer.values()].filter(items => items.length > 1).length;
  return {
    scope: 'observed_runtime_event_proxy', observationCutoff: new Date(end).toISOString(), followUpDays: 7,
    interactions: interactions.size, sessions: sessions.size,
    legacySessionBuckets: [...interactions.values()].filter(item => !item.interactionId).length,
    completed, completionRate: rate(completed, interactions.size),
    firstContactResolved: resolved, firstContactEligibleCompleted: eligible,
    firstContactPendingObservation: pendingObservation, firstContactUnknownCustomer: unknownCustomer,
    firstContactResolutionRate: rate(resolved, eligible),
    containmentRate: null, containmentStatus: 'live_agent_event_coverage_unverified',
    observedAutomatedCompletions: automated, observedAutomatedCompletionRate: rate(automated, interactions.size),
    repeatContactRate: rate(repeatCustomers, byCustomer.size),
    byChannel: [...channels].sort(([a], [b]) => a.localeCompare(b)).map(([channel, counts]) => ({ channel, ...counts, completionRate: rate(counts.completed, counts.interactions) })),
    limitations: [
      'Completion is the last recorded conversation outcome per session/interaction, not independent provider or customer proof.',
      'FCR is a seven-day no-return/no-case proxy among completed contacts with known customer identity and a full observed follow-up period; recent and anonymous completions are excluded.',
      'An unrelated return may count against FCR; contacts outside the supplied event window are invisible.',
      'Live-agent events are not yet comprehensively forwarded into operations. Containment is unknown; observed automated completion is a separate proxy and may miss unrecorded human handling.',
      'Legacy conversation events without interaction IDs are grouped by session and counted explicitly.',
    ],
  };
}
module.exports = { computeOutcomeMetrics, OUTCOME_EVENT_LIMIT };
