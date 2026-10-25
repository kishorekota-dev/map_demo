# Determinism, replay, and recovery

The correctness boundary is deterministic policy and authoritative domain results, not a promise that every natural-language or provider response is identical. This document describes the current implementation and its limits.

## Request paths

Chat sends a new request to the orchestrator and sends pending customer replies to its feedback endpoint. Legacy NLU supplies a canonical hint. With control-plane governance enabled, published literal/lexical/external/LLM recognition determines the actual intent. A live provider, newly published release, changed domain state, or different user input can change the result.

| Layer | Controlled behavior | Limit |
| --- | --- | --- |
| Published policy | Drafts are isolated; a workflow pins one release/environment/cohort | Deployment provider endpoints and credentials can rotate outside a release |
| Literal/lexical recognition | Same catalog, rules, and input produce the same candidate ordering | Lexical similarity is not embedding semantics or calibrated probability |
| External/LLM recognition | Published catalog IDs, thresholds, ambiguity policy, and bounded JSON results | Hosted/local inference is not guaranteed bit-for-bit reproducible |
| Fields | Canonical validators plus additive published requirements/schemas | Model extraction may vary; its output still must validate |
| Confirmation | Canonical and sensitive-tool floors remain; continuation revalidates data | A model cannot supply verified confirmation |
| Tool selection | Canonical handler and published allowlist determine available operations | A new executable action requires a reviewed handler |
| Financial mutation | Stable interaction key, dispatch ledger, explicit uncertain outcome | There is no atomic exactly-once transaction across the bank and runtime |
| Response | Banking values come from deterministic formatting of raw tool results | Optional no-tool model prose can vary |
| Coordination | Local mutex plus enabled PostgreSQL session advisory lock | Memory-only development mode is not cross-worker or restart safe |

## Operation identity

REST clients retain `X-Interaction-ID` across retries of the same new action; socket clients use `clientMessageId`. Feedback retains the original pinned interaction ID. The mutation ledger keys tenant, session, interaction, and tool, and hashes action parameters without credentials.

A successful prior action returns its recorded result. Reusing a key with different parameters is rejected. A dispatched action without an acknowledged durable outcome becomes `reconciliation_required`; it is not blindly retried on another transport. An operator records an external evidence reference when reconciling it. A reconciled failed key remains blocked.

After acknowledged completion, ancillary transcript/evidence/session-write failure must not turn success into an automatic new action. A stale pending session blocks a fresh process request; confirmation retry uses the original ledger key. Storage recovery can still require operator attention. These safeguards do not deduplicate a different business action that the client intentionally submits under a new key.

## Model controls

See [provider configuration](../guides/llm-providers.md). Missing `config.llm` preserves the legacy environment-controlled model paths; explicit disabled blocks all legacy/plugin calls; enabled profiles are pinned to the release. Model providers receive their explicit server credential, never the customer's bearer token. Tool-backed generation remains deterministic even when a model profile is enabled.

Temperature zero and provider-specific sampling controls are best-effort reproducibility settings, not an audit replay guarantee. Profile temperature can be omitted when a server registration declares it unsupported. Model timeouts apply to text/JSON requests; channel response budgets do not cancel financial tools.

`MCP_TRANSPORT=http` is the default adapter selection. `protocol` and `auto` use the repository WebSocket client where available; read fallback and connection behavior are documented in the [MCP integration guide](../../services/ai-orchestrator/MCP-INTEGRATION-README.md). The durable mutation path does not retry a dispatched financial effect just because its acknowledgement was lost.

## Persistence is layered

`ai_sessions`, `ai_human_feedback`, and the tool ledger provide persistent release/continuation and outcome data. Production graph checkpoints and pending writes now persist synchronously in PostgreSQL; production rejects disabled or memory checkpoints. Owner-authorized recovery resumes the original interaction with fresh credentials and its pinned release. Confirmation/data feedback remains in SQL and financial effects remain protected by the ledger. See [checkpoint recovery](../../services/ai-orchestrator/WHY-CHECKPOINTER-IS-REQUIRED.md). Checkpoints contain customer context, so retention and database access controls still apply; they are not an immutable audit archive.

## Verification

Run the relevant workspace suites from the repository root:

```bash
npm test -w services/ai-orchestrator -- --runInBand
npm test -w services/chat-backend -- --runInBand
npm test -w services/mcp-service -- --runInBand
npm test -w services/nlu-service -- --runInBand
npm test -w services/api-gateway -- --runInBand
```

Set `RUNTIME_TEST_DATABASE_URL` to an isolated PostgreSQL test database for actual multi-worker/restart/replay tests. Without it, those database tests are skipped. Provider tests use synthetic fixtures and do not certify the separate Mac Studio or a cloud account. Current test output, deployment smoke tests, provider contract verification, and recovery drills are evidence; historical test reports are not current readiness certificates.
