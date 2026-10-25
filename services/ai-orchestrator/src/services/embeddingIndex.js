// Content-addressed cache of procedure chunk embeddings. A vector is keyed by a
// hash of provider, model and the exact embedded text, so edited procedures and
// model changes get new keys and a stale vector is never reused. Vectors live in
// memory and, in durable mode, in PostgreSQL so restarts and replicas share them.
// Customer questions are embedded per request and are never cached or stored.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { embedWithProfile, selectProfile } = require('../llm/profiles');

const BATCH = 32;
const DEFAULTS = { maxEntries: 20000, inlineBudget: 64, maxChunks: 10000 };
const failure = (code, message) => Object.assign(new Error(message), { code });

class EmbeddingStore {
  constructor(persistence) { this.persistence = persistence; this.ready = null; this.prunedAt = 0; }
  enabled() { return this.persistence.enabled(); }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      await this.persistence.initialize();
      const pool = this.persistence.pool;
      if (process.env.WORKFLOW_SCHEMA_AUTO_MIGRATE === 'false') {
        await pool.query('SELECT cache_key,vector,last_used_at FROM servicing_retrieval_embeddings LIMIT 0');
        return;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('servicing-retrieval-schema', 0))");
        await client.query(fs.readFileSync(path.join(__dirname, '../../migrations/V3__servicing_retrieval_embeddings.sql'), 'utf8'));
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    })().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async get(keys) {
    await this.initialize();
    const pool = this.persistence.pool;
    const rows = (await pool.query('SELECT cache_key,vector FROM servicing_retrieval_embeddings WHERE cache_key = ANY($1)', [keys])).rows;
    // Recency is recorded at most daily per row, and old rows are pruned hourly.
    pool.query("UPDATE servicing_retrieval_embeddings SET last_used_at=now() WHERE cache_key = ANY($1) AND last_used_at < now() - interval '1 day'", [rows.map(row => row.cache_key)]).catch(() => {});
    if (Date.now() - this.prunedAt > 3600000) {
      this.prunedAt = Date.now();
      pool.query("DELETE FROM servicing_retrieval_embeddings WHERE last_used_at < now() - interval '30 days'").catch(() => {});
    }
    return new Map(rows.map(row => [row.cache_key, row.vector.map(value => Math.fround(Number(value)))]));
  }
  async put(entries, { providerId, model }) {
    if (!entries.length) return;
    await this.initialize();
    const values = []; const rows = [];
    for (const [key, vector] of entries) {
      values.push(key, providerId, model, vector.length, vector);
      const at = values.length - 4;
      rows.push(`($${at},$${at + 1},$${at + 2},$${at + 3},$${at + 4}::real[])`);
    }
    await this.persistence.pool.query(`INSERT INTO servicing_retrieval_embeddings (cache_key,provider_id,model,dimensions,vector)
      VALUES ${rows.join(',')} ON CONFLICT (cache_key) DO NOTHING`, values);
  }
}

class EmbeddingIndex {
  constructor({ store = null, embed = embedWithProfile, ...options } = {}) {
    Object.assign(this, DEFAULTS, options);
    this.store = store; this.embed = embed;
    this.memory = new Map(); this.pending = new Map();
  }
  key(profile, text) { return createHash('sha256').update(JSON.stringify([profile.providerId, profile.model, text])).digest('hex'); }
  remember(key, vector) {
    this.memory.delete(key); this.memory.set(key, vector);
    while (this.memory.size > this.maxEntries) this.memory.delete(this.memory.keys().next().value);
  }
  recall(key) {
    const vector = this.memory.get(key);
    if (vector) { this.memory.delete(key); this.memory.set(key, vector); }
    return vector;
  }
  storeAvailable() { return Boolean(this.store?.enabled()); }

  // Vectors for the texts, in order. When more than the inline budget is missing
  // the rest is embedded in the background and RETRIEVAL_INDEX_WARMING is thrown,
  // so a newly published release never stalls a customer's turn.
  async documentVectors(llm, texts, { recordUsage, wait = false } = {}) {
    if (texts.length > this.maxChunks) throw failure('RETRIEVAL_INDEX_TOO_LARGE', 'Too many procedure chunks for semantic retrieval.');
    const profile = selectProfile(llm, 'embedding');
    const keys = texts.map(text => this.key(profile, text));
    const textOf = new Map(keys.map((key, index) => [key, texts[index]]));
    let missing = [...new Set(keys.filter(key => !this.memory.has(key)))];
    if (missing.length && this.storeAvailable()) {
      // A storage outage only costs recomputation; retrieval still works.
      try { for (const [key, vector] of await this.store.get(missing)) this.remember(key, vector); } catch (_error) { /* embed instead */ }
      missing = missing.filter(key => !this.memory.has(key));
    }
    if (missing.length) {
      const work = this.embedMissing(llm, profile, missing.map(key => [key, textOf.get(key)]), recordUsage);
      if (!wait && missing.length > this.inlineBudget) {
        work.catch(() => {});
        throw failure('RETRIEVAL_INDEX_WARMING', 'The retrieval index is still being built.');
      }
      await work;
    }
    return keys.map(key => this.recall(key));
  }

  // Missing keys are embedded in sequential batches, joining any batch already in
  // flight for the same key. The first failure stops the remaining batches.
  embedMissing(llm, profile, entries, recordUsage) {
    const joined = []; const fresh = [];
    for (const [key, text] of entries) (this.pending.has(key) ? joined.push(this.pending.get(key)) : fresh.push([key, text]));
    let chain = Promise.resolve();
    const batches = [];
    for (let start = 0; start < fresh.length; start += BATCH) {
      const batch = fresh.slice(start, start + BATCH);
      const promise = chain.then(async () => {
        const response = await this.embed(llm, batch.map(([, text]) => text), 'document', recordUsage);
        const embedded = batch.map(([key], index) => [key, response.vectors[index]]);
        for (const [key, vector] of embedded) this.remember(key, vector);
        if (this.storeAvailable()) await this.store.put(embedded, profile).catch(() => {});
      });
      chain = promise;
      for (const [key] of batch) this.pending.set(key, promise);
      promise.catch(() => {}).finally(() => { for (const [key] of batch) if (this.pending.get(key) === promise) this.pending.delete(key); });
      batches.push(promise);
    }
    return Promise.all([...joined, ...batches]);
  }

  // Builds the index for a release ahead of customer questions. Never throws.
  warm(llm, texts, options = {}) {
    return this.documentVectors(llm, texts, { ...options, wait: true }).then(() => true, () => false);
  }

  async queryVector(llm, question, recordUsage) {
    return (await this.embed(llm, [question], 'query', recordUsage)).vectors[0];
  }
}

let shared = new EmbeddingIndex();
// Server start supplies durable storage; until then the index is memory-only.
const configureEmbeddingIndex = ({ persistence } = {}) => { shared = new EmbeddingIndex({ store: persistence ? new EmbeddingStore(persistence) : null }); return shared; };
const getEmbeddingIndex = () => shared;

module.exports = { EmbeddingIndex, EmbeddingStore, configureEmbeddingIndex, getEmbeddingIndex, BATCH };
