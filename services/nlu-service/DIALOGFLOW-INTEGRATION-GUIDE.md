# Optional Dialogflow integration

The active wrapper is [dialogflow.service.js](src/services/dialogflow.service.js), configured through [src/config/config.js](src/config/config.js). It uses the installed `@google-cloud/dialogflow` SessionsClient for intent detection. The enhanced SDK module and older SDK implementation reports are exploratory/historical, not the mounted request path.

Set `DIALOGFLOW_ENABLED=true` and `DIALOGFLOW_PROJECT_ID` for an enterprise-owned project. Configure `DIALOGFLOW_KEY_FILENAME` or Application Default Credentials through `GOOGLE_APPLICATION_CREDENTIALS` / the deployment identity; do not commit credential files or pass them in a client request. `DIALOGFLOW_LANGUAGE_CODE` defaults to `en-US`. Check the exact active environment mapping before deployment.

Without usable enablement/project configuration, the wrapper returns local/mock results. That behavior does not verify cloud credentials or deployed intents. The `/intents` pipeline catches optional provider failures and uses local matching; `/analyze` uses a distinct combined path and may return an error for live provider failures.

Legacy agent JSON assets in [dialogflow-config](dialogflow-config/) are optional import inputs, not evidence of a current deployment. Review them against the canonical vocabulary before using an authorized enterprise console import. Runtime `/train` does not train or deploy an agent.

The published orchestrator catalog remains authoritative when control-plane governance is enabled. Its external/LLM recognition strategy is a separate contract. See [NLU API](API-EXAMPLES.md), [deployment procedure](DIALOGFLOW-DEPLOYMENT-GUIDE.md), and [governed recognition](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md#recognition).
