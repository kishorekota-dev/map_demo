-- Control-plane state is isolated by the authenticated deployment tenant.
-- Each mutation locks its tenant row and commits revision, releases and audit
-- together. Apply with psql "$CONTROL_PLANE_DATABASE_URL" -f schema.sql when
-- production application roles intentionally do not have CREATE privileges.
CREATE TABLE IF NOT EXISTS servicing_control_plane_state (
  tenant_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0),
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state->>'schemaVersion' = '1'),
  CHECK (state->'tenant'->>'id' = tenant_id)
);

CREATE TABLE IF NOT EXISTS servicing_control_plane_records (
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, kind, id),
  FOREIGN KEY (tenant_id) REFERENCES servicing_control_plane_state(tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS servicing_control_plane_records_listing
  ON servicing_control_plane_records(tenant_id, kind, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS servicing_control_plane_records_document
  ON servicing_control_plane_records USING GIN(document jsonb_path_ops);
CREATE INDEX IF NOT EXISTS servicing_control_plane_knowledge_search
  ON servicing_control_plane_records USING GIN(to_tsvector('simple', coalesce(document->>'title','') || ' ' || coalesce(document->>'content','')))
  WHERE kind='knowledge_published';
