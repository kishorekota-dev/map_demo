# Determinism & End-to-End Remediation

This document summarizes the remediation that made the banking conversational
pipeline **function end-to-end** and **behave deterministically**. It is the
companion to [Deterministic Behavior](architecture/determinism.md).

## Background

A multi-agent audit found that, despite "production-ready" docs, the documented
banking pipeline did not execute end-to-end and was not deterministic:

- The canonical AI workflow (`ai-orchestrator`, LangGraph + policy engine) was
  **wired into nothing** — no caller consumed it.
- The live `chat-backend` path POSTed to `/api/process` on services that had no
  such route, so every reply collapsed to a hardcoded template.
- The response LLM ran at `temperature 0.7`, and a falsy-zero bug made
  `temperature 0` unsettable.
- All 9 intent-specific prompts were dead (key-prefix mismatch).
- Three incompatible intent vocabularies had no mapping layer.
- The orchestrator never injected `authToken` (every banking call → 401).
- 8 referenced tools had no handler; `api-gateway` could not start; `agent-ui`
  had an always-true auth bypass; tests were effectively absent.

## What changed

### Wiring (the pipeline now runs)
- `chat-backend/agentOrchestrator` rewritten as a deterministic
  **NLU → ai-orchestrator** pipeline; removed the broken `/api/process` fan-out.
- The user's JWT is propagated chat-backend → orchestrator → banking tools.
- `api-gateway` now boots and exposes a route to `ai-orchestrator` (:3007).
- Human-input / confirmation / escalation states flow back to the chat and to
  the agent dashboard; `agent-ui` request/response protocol now has a server
  dispatcher (calls no longer hang).

### Determinism
- NaN-safe LLM config; **temperature/top_p default to 0**, pinned seed.
- Tool-backed replies always use the deterministic formatter over authoritative
  raw banking results; optional response generation is limited to no-tool
  intents and requires `OPENAI_ENABLED=true` plus a usable key.
- Remote SLM extraction requires `SLM_ENABLED=true`; an explicit local
  `SLM_BASE_URL` can enable extraction without a remote key. The extractor is
  forced to temperature 0 + JSON mode when enabled.
- Intent-prompt key mismatch fixed — all intents use their tailored prompts;
  startup assertion fails fast on any unresolved prompt.
- Single **canonical intent vocabulary**; NLU maps every classifier name to it;
  DialogFlow is advisory behind a confidence threshold; fixed fallback intent.
- Deterministic agent routing (pure function of intent + state, not live load).
- Confirm-then-execute path re-runs the same validation as the graph path.
- MCP transport pinned (no implicit per-error fallback).
- Per-session mutex serializes session read-modify-write (no lost updates);
  reads are side-effect free.
- Timeouts cancel in-flight requests (AbortController); only network failures
  are retried, never timeouts — no duplicate state-changing calls.

### Correctness & contracts
- `authToken` injected into every banking tool call; missing-auth fails fast.
- Tool names reconciled; **all 27 canonical tools resolve to MCP handlers**;
  5 missing tools implemented; cross-service contract enforced at startup + test.
- 7 declared-but-unimplemented intents fully implemented (16 intents total).
- `report_fraud` urgent path no longer forced into a confirmation gate.
- express-validator now enforced on orchestrator routes; MCP validates tool args.

### Cleanup
- Deleted dead mock routes, the legacy tool catalog, empty `poc-*` shells, and
  the broken `docker-compose-mcp.yml`; `agent-ui/server-old.js` removed.

### Tests & CI
- Contract + determinism + concurrency regression tests added across services.
- `.github/workflows/ci.yml` runs them as a gate.

### Durable chat state
- `chat-backend` now writes sessions and messages through `DatabaseService` to
  its dedicated `poc_chat` PostgreSQL database and lazily restores active
  sessions plus full message metadata after a service restart.
- Database health participates in the service health check when persistence is
  enabled; the Compose profiles fail fast instead of silently falling back to
  process memory.

## Known follow-ups (not done in this pass)
- **OIDC/SAML:** the enterprise generator emits OIDC/SAML config but no
  token-issuer validation is implemented (local JWT only).
- **`packages/*` legacy track** and `docker-compose-enterprise.yml` are separate
  from the canonical `services/*` product and were not modernized.
- **Per-service docs** (e.g. some `ARCHITECTURE.md` persistence/DialogFlow
  claims) may still over-state; the canonical references are this document, the
  [determinism doc](architecture/determinism.md), and the root `README.md`.
