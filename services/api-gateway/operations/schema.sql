-- Dedicated-deployment operational data. Run as migration owner when
-- OPERATIONS_MANAGE_SCHEMA=false; the application role needs DML privileges.
CREATE TABLE IF NOT EXISTS servicing_operations_records (
  tenant_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1, document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, kind, id)
);
CREATE INDEX IF NOT EXISTS servicing_operations_listing ON servicing_operations_records(tenant_id,kind,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS servicing_operations_search ON servicing_operations_records USING GIN(document jsonb_path_ops);
CREATE UNIQUE INDEX IF NOT EXISTS servicing_case_idempotency ON servicing_operations_records(tenant_id,(document->>'idempotencyKey')) WHERE kind='case';
CREATE UNIQUE INDEX IF NOT EXISTS servicing_identity_subject ON servicing_operations_records(tenant_id,(document->>'issuer'),(document->>'subject')) WHERE kind='identity';
CREATE TABLE IF NOT EXISTS servicing_operations_jobs (
  tenant_id TEXT NOT NULL, id UUID NOT NULL, case_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), locked_at TIMESTAMPTZ, lease_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(tenant_id,id)
);
ALTER TABLE servicing_operations_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'create';
CREATE INDEX IF NOT EXISTS servicing_jobs_ready ON servicing_operations_jobs(tenant_id,status,next_run_at);
CREATE TABLE IF NOT EXISTS servicing_operations_events (
  seq BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, id UUID NOT NULL UNIQUE,
  document JSONB NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS servicing_events_listing ON servicing_operations_events(tenant_id,seq DESC);
CREATE INDEX IF NOT EXISTS servicing_events_session ON servicing_operations_events(tenant_id,(document->>'sessionId'),seq DESC);
CREATE INDEX IF NOT EXISTS servicing_events_time ON servicing_operations_events(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS servicing_records_time ON servicing_operations_records(tenant_id,kind,created_at DESC);
