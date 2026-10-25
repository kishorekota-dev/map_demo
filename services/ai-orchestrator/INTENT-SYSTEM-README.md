# Intent system

The product authoring surface is the gateway control plane, with the published catalog consumed by the orchestrator. Editing source defaults alone does not update an already published release or a pinned workflow.

For an existing intent, edit a draft's enablement, phrases, fields, supported tool subset, prompt/template, confirmation wording, and optional generation profile; evaluate, publish, and promote it to the required environment. New workflows select that environment's release; pending work keeps its previous release. Published validation and runtime guards both preserve the canonical security floors.

For a custom intent, use a canonical `baseIntent` to inherit a reviewed handler, or use `service_request` / `knowledge_search` for generic case creation / approved evidence retrieval. Custom configuration cannot install executable tools or arbitrary URLs. New financial behavior requires reviewed code.

Sources: [canonical defaults](config/intentConfig.js), [request-scoped intent mapper](src/services/intentMapper.js), [published recognition](src/services/recognition.js), [runtime contract](CONTROL-PLANE-RUNTIME.md). See [quick reference](INTENT-QUICK-REFERENCE.md), [maintenance](INTENT-SYSTEM-MAINTENANCE-GUIDE.md), and [architecture](INTENT-SYSTEM-ARCHITECTURE.md).
