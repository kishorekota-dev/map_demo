// Compares lexical, semantic and hybrid procedure retrieval on labelled cases so
// operators can choose a strategy and similarity floor from evidence. Each case
// names the procedure that should answer it, or null when nothing should match.
// Retrieval runs exactly as at runtime; nothing is stored.
const { retrieveProcedures, procedureSimilarities } = require('./procedureRetrieval');
const { selectProfile } = require('../llm/profiles');

const LIMITS = { cases: 50, question: 2000 };
const STRATEGIES = ['lexical', 'semantic', 'hybrid'];

function validateCases(cases, procedures) {
  const ids = new Set((procedures || []).map(procedure => procedure.id));
  if (!Array.isArray(cases) || !cases.length || cases.length > LIMITS.cases
    || cases.some(entry => !entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['question', 'expectedProcedureId'].includes(key))
      || typeof entry.question !== 'string' || !entry.question.trim() || entry.question.length > LIMITS.question
      || !(entry.expectedProcedureId === null || ids.has(entry.expectedProcedureId)))) {
    throw Object.assign(new Error(`Provide 1 to ${LIMITS.cases} cases, each with a question and the id of a configured procedure, or null when nothing should match.`), { status: 400 });
  }
}

const distinctProcedures = matches => [...new Set(matches.map(match => match.procedureId))];

function score(results) {
  const answerable = results.filter(result => result.expected !== null);
  const unanswerable = results.filter(result => result.expected === null);
  const rank = result => result.procedures.indexOf(result.expected) + 1;
  const ratio = (count, total) => (total ? Number((count / total).toFixed(4)) : null);
  return {
    answerable: answerable.length, unanswerable: unanswerable.length,
    hitAt1: ratio(answerable.filter(result => rank(result) === 1).length, answerable.length),
    hitAt3: ratio(answerable.filter(result => rank(result) >= 1 && rank(result) <= 3).length, answerable.length),
    mrr: ratio(answerable.reduce((total, result) => total + (rank(result) ? 1 / rank(result) : 0), 0), answerable.length),
    correctRejections: ratio(unanswerable.filter(result => !result.procedures.length).length, unanswerable.length),
    fallbacks: results.filter(result => result.mode === 'lexical_fallback').length
  };
}

// The floor (on a 0.01 grid) that best separates questions that should match
// from those that should not. Several disjoint ranges can tie; the widest one is
// the largest margin (ties prefer the higher, stricter range), and its midpoint
// resists overfitting to these cases.
function suggestFloor(similarities) {
  const answerable = similarities.filter(entry => entry.expected !== null);
  if (!answerable.length) return null;
  const correct = floor => similarities.filter(entry => (entry.expected === null ? entry.best < floor : (entry.similarity ?? -1) >= floor)).length;
  const grid = Array.from({ length: 101 }, (_value, index) => index / 100);
  const counts = grid.map(correct);
  const top = Math.max(...counts);
  let best = null; let start = null;
  for (let index = 0; index <= grid.length; index += 1) {
    if (index < grid.length && counts[index] === top) { if (start === null) start = index; continue; }
    if (start !== null && (!best || index - start >= best.end - best.start)) best = { start, end: index };
    start = null;
  }
  return { minSimilarity: grid[Math.floor((best.start + best.end - 1) / 2)], correct: top, cases: similarities.length,
    basis: similarities.some(entry => entry.expected === null) ? 'matched_and_unmatched_cases' : 'matched_cases_only' };
}

async function evaluateRetrieval({ config, cases, channel = 'digital', minSimilarity, index }) {
  validateCases(cases, config.procedures);
  let profile = null;
  try { profile = config.llm?.enabled && config.llm.routing?.embedding ? selectProfile(config.llm, 'embedding') : null; } catch (_error) { profile = null; }
  const floor = minSimilarity ?? config.retrieval?.minSimilarity ?? 0.5;
  const strategies = {};
  const perCase = cases.map(entry => ({ question: entry.question, expectedProcedureId: entry.expectedProcedureId, strategies: {} }));
  for (const strategy of STRATEGIES) {
    if (strategy !== 'lexical' && !profile) { strategies[strategy] = { available: false, reason: 'embedding_route_not_configured' }; continue; }
    const results = [];
    for (const [position, entry] of cases.entries()) {
      const retrieved = await retrieveProcedures({ procedures: config.procedures, question: entry.question, channel, llm: config.llm, index, wait: true,
        retrieval: { ...config.retrieval, strategy, minSimilarity: floor, maxResults: config.retrieval?.maxResults || 3 } });
      const procedures = distinctProcedures(retrieved.matches);
      results.push({ expected: entry.expectedProcedureId, procedures, mode: retrieved.mode });
      perCase[position].strategies[strategy] = { procedures, mode: retrieved.mode, ...(retrieved.fallbackReason ? { fallbackReason: retrieved.fallbackReason } : {}) };
    }
    const fallbacks = results.filter(result => result.mode === 'lexical_fallback').length;
    strategies[strategy] = strategy !== 'lexical' && fallbacks === results.length
      ? { available: false, reason: perCase[0].strategies[strategy].fallbackReason || 'embedding_unavailable' }
      : { available: true, ...score(results) };
  }
  let calibration = null;
  if (profile && strategies.semantic.available) {
    const similarities = [];
    for (const [position, entry] of cases.entries()) {
      const best = await procedureSimilarities({ procedures: config.procedures, question: entry.question, channel, llm: config.llm, retrieval: config.retrieval, index });
      const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
      const similarity = entry.expectedProcedureId === null ? null : best.get(entry.expectedProcedureId) ?? null;
      const round = value => (value === null || value === undefined ? null : Number(value.toFixed(4)));
      perCase[position].similarity = { expected: round(similarity), best: round(ranked[0]?.[1]), bestProcedureId: ranked[0]?.[0] || null };
      similarities.push({ expected: entry.expectedProcedureId, similarity, best: ranked[0]?.[1] ?? -1 });
    }
    calibration = suggestFloor(similarities);
  }
  return { channel, minSimilarity: floor, embedding: profile ? { profileId: profile.id, providerId: profile.providerId, model: profile.model } : null,
    strategies, calibration, results: perCase };
}

module.exports = { evaluateRetrieval, suggestFloor, LIMITS };
