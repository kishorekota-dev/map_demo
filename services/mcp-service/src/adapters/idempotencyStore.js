/**
 * In-memory idempotency store for generic adapter executions.
 *
 * Keyed by adapter + tool + caller-supplied idempotencyKey. A completed
 * result is replayed verbatim (with replayed: true) instead of calling the
 * backend again; an uncertain result is replayed as uncertain — the caller
 * must reconcile it, never blindly retry it. Failed results are NOT cached:
 * a definitive backend failure did not mutate (or the backend says so), so
 * the same key may be retried.
 *
 * LIMIT (documented, not hidden): this store is per-process and in-memory.
 * It protects against duplicate calls within one running instance. It does
 * NOT survive a restart or span instances. That is why mutating calls also
 * forward Idempotency-Key to the backend: a backend that honours that header
 * is the durable dedupe layer, and the orchestrator's effect ledger is the
 * record of record. Do not present this store as the sole guarantee for
 * financial mutations.
 */
class IdempotencyStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, maxEntries = 10000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  _key(adapterId, toolName, idempotencyKey) {
    return `${adapterId}:${toolName}:${idempotencyKey}`;
  }

  _prune(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      // Map preserves insertion order: evict the oldest entry first.
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }

  get(adapterId, toolName, idempotencyKey) {
    if (!idempotencyKey) return null;
    this._prune();
    const entry = this.entries.get(this._key(adapterId, toolName, idempotencyKey));
    if (!entry) return null;
    return { ...entry.result, replayed: true };
  }

  put(adapterId, toolName, idempotencyKey, result) {
    if (!idempotencyKey) return;
    if (result.outcome !== 'completed' && result.outcome !== 'uncertain') return;
    this._prune();
    this.entries.set(this._key(adapterId, toolName, idempotencyKey), {
      result: { ...result },
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = IdempotencyStore;
