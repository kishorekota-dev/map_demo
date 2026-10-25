# Manual Dialogflow import boundaries

The repository retains agent JSON and ZIP export assets in [dialogflow-config](dialogflow-config/). They describe an earlier banking demo and are not proof of an active cloud deployment. Inspect the selected archive, project ownership, intent names, entities, and replacement/merge behavior before importing it through an authorized enterprise console.

Imports can modify existing agent behavior. Follow the target project's normal review/backup process and verify the imported catalog using synthetic requests in that environment. Do not put service-account keys into the export, repository, browser configuration, or control-plane prompt fields.

The active server uses `dialogflow.service.js` and server-owned project credentials. The enhanced SDK module is not a runtime deployment API, and `/api/nlu/train` is unsupported. For maintained configuration and verification details, use the [integration guide](DIALOGFLOW-INTEGRATION-GUIDE.md), [deployment guide](DIALOGFLOW-DEPLOYMENT-GUIDE.md), and [API reference](API-EXAMPLES.md).
