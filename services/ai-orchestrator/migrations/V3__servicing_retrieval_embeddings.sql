-- Content-addressed embeddings of customer-audience procedure chunks. The key is
-- a SHA-256 of provider, model and the embedded text, so edits and model changes
-- create new rows. No procedure text and no customer question is stored here.
CREATE TABLE IF NOT EXISTS servicing_retrieval_embeddings (
  cache_key TEXT PRIMARY KEY CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions BETWEEN 1 AND 8192),
  vector REAL[] NOT NULL CHECK (cardinality(vector) = dimensions),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS servicing_retrieval_embeddings_last_used
  ON servicing_retrieval_embeddings (last_used_at);
