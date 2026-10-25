# Platform operations and solution packages

Mounted at `/api/platform` by the gateway. All routes require a signed deployment
JWT. Viewer/editor/operator/admin roles can read. Preview/apply require editor or
admin. There is no browser endpoint for loading arbitrary plugin source.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/readiness` | Cached infrastructure checks, gateway production configuration checks and explicit qualification boundary |
| GET | `/catalog` | Registered extension contracts and built-in solution manifests/digests |
| GET | `/solutions/export?source=draft` | `{package,digest,sourceRevision}`; source is `draft` or `published` |
| POST | `/solutions/preview` | `{catalogId}` or `{package}`; returns revision, manifest, package/base/result fingerprints, conflicts and semantic diff |
| POST | `/solutions/apply` | Same package selection plus `revision,digest,baseFingerprint,overwrite,note`; updates draft and returns `published:false` |

A package is bounded to 512,000 bytes and has exactly these top-level keys:

```json
{
  "schemaVersion": 1,
  "manifest": {
    "id": "customer-support",
    "name": "Customer support",
    "description": "Reusable servicing configuration",
    "version": "1.0.0"
  },
  "configuration": {
    "queues": [{"id":"support","name":"Customer support"}]
  }
}
```

Configuration can supply `intents`, `queues`, `journeys`, `channels`, `prompts`,
`recognition` and `llm`. Entity lists merge by ID without deleting existing
entries. Prompt properties merge; recognition/model configuration replaces its
whole section when supplied. The resulting full draft must pass the existing
strict servicing validator. Canonical banking fields, tool allowlists and
confirmation floors remain mandatory. Unknown fields, executable scripts,
provider endpoints, credential settings and duplicate IDs are rejected.

Built-ins are the banking baseline, service desk fulfillment and approved
knowledge assistant. The latter two add generic typed intents and journeys;
they do not create credentials, ingest documents or connect an enterprise system.
The banking baseline can conflict with customized settings, so always inspect the
diff. Existing differing IDs/sections require explicit `overwrite:true`.

Application checks revision, package digest and current-draft fingerprint inside
the store transaction. A changed package/draft returns 409. Provenance records
manifest ID/version/digest, actor and change note in the control-plane audit.
Only the draft changes. Evaluation fingerprints, independent approval gates,
publish/promotion and active-release pinning apply as before. A digest detects
content changes; it is not an author signature or package authenticity claim.

Readiness checks the control-plane and operational schemas, the connected shared
rate limiter, and banking/chat/orchestrator/MCP/NLU health. Probes are bounded,
concurrent and cached for five seconds. The response contains no endpoint URLs,
credentials, raw provider errors or customer records. Gateway startup in
production validates minimum configuration and initializes its own durable stores
before listening. Runtime checks remain separate from static deployment
`production:preflight`; neither proves live-provider correctness or capacity.

`__tests__/platform.test.js` verifies permissions, tenant isolation, read-only
preview, reviewed apply, conflict/stale/tamper rejection, financial constraints,
configuration rejection, independent authorship/approval/publication gates,
readiness deadlines/caching and minimal public probes.
See [platform guide](../../../docs/guides/platform-readiness.md) for operator and
deployment workflows.
