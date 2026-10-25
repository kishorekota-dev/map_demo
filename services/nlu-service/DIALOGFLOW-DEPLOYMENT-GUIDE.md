# Deploying optional Dialogflow configuration

Use an enterprise-owned Google project and authorized service identity. Review the current [integration contract](DIALOGFLOW-INTEGRATION-GUIDE.md) and active configuration before enabling the provider. Existing agent export ZIPs/JSON under `dialogflow-config` are historical assets; verify their content and target project rather than assuming a previously recorded deployment still exists.

Deploy reviewed intents/entities through the organization's approved Google console or deployment pipeline. Then configure project, language, and server credentials; restart the NLU service; check authenticated provider status; and run approved synthetic intent probes in that target environment. A successful startup or local/mock classification does not prove live provider access. This documentation pass made no cloud changes or model requests.

Keep intent normalization compatible with [canonical vocabulary](src/services/nlu.service.js). The control-plane published recognition determines actual governed servicing behavior, so evaluate changes in that path as well. Runtime `/api/nlu/train` returns 501 and is not a deployment tool.

See [manual import boundaries](DIALOGFLOW-MANUAL-IMPORT-GUIDE.md), [API examples](API-EXAMPLES.md), and [service README](README.md).
