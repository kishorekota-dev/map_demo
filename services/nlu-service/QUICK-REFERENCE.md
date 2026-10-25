# NLU quick reference

Start with Node 22: `npm run dev:nlu` from the repository root. Test with `npm test -w services/nlu-service -- --runInBand`. Default port is 3003 via `NLU_SERVICE_PORT`.

- POST `/api/nlu/intents`: `message` (1–1000 characters), optional session/user IDs.
- POST `/api/nlu/analyze`: `user_input` (1–1000 characters), optional session/user/language.
- GET `/health`: safe liveness; no provider request.
- POST `/api/nlu/train`: explicitly unsupported, returns 501 after validation.
- Production or `INTERNAL_SERVICE_AUTH_REQUIRED=true`: server token required; the trusted gateway/chat caller injects it.

Optional Dialogflow uses `DIALOGFLOW_ENABLED`, `DIALOGFLOW_PROJECT_ID`, and server credentials. Unconfigured mode is local/mock; never describe it as a verified live provider. The mounted runtime uses `dialogflow.service.js`, not the enhanced SDK example. Governed application LLM profiles are in the AI orchestrator.

See [API examples](API-EXAMPLES.md), [architecture](ARCHITECTURE.md), [provider setup](DIALOGFLOW-INTEGRATION-GUIDE.md), and [current README](README.md).
