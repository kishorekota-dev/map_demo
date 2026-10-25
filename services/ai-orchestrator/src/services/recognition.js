// Shared with the control-plane evaluator. This is lexical recognition, not an
// embedding model. A configured provider can supply semantic candidate scores.
const STOP = new Set('a an the my me i we you please can could would should want need to of in on for is are was be how what much do does did have has it this that with and show tell give get like temporarily other between dollar dollars usd one two three four five ten twenty thirty forty fifty hundred'.split(' '));
const DEFAULT_SYNONYMS = {
  balance: ['funds', 'money', 'cash', 'remaining', 'left'], transaction: ['transactions', 'purchases', 'spending', 'activity', 'charges'],
  transfer: ['send', 'move', 'remit', 'transfer'], card: ['cards', 'plastic', 'debit', 'credit'], fraud: ['fraudulent', 'unauthorized', 'suspicious'],
  replace: ['replacement', 'renew'], block: ['freeze', 'lock', 'suspend'], account: ['accounts', 'checking', 'savings'],
  history: ['recent', 'past', 'previous'], lost: ['missing', 'misplaced'], help: ['assistance', 'support']
};
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function recognize(config, text, externalResult = null) {
  const settings = config.recognition || { strategy: 'literal', confidenceThreshold: 0.65, ambiguityMargin: 0.12, ambiguityAction: 'clarify' };
  const threshold = settings.confidenceThreshold ?? 0.65;
  const margin = settings.ambiguityMargin ?? 0.12;
  const input = normalize(text);
  const entries = config.intents || [];
  const literal = entries.flatMap(entry => (entry.patterns || []).map(pattern => ({ intent: entry.id, phrase: normalize(pattern) })))
    .filter(entry => entry.phrase && (` ${input} `).includes(` ${entry.phrase} `))
    .sort((a, b) => b.phrase.length - a.phrase.length || a.intent.localeCompare(b.intent, 'en'));
  if (literal.length) {
    const longest = literal[0].phrase.length;
    const tied = [...new Set(literal.filter(entry => entry.phrase.length === longest).map(entry => entry.intent))];
    return { intent: tied.length === 1 ? tied[0] : null, confidence: 1, ambiguous: tied.length > 1,
      candidates: tied.map(intent => ({ intent, confidence: 1 })), source: 'literal', reason: tied.length > 1 ? 'ambiguous' : 'matched' };
  }
  let candidates = [];
  let source = ['external', 'llm'].includes(settings.strategy) ? 'lexical_fallback' : 'lexical';
  if (['external', 'llm'].includes(settings.strategy) && Array.isArray(externalResult?.candidates)) {
    source = settings.strategy;
    candidates = externalResult.candidates.slice(0, 1000).filter(item => item && typeof item === 'object' && entries.some(entry => entry.id === item.intent)
      && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1);
  } else if (settings.strategy !== 'literal') {
    const dictionary = new Map();
    Object.entries({ ...DEFAULT_SYNONYMS, ...(settings.synonyms || {}) }).forEach(([canonical, aliases]) => {
      [canonical, ...aliases].forEach(alias => dictionary.set(normalize(alias), normalize(canonical)));
    });
    const tokens = value => new Set(normalize(value).split(' ').filter(word => word && !STOP.has(word)).map(word => dictionary.get(word) || word));
    const query = tokens(input);
    const actionTerms = new Set(['transfer', 'block', 'activate', 'replace', 'verify', 'dispute', 'report']);
    const weight = term => actionTerms.has(term) ? 2.5 : 1;
    const sum = set => [...set].reduce((total, term) => total + weight(term), 0);
    candidates = entries.map(entry => {
      const examples = [...(entry.patterns || []), entry.name || '', entry.description || '', entry.id.replace(/_/g, ' ')];
      const confidence = Math.max(0, ...examples.map(example => {
        const terms = tokens(example);
        const matches = [...query].filter(term => terms.has(term)).reduce((total, term) => total + weight(term), 0);
        return matches ? (2 * matches) / (sum(query) + sum(terms)) : 0;
      }));
      return { intent: entry.id, confidence: Math.round(confidence * 1000) / 1000 };
    });
  }
  const unique = new Map();
  for (const item of candidates) if (!unique.has(item.intent) || unique.get(item.intent).confidence < item.confidence) unique.set(item.intent, { intent: item.intent, confidence: item.confidence });
  candidates = [...unique.values()]
    .filter(item => item.confidence > 0).sort((a, b) => b.confidence - a.confidence || a.intent.localeCompare(b.intent, 'en')).slice(0, 5);
  const best = candidates[0];
  const ambiguous = Boolean(best && candidates[1] && best.confidence - candidates[1].confidence < margin);
  const accepted = best && best.confidence >= threshold && !ambiguous;
  return { intent: accepted ? best.intent : null, confidence: best?.confidence || 0, ambiguous, candidates, source,
    reason: !best ? 'no_match' : ambiguous ? 'ambiguous' : !accepted ? 'below_threshold' : 'matched' };
}
module.exports = { recognize, normalize, DEFAULT_SYNONYMS };
