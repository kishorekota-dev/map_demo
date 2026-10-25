CREATE TABLE IF NOT EXISTS servicing_tool_operations (
  operation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('dispatched','succeeded','reconciliation_required','failed')),
  result JSONB,
  resolution JSONB,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS servicing_tool_operations_tenant_status ON servicing_tool_operations(tenant_id,status,created_at DESC);

-- Upgrade early ledgers before verification-only startup. Existing operations are preserved.
ALTER TABLE servicing_tool_operations ADD COLUMN IF NOT EXISTS resolution JSONB;
ALTER TABLE servicing_tool_operations ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE servicing_tool_operations DROP CONSTRAINT IF EXISTS servicing_tool_operations_status_check;
ALTER TABLE servicing_tool_operations ADD CONSTRAINT servicing_tool_operations_status_check
  CHECK(status IN ('dispatched','succeeded','reconciliation_required','failed'));
