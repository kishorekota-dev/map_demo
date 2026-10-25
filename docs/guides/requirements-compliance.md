# Requirements review and channel continuity

This review applies the supplied coding requirements to the established `services/*` architecture. It extends the existing control plane, chat handoff service, workflow ledger, MCP adapters and banking database. It adds no orchestration engine, provider dependency or database product. The implementation is submitted on a feature branch as a draft PR; this review does not authorize a merge to main.

## Customer journeys and channel switching

Digital, AVA and IVR share an owned conversation and its pinned runtime release. The handoff service issues short-lived, destination-bound, one-use grants after checking the authenticated owner and deployment tenant. Redemption checks the destination before consuming the grant. History, workflow state and the release remain attached to the same session. A pending action must still be confirmed after a channel change; a previous-channel response cannot authorize execution.

The customer interface provides Digital/AVA switching and an ephemeral IVR transfer artifact with a return entry. Transfer artifacts stay out of URLs, browser persistence and operational logs. The provider-neutral voice webhook supports returning to Digital/AVA. A voice event checks the persisted current channel before accepting another turn; an old call cannot continue acting on a conversation that has left IVR. A configured provider must implement the signed webhook contract and authenticate the customer at its edge. These controls do not establish that a telephone call was placed, audio was understood or a live provider was qualified.

See [channel switching](channel-switching.md) for customer controls, API contracts, voice handoff actions, grant lifecycle and recovery.

## Exact confirmation and durable mutations

All business mutations require a caller `Idempotency-Key`. The orchestrator's existing effect ledger supplies a stable operation key, and a short-lived signed confirmation proof binds the verified customer, tenant, key and original request arguments. MCP validates the tool proof and signs the exact banking HTTP request. Changing the intent, channel, pinned route, interaction or arguments invalidates pending confirmation. Service-request fulfillment also requires confirmation.

Banking migration **V10** adds `banking_mutation_results`. The owning banking service acquires a transaction-level advisory lock and executes the business change and successful response record in the same PostgreSQL transaction. The HTTP response is buffered until commit. Completed exact-key requests replay the stored response; changed arguments conflict. Definitive failures roll back without caching a failed result, permitting an explicit exact-key retry. A lost commit acknowledgement returns an uncertain outcome and `/api/v1/mutation-status/:key`; lookup cannot report absence while the same operation holds its lock. Late controller queries cannot escape a closed transaction.

Generic adapters preserve the original completed or uncertain result, retain bounded key-to-arguments binding, and provide reconciliation references. Fulfillment no longer automatically retries business mutations. HTTP 4xx/5xx or a known pre-dispatch failure becomes a definitive failure; an after-dispatch timeout/reset remains uncertain. A provider claiming definitive failure must guarantee that its error response represents no committed effect. An uncertain operation requires authoritative reconciliation before retry.

Fulfillment pins the outbound method, path, key and body separately for case creation and escalation before dispatch. Later SLA queue changes become a separate escalation and cannot change arguments under an existing key. Previously dispatched legacy cases without pinned arguments require manual reconciliation. Legacy case digests without the resolved intent conflict rather than accepting an unverifiable new-intent replay. The gateway also disables proxy retries and returns the authenticated banking status-lookup path when a keyed banking mutation loses its response.

See [runtime behavior](../../services/ai-orchestrator/CONTROL-PLANE-RUNTIME.md), [banking service](../../services/banking-service/README.md) and [adapter contracts](backend-integration-framework.md).

## Server-owned integration configuration

`CONNECTORS_CONFIG_PATH` declares approved case, voice and knowledge endpoints at startup. It contains endpoint metadata and named environment references, never credential values. The operations console can enable a declared integration and adjust its display name and timeout. It cannot register a new endpoint or change credential bindings. Invalid files, undeclared bindings, missing environment values and production HTTP destinations fail closed. Dispatch pins the declaration digest so later configuration cannot silently redirect an existing job.

Connector and audit credentials support environment injection only. File credential references, `CONNECTOR_SECRET_ROOT`, `CONNECTOR_SECRET_HOST_DIR` and `AUDIT_SIGNING_KEY_FILE` are unsupported; use `env:CONNECTOR_SECRET_NAME` and `AUDIT_SIGNING_KEY`. Tracked environment files omit working secrets, and source defaults no longer supply JWT or database passwords. The login API still accepts user credentials, and verified customer access tokens still delegate customer identity through established service boundaries. They are separate from server integration credential configuration.

OIDC confidential clients require `env:OIDC_CLIENT_SECRET`. Model providers require explicit named environment credentials; implicit Vertex ADC and credential-file discovery are disabled. Enabled production model providers require HTTPS. Local Ollama/Qwen and LM Studio defaults remain available outside production. Legacy Dialogflow uses explicitly injected JSON credentials when enabled, without an ambient credential file or a silent mock after a provider failure.

Webhook signatures bind the timestamp, event ID, **configured exact public URL** and exact raw body. Query strings and alternate paths are rejected. This changes the earlier body-only signature contract; provider adapters must adopt the current format in [Servicing operations](servicing-operations.md).

## Access, privacy and knowledge

The chat token bridge preserves verified access-token roles; a browser-provided role or agent ID grants no privilege. The agent service requires a verified agent/operator/admin role and an unexpired token. Transcript access, customer context and socket delivery recheck the persisted current assignment and tenant. Pre-accept queue offers expose session and intent metadata rather than customer names or transcript content.

Operational logging uses source-owned message catalogs and fixed enum, numeric and Boolean metadata. Raw URLs, headers, IPs, customer identifiers, transcripts, arbitrary error messages and nested tool/provider payloads do not enter operational logs. Public global errors are sanitized in all environments. Analytics metadata uses fixed value allowlists rather than accepting arbitrary strings. Business records retain their authorized service data; this filtering does not remove audit evidence or customer-visible responses.

Knowledge validation now applies to draft save, import, connector ingestion and answer-source retrieval. Documents require safe IDs, titles, substantive content, provenance and positive versions at the answer boundary. Unknown sources, duplicate IDs, unsafe legacy records and email/card/SSN content are rejected or excluded before they become citations. Existing ACL and expiry checks remain in force. See [knowledge operations](servicing-operations.md).

## Deployment and compatibility

Apply banking V10 and the existing servicing migrations before starting the production profile. Inject `SERVICING_SERVICE_TOKEN` consistently into gateway, orchestrator, MCP, chat and banking. Existing direct business mutation callers must add an idempotency key and the trusted exact-request confirmation proof. End-user login and read APIs retain their existing paths.

Runtime model test/evaluation endpoints, IVR simulators and banking test assets are disabled in production. Pure control-plane configuration simulation remains available as a governance function; it does not contact a provider or execute a business mutation. Production connector catalogs and model registries require explicit deployment mounts and environment wiring. The preflight validates configuration without making provider calls or printing resolved credentials.

The [configuration guide](../getting-started/configuration.md), [quick start](../getting-started/quick-start.md) and [deployment guide](deployment.md) describe the supported setup. Historic review reports retain their original counts and are not evidence for this change.

## Verification scope

Verification uses local fixture transports and disposable PostgreSQL databases. The draft PR records the final test counts, syntax/lint checks, builds, migration checks, production Compose smoke and comparison of pushed branch content with the reviewed files.

On October 24, 2026, `npm test` passed all **794 tests** across eight workspaces with the documented PostgreSQL fixture variables set: agent UI 22, orchestrator 207, gateway 231, banking 50, chat 106, frontend 39, MCP 110 and NLU 29. `npm run test:deployment` passed **15 tests**, including disposable-database migrations. Gateway database suites run serially to avoid competing schema initialization; their concurrent replica, grant-redemption and duplicate-dispatch scenarios still execute within the suites.

`npm run lint`, `npm run typecheck`, `npm run build`, `npm run product:validate` and `git diff --check` passed. All **164 changed JavaScript files** passed `node --check`. The current documentation link check resolves **520 local links across 69 reachable Markdown files**. No package or lockfile changes were required.

A fresh isolated production Compose smoke passed **76 static preflight checks**, built nine images and reached ten healthy containers. All eight application containers ran as non-root. All **113 changed runtime JavaScript/SQL hashes** matched across the seven backend images. The compiled customer workspace included the channel controls. Empty-database migrations, V10, offline administrator bootstrap/login, authorization, one-use AVA/IVR transfers, replay rejection and direct browser IVR-input denial passed against the running services. Missing or forged financial confirmation was rejected before dispatch; accounts, transfers and mutation results remained empty. Production simulators, model probes, test assets and generic adapter writes were blocked. All seven real Winston privacy canaries passed, and configured secrets/bootstrap identity were absent from service logs. The isolated stack, volumes, image tags and generated private artifacts were removed after verification.

Live telephony/audio, separate-host Qwen connectivity, cloud model authorization and quality, customer IdP login, external backend contracts, load/soak behavior, disaster recovery, penetration testing and customer deployment acceptance remain unverified. Those require configured external systems and an agreed pilot. Passing these repository checks is not a production SLA or compliance certification.
