# Measured model evaluation

The **Response quality** workspace runs authored synthetic examples against a configured model profile. It records observed responses, latency, provider-reported usage and objective assertion results. These runs complement the [control-plane contract simulations](control-plane.md): simulations test routing and tool contracts without invoking a model; Quality invokes a model explicitly and does not execute tools, banking actions or a complete conversation workflow.

An editor or administrator must save a dataset and explicitly request each run. Opening the workspace, saving a dataset, comparing results or publishing a release does not call a model. Configure an enabled [provider registry and model profile](llm-providers.md) first. An unknown, disabled or uncredentialed provider fails without a fallback. Tests use injected fixtures and make no external provider calls.

## Dataset and assertions

Start from [the synthetic example](../../config/product/quality-suite.example.json), then replace expected strings with the behavior your prompt actually requires. A dataset contains an id, name, `dataPolicy: "synthetic_only"`, task and 1–20 cases. Each case has a unique id, input up to 4,000 characters, category (`happy_path`, `negative`, `prompt_injection`) and 1–20 assertions. The aggregate synthetic input limit is 80,000 characters. There is no customer-transcript import or export integration. Authors must use synthetic data and must not paste customer information, credentials or secrets into datasets or prompts.

Supported assertions are deterministic:

| Type | Rule |
| --- | --- |
| `exact` | Trimmed output equals the trimmed authored string. |
| `contains`, `not_contains` | Case-sensitive literal substring presence or absence. |
| `json_valid` | Output parses as a non-null JSON object or array. |
| `json_required` | Every authored path exists as an own property. |
| `json_equals` | A path equals an authored string, number, boolean or null. |
| `refusal` | At least one authored phrase occurs, case-insensitively. |

JSON paths support object keys and bounded array indexes, for example `candidates.0.intent`; prototype access is rejected. Refusal phrases are lexical tests: a quoted phrase can pass even when the overall response is unsafe. The system does not present these checks as a semantic judge, a general safety score or proof of injection resistance.

Generation datasets require an intent with no tools and render its pinned system/user prompts, with an empty synthetic context by default. `variables.userId` can supply a synthetic identity; `variables.context` is a JSON object encoded as a string. Question and identity values cannot be overwritten by that context. Generation uses the same template rendering as the runtime, with no conversation history or tool results. Tool-backed banking responses use deterministic formatting and cannot be evaluated as generated answers here.

Extraction datasets require an intent and use the AI runtime's existing schema and prompt builders with the pinned intent/instructions, empty history and no previously collected fields. Recognition datasets use the published catalog and the runtime's enforced JSON instructions. Both use provider JSON mode. Recognition probes deliberately call the model even when a literal phrase would take the runtime's deterministic recognition path. These differences are part of the prompt-probe scope, not evidence of end-to-end workflow behavior.

## Limits, persistence and cancellation

Each run snapshots its dataset, rendered generation/recognition messages, extraction inputs, model profile, source release and configuration/dataset/profile fingerprints. Up to two cases execute concurrently, and only one run executes per deployment tenant across gateway replicas. At most ten runs can wait in the queue. The maximum run duration is 300,000 ms; each call also respects the selected profile's 1,000–120,000 ms timeout. Remaining run time can shorten a call deadline.

The output-token budget reserves every case at the pinned profile's maximum output tokens. It must cover `numberOfCases × profile.maxOutputTokens` and cannot exceed 163,840. This is a bound on requested generation, not a currency budget or a guarantee of provider billing. Inputs, case counts, concurrency and elapsed time have independent limits. Provider usage is reported only when present; absent values remain `null` with coverage counts. No estimated cost or fabricated zero is substituted for missing measurements.

Run state and case results use the existing PostgreSQL operations records. A tenant-scoped transaction claims a run before dispatch. Queued jobs survive a gateway restart. If a running lease expires, the run becomes `interrupted`; already dispatched calls are never replayed automatically. Request a new run to retry. A completed passing run reconciles minimal release-gate evidence into control-plane records without making another model call. Normal deployment migrations already provision both record stores; no extra quality schema is required.

Cancel stops future cases and aborts a local in-flight HTTP request when possible. Another gateway replica's already dispatched call may complete before cancellation is observed. The provider may still process or bill an interrupted request, and measured usage can remain incomplete. Partial, cancelled, failed and interrupted runs cannot produce passing release evidence. Responses retained for inspection are capped at 8,000 characters per case, while assertions evaluate the full bounded response; truncation is marked. Quality records are retained until an operator's database retention procedure removes them; generic case-retention cleanup does not currently remove evaluation evidence.

## Release gates and comparison

An administrator can set required `(suiteId, profileId)` pairs in Quality policy. Publish, rollback and promotion then require a completed passing measured run with the exact current configuration, dataset and profile fingerprints. Dataset edits, prompt/configuration changes and profile changes invalidate the previous match. Existing contract-evaluation and independent-approval gates still apply independently. Only the worker writes measured evidence; callers cannot submit a fabricated pass result.

Comparisons display both run summaries. Different dataset/assertion fingerprints disable the pass-rate delta. Different configurations produce a warning because a difference cannot be attributed solely to the model. Category counts expose whether authored negative and prompt-injection examples passed. A pass rate describes this dataset only.

Model names can be mutable aliases. Pinning a profile does not freeze remote model weights, provider endpoint contents, credentials, provider software or the application's prompt-building code. Re-run evaluations after these change. Release gates do not automatically detect such external drift and do not constitute live production certification.

## API contract

All routes below are relative to `/api/quality`, require the deployment access token and enforce control-plane permissions. Read routes permit viewer/editor/operator/admin; dataset edits, runs and cancellation require editor/admin; policy changes require admin.

| Method and path | Body or response |
| --- | --- |
| `GET /state` | CP `revision`, `policy`, paginated `suites` and `runs`, limits, permissions, limitations. |
| `PUT /suites/:id` | `{revision, suite}`; returns the new CP revision and suite. |
| `GET /suites`, `GET /suites/:id` | Flat suite definitions with version/fingerprint metadata. |
| `POST /runs` | `{suiteId, source: "draft" or "published", version?, profileId, budget?}`; returns `202` with the queued run. |
| `GET /runs`, `GET /runs/:id` | Summary pages or detailed case results; filter lists by suiteId/profileId/source/version/status. |
| `POST /runs/:id/cancel` | Requests cancellation; finished runs return `409`. |
| `GET /compare?left=ID&right=ID` | Both summaries, comparability, warnings and nullable pass-rate delta. |
| `PUT /policy` | `{revision, policy: {requirements: [{suiteId, profileId}]}}`. |

`budget` supports `concurrency` (default 1), `maxDurationMs` (default 120,000) and `maxOutputTokens` (default the exact reserved maximum). List pagination uses `limit` 1–100 and nonnegative `offset`. The same CP revision protects suite and policy writes as the Studio draft; saving evidence also advances it, so refresh before editing after a run finishes.

The gateway worker calls the internal AI evaluation endpoint using a short-lived JWT scoped to `servicing-quality`, its run id and the exact evaluation route, plus `X-Servicing-Service-Token`. It stores the authorized requesting actor, never the user's bearer token. A scoped job token is rejected on ordinary AI workflow, provider-management, gateway, control-plane, operations and banking routes, including token refresh. This delegation authorizes the queued job; it is not a new customer identity, a general service login or a public arbitrary-model proxy.
