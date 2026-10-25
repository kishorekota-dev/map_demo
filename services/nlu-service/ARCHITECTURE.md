# NLU architecture

The active server imports [src/config/config.js](src/config/config.js), mounts the same router under `/api/nlu` and `/api/nlp`, and exposes `/api/process` for compatibility. Port is `NLU_SERVICE_PORT`, default 3003. Production HTTP APIs require the internal service header; safe health checks remain public.

The [NLU service](src/services/nlu.service.js) first applies deterministic banking matching, then optional Dialogflow when no sufficient banking match exists, then local matching/fallback. Results normalize to canonical snake_case intent IDs. The primary `/intents` path catches optional provider failures; `/analyze` uses a distinct combined Dialogflow/banking wrapper and must not be assumed to have identical failure behavior.

[dialogflow.service.js](src/services/dialogflow.service.js) is the active provider wrapper. `dialogflow-enhanced.service.js` is SDK exploration code, not the mounted runtime. `DIALOGFLOW_ENABLED=true` plus a configured project enables the provider; disabled/unconfigured mode uses local/mock behavior. Cache and context are process-local, with context-scoped detection keys; they do not provide durable workflow or shared-worker state.

This service produces the legacy chat hint. When control-plane governance is enabled, the orchestrator's published recognition is authoritative and can use literal/lexical, external, or governed LLM recognition. Qwen/OpenAI/Gemini application plugins live there, not in this NLU service. See [runtime recognition](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md#recognition), [API](API-EXAMPLES.md), and [README](README.md).
