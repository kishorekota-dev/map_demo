# Deterministic Behavior

This platform is engineered so that the **banking use case is reproducible**:
for the same input and the same session state, the system produces the same
intent routing, the same data-collection / confirmation gates, the same tool
calls, the same policy decisions, and a stable response. Determinism is a
correctness property for a banking assistant — a confirmed transfer must behave
identically every time, and an auditor must be able to replay a conversation.

This document describes where determinism is enforced and how it is verified.

## End-to-end request flow

```
Customer ──ws──► chat-backend ──http──► nlu-service ──► (canonical intent)
                      │
                      └──http (Bearer JWT)──► ai-orchestrator
                                                  │  LangGraph workflow
                                                  │  + policy engine
                                                  └──► mcp-service ──► banking-service
```

Every customer message follows the **same fixed pipeline**:

1. **chat-backend** classifies the message via the NLU service, then calls the
   AI orchestrator. Routing is a pure function of `(intent, workflow state)` —
   it does **not** depend on live agent load or health.
2. **nlu-service** returns a single canonical intent (snake_case) from a
   deterministic classifier, with a fixed fallback intent.
3. **ai-orchestrator** runs the LangGraph workflow: deterministic routing,
   policy checks, data validation, tool execution, and response generation.
4. **mcp-service** executes the mapped banking tools.
5. **banking-service** is the authoritative system of record.

## Determinism guarantees by layer

| Layer | What is deterministic | How it is enforced |
|-------|----------------------|--------------------|
| Intent classification | Same text → same canonical intent | Deterministic pattern matcher is primary; DialogFlow is advisory only and gated behind a confidence threshold; one canonical fallback intent (`general_inquiry`). See `nlu-service/src/services/intent-vocabulary.js`. |
| Intent vocabulary | One vocabulary across services | Every classifier name is mapped to the orchestrator's snake_case vocabulary; parity with `intentConfig` is enforced by a contract test. |
| Workflow routing | Same state → same next node | LangGraph `StateGraph` with pure routing functions (`routeAfterIntent`, `routeAfterDataCheck`, `routeAfterTools`). |
| Data collection | Same input → same required/invalid fields by default | Rule-based `intentMapper.validateData`; remote SLM extraction requires `SLM_ENABLED=true`, while an explicit local `SLM_BASE_URL` is a separate opt-in. |
| Confirmation / limits | Same amount + state → same gate | Policy engine: regex + fixed thresholds (`>$25k` hard block, `≥$1k` confirmation). The confirm-then-execute path re-runs the same validation as the graph path. |
| Tool execution | Same tool set per intent; same call shape | `INTENT_TOOL_MAPPING` is static; a single pinned MCP transport (no implicit per-error fallback); arguments validated against each tool's schema. |
| Response generation | Tool-backed replies contain authoritative banking values | Any intent with a tool path uses the deterministic formatter over raw tool results. Optional remote generation can run only for no-tool intents and requires `OPENAI_ENABLED=true` plus a usable key. |
| Session state | No lost updates under concurrency | Per-session mutex serializes read-modify-write; reads are side-effect free. |

## Optional model configuration

Remote model calls are disabled by default. Tool-backed responses never use a
response LLM, even when it is enabled. If an operator explicitly enables remote
generation for no-tool intents or remote structured extraction, sampling is
pinned as follows:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_ENABLED` | `false` | Explicitly opt into remote generation for no-tool intents; also requires a usable `OPENAI_API_KEY`. |
| `OPENAI_TEMPERATURE` | `0` | Greedy decoding for reproducible responses. |
| `OPENAI_TOP_P` | `0` | Disable nucleus sampling. |
| `OPENAI_SEED` | `42` | Pin the seed where the endpoint supports it. |
| `SLM_ENABLED` | `false` | Explicitly opt into remote extraction; also requires a usable SLM or OpenAI key. |
| `SLM_BASE_URL` | unset | A non-empty local OpenAI-compatible URL is itself an opt-in and needs no remote key. |
| `SLM_TEMPERATURE` | `0` | Structured field extraction must be stable. |
| `SLM_JSON_MODE` | `true` | Force parseable JSON output. |
| `MCP_TRANSPORT` | `http` | Pin a single tool transport (no implicit fallback). |

> **Falsy-zero bug (fixed):** configuration uses NaN-safe parsing. The previous
> `parseFloat(x) || 0.7` silently overrode an explicit `0`, making determinism
> unconfigurable. Setting `OPENAI_TEMPERATURE=0` is now honored.

Pinned sampling is best-effort reproducibility for optional model calls, not the
banking-data correctness boundary. Raising temperature above 0 trades
reproducibility for response variety and is **not recommended**.

## Fail-fast contracts

Misconfiguration cannot silently degrade behavior:

- **Intent config consistency** — the orchestrator asserts at startup that every
  categorized intent has all five config blocks and that every referenced prompt
  template resolves (the historical "dead prompt" bug). See
  `intentMapper.assertConfigConsistency()`.
- **Tool contract** — the orchestrator's `CANONICAL_BANKING_TOOLS` must each map
  to an implemented MCP handler; the MCP server asserts this at startup and a
  cross-service test enforces it (would have caught the 8 missing tools and the
  `banking_transfer` rename).
- **Intent vocabulary parity** — a test asserts the NLU canonical set equals the
  orchestrator's intent set.

## What is *not* deterministic (by design)

- **Identifiers and timestamps** — request IDs, execution IDs, and reference
  numbers use `Date.now()` / random suffixes. These are intentionally unique and
  never drive control flow or business outcomes.
- **External ML (DialogFlow)** — treated as advisory only; the deterministic
  classifier wins on disagreement or low confidence.
- **Wall-clock dependent expiry** — session TTLs depend on real time.

## Verification

Determinism is covered by regression tests run in CI (`.github/workflows/ci.yml`):

- `ai-orchestrator/config/__tests__/determinism.test.js` — temperature/seed/transport defaults, falsy-zero regression.
- `ai-orchestrator/config/__tests__/intentConfig.test.js` — config consistency + prompt resolution + tool contract.
- `nlu-service/src/services/__tests__/intent-vocabulary.test.js` — mapping + cross-service parity.
- `mcp-service/src/tools/__tests__/toolContract.test.js` — tool-name resolution + argument validation.
- `chat-backend/services/__tests__/keyedMutex.test.js` — per-session serialization.
