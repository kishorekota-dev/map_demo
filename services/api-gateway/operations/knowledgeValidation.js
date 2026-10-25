/**
 * Knowledge-document validation for ingestion (pure, no I/O).
 *
 * Knowledge connectors already sync documents into the operations store
 * (knowledge.synced events). What was missing was a gate before a
 * document becomes an answer source: a document with no source, no
 * version, an empty body, or obvious PII in its text should not be
 * citable by the assistant. This module is that gate — call it from the
 * import path before storing, not after publishing.
 *
 * Rules:
 * - id, title, content, source and version are required, non-empty.
 * - content must be at least 20 characters (a one-line stub is not
 *   knowledge) and at most 1,000,000 characters.
 * - content must not contain an email address, a 13–19 digit card-like
 *   number, or a US SSN pattern. These are rejected, not redacted, so a
 *   bad import is visible instead of silently altered.
 * - version must be a non-empty string; source must be a URL or a
 *   named internal source (no empty, no "unknown").
 *
 * Returns { valid, errors: [] }. A document with any error is not
 * ingestible. Batch validation (validateKnowledgeBatch) also rejects
 * duplicate ids within the batch.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const CARD_PATTERN = /\b\d{13,19}\b/;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

function validateKnowledgeDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { valid: false, errors: ['document must be an object'] };
  for (const field of ['id', 'title', 'content', 'source', 'version']) {
    if (typeof doc[field] !== 'string' || !doc[field].trim()) errors.push(`${field} is required`);
  }
  if (typeof doc.content === 'string') {
    if (doc.content.trim().length < 20) errors.push('content must be at least 20 characters');
    if (doc.content.length > 1000000) errors.push('content must be at most 1,000,000 characters');
    if (EMAIL_PATTERN.test(doc.content)) errors.push('content contains an email address');
    if (CARD_PATTERN.test(doc.content)) errors.push('content contains a card-like number');
    if (SSN_PATTERN.test(doc.content)) errors.push('content contains a Social Security number pattern');
  }
  if (typeof doc.source === 'string' && doc.source.trim().toLowerCase() === 'unknown') {
    errors.push('source must not be "unknown"');
  }
  return { valid: errors.length === 0, errors };
}

function validateKnowledgeBatch(docs) {
  if (!Array.isArray(docs)) return { valid: false, errors: ['batch must be an array'], results: [] };
  const seen = new Set();
  const results = docs.map((doc) => {
    const result = validateKnowledgeDocument(doc);
    if (typeof doc?.id === 'string' && doc.id) {
      if (seen.has(doc.id)) result.errors.push(`duplicate id "${doc.id}" in batch`);
      seen.add(doc.id);
    }
    return { id: doc?.id || null, valid: result.errors.length === 0, errors: result.errors };
  });
  return { valid: results.every((r) => r.valid), errors: results.flatMap((r) => r.errors), results };
}

module.exports = { validateKnowledgeDocument, validateKnowledgeBatch };
