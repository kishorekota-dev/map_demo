# NLU HTTP API examples

Use direct internal origin `http://localhost:3003` or the gateway's preserved `/api/nlu` prefix. Production/internal-auth-required direct requests need the server credential. Do not expose that secret to a browser; the trusted gateway injects it.

```bash
curl http://localhost:3003/api/nlu/intents \
  -H "X-Servicing-Service-Token: $SERVICING_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"show my balance","sessionId":"owned-session"}'

curl http://localhost:3003/api/nlu/analyze \
  -H "X-Servicing-Service-Token: $SERVICING_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"user_input":"show my balance","sessionId":"owned-session","languageCode":"en-US"}'
```

`/intents` expects `message`; `/analyze` expects `user_input`. Both validate 1–1000 characters. The primary intent vocabulary is canonical snake_case, for example `balance_inquiry`, not historical dotted names. The analyze response additionally exposes component results; use the actual returned wrapper rather than assuming all endpoints share one shape.

| Method/path below `/api/nlu` | Contract |
| --- | --- |
| POST `/intents` | `{message,sessionId?,userId?}` intent detection |
| POST `/banking` | `{message}` banking matcher |
| POST `/entities` | `{message,domain?:"general|banking"}` |
| POST `/dialogflow` | `{message,sessionId?}` active wrapper; local/mock when disabled |
| POST `/analyze` | `{user_input,sessionId?,userId?,languageCode?}` combined analysis |
| POST `/process` | Legacy text-processing compatibility |
| GET `/intents/available`, `/banking/intents`, `/banking/entities` | Discovery |
| POST/GET/DELETE `/context/:sessionId` | In-memory context; POST uses `{context:{...}}` |
| POST `/train` | Validated `trainingData` request returns 501 `NLU_TRAINING_UNSUPPORTED` |
| GET `/health` | Safe public liveness |
| GET `/capabilities`, `/dialogflow/status` | Internal authenticated diagnostics |

The same router is available under `/api/nlp`; `/api/process` is the older compatibility alias. [Routes](src/routes/nlu.routes.js) and [controller](src/controllers/nlu.controller.js) are the exact validation/response contract. [Published runtime recognition](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md) supersedes this hint for governed workflows.
