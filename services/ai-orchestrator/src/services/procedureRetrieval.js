// Retrieval of customer-audience procedure chunks for grounded answers.
//   lexical  - deterministic BM25 (procedureRuntime.retrieve); no model involved.
//   semantic - cosine similarity between the question and chunk embeddings.
//   hybrid   - reciprocal-rank fusion of the BM25 and cosine rankings, which needs
//              no calibration between their different score scales.
// Retrieval only grounds answers. Procedure binding and guardrails never depend on
// it, so when embeddings are unavailable or the index is still being built the
// lexical result is used and the reason is reported.
const procedureRuntime = require('./procedureRuntime');
const { getEmbeddingIndex } = require('./embeddingIndex');

const STRATEGIES = new Set(['lexical', 'semantic', 'hybrid']);
const RRF_K = 60;
const LEXICAL_DEPTH = 20;
const PREFIX_KEYS = ['queryPrefix', 'documentPrefix'];
// Embedding task prefix: short text without control characters.
const unsafePrefix = value => value !== undefined && (typeof value !== 'string' || value.length > 64
  || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));

function validateRetrieval(retrieval) {
  if (retrieval === undefined) return;
  const semantic = retrieval?.strategy === 'semantic' || retrieval?.strategy === 'hybrid';
  if (!retrieval || typeof retrieval !== 'object' || Array.isArray(retrieval) || !STRATEGIES.has(retrieval.strategy)
    || Object.keys(retrieval).some(key => !['strategy', 'minSimilarity', 'maxResults', ...PREFIX_KEYS].includes(key))
    || PREFIX_KEYS.some(key => unsafePrefix(retrieval[key]))
    || ((semantic || retrieval.minSimilarity !== undefined) && (!Number.isFinite(retrieval.minSimilarity) || retrieval.minSimilarity < 0 || retrieval.minSimilarity > 1))
    || (retrieval.maxResults !== undefined && (!Number.isInteger(retrieval.maxResults) || retrieval.maxResults < 1 || retrieval.maxResults > 5))) {
    throw new Error('Unsafe published retrieval configuration');
  }
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return NaN;
  let dot = 0; let left = 0; let right = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; left += a[index] * a[index]; right += b[index] * b[index]; }
  return left && right ? dot / Math.sqrt(left * right) : NaN;
}

const order = (a, b) => a.procedureId.localeCompare(b.procedureId) || a.text.localeCompare(b.text);
const fallbackReason = error => ({ RETRIEVAL_INDEX_WARMING: 'index_warming', RETRIEVAL_INDEX_TOO_LARGE: 'index_too_large', RETRIEVAL_DIMENSION_MISMATCH: 'embedding_mismatch' }[error?.code]
  || 'embedding_unavailable');

// The exact text embedded for a chunk, including any model task prefix.
const documentText = (chunk, retrieval) => `${retrieval?.documentPrefix || ''}${chunk.embeddingText}`;

// Every eligible chunk with its cosine similarity to the question, best first.
async function semanticRanking({ chunks, question, llm, index, recordUsage, wait, retrieval }) {
  const vectors = await index.documentVectors(llm, chunks.map(chunk => documentText(chunk, retrieval)), { recordUsage, wait });
  if (vectors.some(vector => !vector)) throw Object.assign(new Error('Index evicted during retrieval'), { code: 'RETRIEVAL_INDEX_WARMING' });
  const query = await index.queryVector(llm, `${retrieval?.queryPrefix || ''}${question}`, recordUsage);
  const ranked = chunks.map((chunk, position) => ({ chunk, similarity: cosine(query, vectors[position]) }));
  if (ranked.some(entry => !Number.isFinite(entry.similarity))) throw Object.assign(new Error('Query and document embeddings differ'), { code: 'RETRIEVAL_DIMENSION_MISMATCH' });
  return ranked.sort((a, b) => b.similarity - a.similarity || order(a.chunk, b.chunk));
}

// Returns { strategy, mode, matches, fallbackReason? }. mode is the strategy
// actually used: lexical, semantic, hybrid or lexical_fallback.
async function retrieveProcedures({ procedures, question, channel = 'digital', retrieval, llm, recordUsage, index = getEmbeddingIndex(), wait = false }) {
  const strategy = retrieval?.strategy || 'lexical';
  const limit = retrieval?.maxResults || 3;
  const lexical = procedureRuntime.retrieve(procedures, question, { channel, limit: strategy === 'hybrid' ? LEXICAL_DEPTH : limit });
  if (strategy === 'lexical') return { strategy, mode: 'lexical', matches: lexical };
  const chunks = procedureRuntime.documentChunks(procedures, { channel });
  if (!chunks.length || !procedureRuntime.tokenize(question).length) return { strategy, mode: strategy, matches: [] };
  let ranking;
  try {
    ranking = await semanticRanking({ chunks, question, llm, index, recordUsage, wait, retrieval });
  } catch (error) {
    return { strategy, mode: 'lexical_fallback', fallbackReason: fallbackReason(error), matches: lexical.slice(0, limit) };
  }
  const similar = ranking.filter(entry => entry.similarity >= retrieval.minSimilarity);
  const rounded = value => Number(value.toFixed(4));
  if (strategy === 'semantic') {
    return { strategy, mode: 'semantic', matches: similar.slice(0, limit)
      .map(({ chunk, similarity }) => ({ ...procedureRuntime.publicMatch(chunk), score: rounded(similarity), similarity: rounded(similarity) })) };
  }
  // Hybrid: a chunk qualifies through either ranking (BM25 thresholds or the
  // similarity floor) and is ordered by the sum of 1 / (60 + rank) across both.
  const fused = new Map();
  const similarityOf = new Map(ranking.map(({ chunk, similarity }) => [procedureRuntime.chunkKey(chunk), similarity]));
  lexical.forEach((match, position) => {
    const key = procedureRuntime.chunkKey(match);
    fused.set(key, { match, lexicalScore: match.score, score: 1 / (RRF_K + position + 1) });
  });
  similar.forEach(({ chunk }, position) => {
    const key = procedureRuntime.chunkKey(chunk);
    const entry = fused.get(key) || { match: procedureRuntime.publicMatch(chunk), score: 0 };
    entry.score += 1 / (RRF_K + position + 1);
    fused.set(key, entry);
  });
  const matches = [...fused.entries()].map(([key, entry]) => ({ ...entry, similarity: similarityOf.get(key) }))
    .sort((a, b) => b.score - a.score || (b.similarity ?? -1) - (a.similarity ?? -1) || order(a.match, b.match))
    .slice(0, limit)
    .map(({ match, score, similarity, lexicalScore }) => ({ ...procedureRuntime.publicMatch(match), score: Number(score.toFixed(6)),
      ...(Number.isFinite(similarity) ? { similarity: rounded(similarity) } : {}), ...(lexicalScore !== undefined ? { lexicalScore } : {}) }));
  return { strategy, mode: 'hybrid', matches };
}

// The best similarity each eligible procedure reaches for a question; used to
// calibrate the similarity floor in retrieval evaluation.
async function procedureSimilarities({ procedures, question, channel = 'digital', llm, retrieval, index = getEmbeddingIndex(), wait = true }) {
  const chunks = procedureRuntime.documentChunks(procedures, { channel });
  if (!chunks.length) return new Map();
  const best = new Map();
  for (const { chunk, similarity } of await semanticRanking({ chunks, question, llm, index, wait, retrieval })) {
    if (!best.has(chunk.procedureId)) best.set(chunk.procedureId, similarity);
  }
  return best;
}

module.exports = { validateRetrieval, retrieveProcedures, procedureSimilarities, documentText, cosine, RRF_K };
