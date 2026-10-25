CREATE TABLE IF NOT EXISTS servicing_resume_grants (
  grant_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  target_channel TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS servicing_resume_grants_expiry ON servicing_resume_grants(expires_at);
