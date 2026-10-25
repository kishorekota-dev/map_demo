# NLU compatibility service

The service on port **3003** provides the existing canonical intent hint, entity helpers, and NLP compatibility endpoints used by chat. With the control plane enabled, the orchestrator's published recognition policy determines the actual servicing intent; this service does not override releases, action authorization, or model-provider profiles.

## Current references

- [Architecture and boundaries](ARCHITECTURE.md)
- [HTTP examples](API-EXAMPLES.md)
- [Quick reference](QUICK-REFERENCE.md)
- [Optional Dialogflow integration](DIALOGFLOW-INTEGRATION-GUIDE.md)
- [Published recognition/model runtime](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md)

SDK implementation summaries, deployment-status snapshots, and review reports are historical; they do not prove a current Google project or model is deployed.

## Classification behavior

`POST /api/nlu/intents` uses deterministic banking patterns first. When no banking result meets the configured threshold, enabled Dialogflow is advisory, followed by the local matcher and a canonical `general_inquiry` fallback. Canonical names are snake_case, such as `balance_inquiry` and `transfer_funds`; dotted names in older examples are raw/provider vocabulary, not the public primary intent contract.

`POST /api/nlu/analyze` combines the Dialogflow service wrapper with banking analysis and exposes a canonical primary intent. Disabled Dialogflow supplies demo responses only outside production. Explicitly enabled providers must initialize with valid server environment credentials or service startup fails; live API failures never become mock results. In production, `/analyze` and `/dialogflow` return 503 when their provider is disabled/unavailable. `/intents` continues deterministic local matching when the optional provider fails. Do not equate demo output with live provider validation.

Intent cache keys include user, session, and normalized text. The service's context map/cache remain in memory and are not a tenant-owned durable conversation store. It has no authority to perform banking operations.

## API surface

The router is mounted at `/api/nlu` and legacy `/api/nlp` directly on the service. Protected gateway routes and service-to-service credentials are separate boundaries.

| Method | Path suffix | Input/purpose |
| --- | --- | --- |
| POST | `/intents` | `{message,userId?,sessionId?}` → canonical hint |
| POST | `/analyze` | `{user_input,userId?,sessionId?,languageCode?}` → combined analysis |
| POST | `/process` | Legacy NLP processing compatibility |
| POST | `/banking` | `{message}` → banking matcher detail |
| POST | `/entities` | `{message,domain?:"general|banking"}` |
| POST | `/dialogflow` | `{message,sessionId?}` → optional provider wrapper |
| GET | `/intents/available` | Available canonical vocabulary |
| GET | `/banking/intents`, `/banking/entities` | Banking pattern/entity catalog |
| POST/GET/DELETE | `/context/:sessionId` | In-memory context operations; POST requires `{context:{...}}` |
| POST | `/train` | Validated request returns **501 `NLU_TRAINING_UNSUPPORTED`**; no runtime model training |
| GET | `/health`, `/capabilities`, `/dialogflow/status` | Operational/capability information |

Main text validators accept 1–1000 characters. A capability/status response describes configuration, not verified provider accuracy or production readiness. Use [API examples](API-EXAMPLES.md) for exact request shapes.

## Configuration and start

The active configuration is [src/config/config.js](src/config/config.js), not the legacy top-level `config/` file.

| Variable | Behavior |
| --- | --- |
| `NLU_SERVICE_PORT` | Listener; default 3003 |
| `INTENT_CONFIDENCE_THRESHOLD` | Primary threshold; falls back to `CONFIDENCE_THRESHOLD`, default 0.6 |
| `DIALOGFLOW_ENABLED` | Explicit `true` enables the optional wrapper's live client initialization |
| `DIALOGFLOW_PROJECT_ID` | Required project when initializing that client |
| `DIALOGFLOW_CREDENTIALS_JSON` | Server environment JSON with `type:"service_account"`, `client_email`, and a valid RSA `private_key`; required when enabled |
| `DIALOGFLOW_LANGUAGE_CODE` | Default `en-US` |
| `INTERNAL_SERVICE_AUTH_REQUIRED` | Explicit internal-service gate; production enables it regardless |
| `SERVICING_SERVICE_TOKEN` | Header credential for internal callers; never a customer/provider credential |

```bash
# From repository root, with dependencies and environment configured
npm run dev:nlu
npm test -w services/nlu-service -- --runInBand
```

Use Node 22. Keep NLU internal and enable the service-token gate for production. No separate `nlp-service` runs in this monorepo. New application LLMs—including the separate Mac Studio/Qwen target—belong in the orchestrator's [provider registry](../../docs/guides/llm-providers.md), not in this compatibility service's historical SDK demos.

Credential-file paths and implicit Application Default Credentials are no longer accepted by the active wrapper. Migrate file/ambient identity deployments to explicit server environment injection before enabling the provider. Credentials are not accepted in HTTP bodies; SDK options select only the service-account email/private key and never a caller-controlled token endpoint. Provider results redact these configured credential values before returning them. Provider status `configured` describes initialization, not a live connection or qualified deployment. The enhanced SDK demonstration is disabled in production.
