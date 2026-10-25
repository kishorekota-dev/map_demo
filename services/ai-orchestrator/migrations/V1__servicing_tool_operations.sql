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
