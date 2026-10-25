/** Bounded process-local pilot cache. Not a replacement for a durable effect ledger. */
const copy = (value) => structuredClone(value);
class IdempotencyStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, maxEntries = 10000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }
  _key(adapterId, toolName, idempotencyKey) {
    return JSON.stringify([adapterId, toolName, idempotencyKey]);
  }
  _prune() {
    for (const [key, entry] of this.entries)
      if (!entry.pending && entry.expiresAt <= Date.now())
        this.entries.delete(key);
  }
  inFlight(adapterId, toolName, idempotencyKey) {
    return !!this.entries.get(this._key(adapterId, toolName, idempotencyKey))
      ?.pending;
  }
  get(adapterId, toolName, idempotencyKey) {
    if (!idempotencyKey) return null;
    this._prune();
    const entry = this.entries.get(
      this._key(adapterId, toolName, idempotencyKey),
    );
    return entry?.result ? copy(entry.result) : null;
  }
  put(adapterId, toolName, idempotencyKey, result) {
    if (!idempotencyKey) return;
    const key = this._key(adapterId, toolName, idempotencyKey);
    const old = this.entries.get(key);
    this._prune();
    if (result.outcome === "failed" && !old) return;
    if (!old && this.entries.size >= this.maxEntries)
      throw Object.assign(
        new Error("Pilot idempotency cache is full; no call was dispatched"),
        { status: 503 },
      );
    this.entries.set(key, {
      fingerprint: old?.fingerprint,
      ...(result.outcome === "failed" ? {} : { result: copy(result) }),
      expiresAt: Date.now() + this.ttlMs,
    });
  }
  async execute(adapterId, toolName, idempotencyKey, fingerprint, action) {
    if (!idempotencyKey) return action();
    this._prune();
    const key = this._key(adapterId, toolName, idempotencyKey);
    const previous = this.entries.get(key);
    if (previous) {
      if (!previous.fingerprint || previous.fingerprint !== fingerprint)
        throw Object.assign(
          new Error("Idempotency key is already bound to different arguments"),
          { status: 409 },
        );
      if (previous.pending || previous.result)
        return copy(previous.pending ? await previous.pending : previous.result);
    }
    if (!previous && this.entries.size >= this.maxEntries)
      throw Object.assign(
        new Error("Pilot idempotency cache is full; no call was dispatched"),
        { status: 503 },
      );
    const pending = Promise.resolve()
      .then(action)
      .then(
        (result) => {
          this.entries.set(key, {
            fingerprint,
            ...(result.outcome === "failed" ? {} : { result: copy(result) }),
            expiresAt: Date.now() + this.ttlMs,
          });
          return result;
        },
        (error) => {
          this.entries.set(key, {
            fingerprint,
            expiresAt: Date.now() + this.ttlMs,
          });
          throw error;
        },
      );
    this.entries.set(key, { fingerprint, pending, expiresAt: Infinity });
    return pending;
  }
  clear() {
    this.entries.clear();
  }
}
module.exports = IdempotencyStore;
