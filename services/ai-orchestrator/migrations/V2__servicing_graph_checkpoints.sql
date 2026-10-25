-- Durable LangGraph snapshots and task writes. The runner owns the transaction.
-- Separate from the effect ledger: a graph checkpoint is not a banking receipt.
CREATE TABLE IF NOT EXISTS servicing_graph_checkpoints (
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_type TEXT NOT NULL,
  checkpoint BYTEA NOT NULL,
  metadata_type TEXT NOT NULL,
  metadata BYTEA NOT NULL,
  metadata_index JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,thread_id,checkpoint_ns,checkpoint_id)
);
CREATE TABLE IF NOT EXISTS servicing_graph_writes (
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  write_index INTEGER NOT NULL,
  task_path TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value BYTEA NOT NULL,
  PRIMARY KEY (tenant_id,thread_id,checkpoint_ns,checkpoint_id,task_id,write_index)
);
CREATE INDEX IF NOT EXISTS servicing_graph_checkpoint_history
  ON servicing_graph_checkpoints(tenant_id,thread_id,checkpoint_ns,checkpoint_id DESC);
