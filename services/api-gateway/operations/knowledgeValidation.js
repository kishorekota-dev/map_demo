/** Strict preflight for connector imports; control-plane publication/ACL checks remain authoritative.
 * Version is optional input because the control plane assigns an internal revision.
 * Pattern checks flag obvious sensitive text for review, not comprehensive PII detection.
 */
const { identifier } = require('../control-plane/config');
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const CARD_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

function validateKnowledgeDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { valid: false, errors: ['document must be an object'] };
  for (const field of ['id', 'title', 'content', 'source']) {
    if (typeof doc[field] !== 'string' || !doc[field].trim()) errors.push(`${field} is required`);
  }
  if (!identifier(doc.id)) errors.push('id must be a supported identifier');
  for (const [field, max] of [['title', 200], ['source', 1000]]) if (typeof doc[field] === 'string' && doc[field].length > max) errors.push(`${field} exceeds its length limit`);
  if (doc.version !== undefined && !((typeof doc.version === 'string' && doc.version.trim() && doc.version.length <= 200) || (Number.isSafeInteger(doc.version) && doc.version > 0))) errors.push('version must be a nonempty label or positive revision when supplied');
  if (typeof doc.source === 'string') {
    const source = doc.source.trim();
    if ([...source].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) errors.push('source contains control characters');
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
      try { const url = new URL(source); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) errors.push('source must be a safe HTTP(S) URL or named reference'); }
      catch { errors.push('source URL is invalid'); }
    }
  }
  if (typeof doc.content === 'string') {
    if (doc.content.trim().length < 20) errors.push('content must be at least 20 characters');
    if (doc.content.length > 50000) errors.push('content must be at most 50,000 characters');
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
  if (!Array.isArray(docs) || docs.length < 1 || docs.length > 50) return { valid: false, errors: ['batch must contain 1–50 documents'], results: [] };
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
