# Recent integration changes: review and fixes

Review date: October 24, 2026 (America/Chicago). Baseline: remote main `f339b6e`, including backend
framework commits `075f198`/`9fad0b9` and assistant pilot commits
`120c414`/`f339b6e`. Both feature branches were already merged into main; there were
no open pull requests or unmerged branch tips. The working tree was clean before
this review.

## Findings addressed

| Area | Defect | Correction |
| --- | --- | --- |
| CI | Standalone service jobs omitted dependencies of sibling modules imported by contract tests; the PostgreSQL job ran those tests before installing their peers | Install declared sibling/runtime dependencies before running contract tests, preserving cross-service parity checks |
| Test isolation on macOS | Supertest could bind an IPv6 wildcard while sending requests to an unrelated IPv4 listener on the same port, producing false authorization/status failures | Connect gateway HTTP test requests through their fixture's bound address family and verify listener cleanup; application authentication is unchanged |
| Outcome reporting | Collapsed real interaction IDs into sessions; counted failed work as contained; FCR treated recent/anonymous contacts as resolved and unrelated old cases as failures | Preserve interaction IDs and event ordering, expose mature FCR denominators, exclude unobserved/unknown contacts, and report containment unknown until live-agent telemetry is comprehensive |
| Analytics resource bounds | A 365-day request loaded an unbounded event history into process memory | Bound the database result to 50,001 rows and reject oversized windows without partial metrics; indexed computation avoids pairwise history scans |
| Knowledge sync | The new validation helper was never called by ingestion and required a caller version incompatible with canonical server-assigned revisions | Validate the whole connector batch before draft import; preserve server-assigned revisions, validate optional supplied versions and safe provenance; reject invalid/sensitive batches atomically |
| Adapter authorization | The private API could accept unauthenticated development requests and execute mutations outside governed workflows | Always require a configured service identity; block production mutations unconditionally and require an explicit development/test pilot flag |
| Adapter transport and replay | Redirects, unsafe paths, unbounded responses, credential caching and concurrent retries could leak credentials or duplicate work | Validate schemas/paths/headers, pin approved DNS results, enforce TLS and payload limits, disable redirects/proxies, bind atomic replay entries to canonical arguments and preserve uncertain mutation outcomes |
| Adapter registry | Registering a second adapter accessed an invalid registry shape | Check collisions against stored definitions and test multiple registrations |
| Live chat | Agents could claim unrequested sessions, race for ownership or retain access through stale rooms and expired tokens | Require a current request/escalation, coordinate assignment with PostgreSQL, integrate the dashboard protocol and recheck ownership, tenant and token expiry on delivery |
| IVR | Interruptions could bypass verification, overlapping turns could corrupt state and prompts could imply execution without provider evidence | Preserve verification across interruptions, serialize bounded pilot turns, make transfer/completion messages truthful and return unavailable for the standalone production pilot |
| Conversation lint | Empty/malformed transcripts could produce scores and some confirmation/repetition checks were misleading | Validate transcript evidence and correct deterministic checks while documenting annotation limits |

The adapter, IVR and live-chat review also addresses authorization, replay,
verification, room ownership and transport issues. Their service-owned guides and
tests define the exact delivered restrictions; the [pilot checklist](digital-assistant-pilot-checklist.md)
records remaining external qualification. Standalone generic mutations and the
standalone IVR pilot are not promoted into production transaction paths.

## Verification

Focused gateway tests cover authenticated routes, tenant separation, bounded
analytics, interaction aggregation, follow-up eligibility, unknown containment,
connector rejection before import and actual PostgreSQL queries. New regressions
in each reviewed service cover the corrected transport, verification and ownership
boundaries. No enterprise provider, telephony or model calls are required for these
synthetic checks.

| Local check | Result |
| --- | --- |
| API gateway | 196 tests passed, including PostgreSQL contracts and fixture address-family regression |
| AI orchestrator | 182 tests passed, including PostgreSQL runtime coverage |
| Chat backend | 91 tests passed, including PostgreSQL assignment concurrency |
| MCP service | 80 tests passed, including real local HTTP transport fixtures |
| Banking service | 34 tests passed against PostgreSQL |
| NLU / frontend / agent UI | 15 / 35 / 9 tests passed |
| Deployment contracts | 14 tests passed with PostgreSQL enabled |
| Build and repository checks | Frontend TypeScript/Vite build, workspace lint, enterprise profile validation and 504 documentation links passed |

Total: 656 passing tests across the eight services and deployment contracts.

The isolated production Compose smoke built all nine images on fresh volumes,
ran both explicit migrations and bootstrapped one administrator from an empty
user database. All ten services became healthy; all eight application containers
ran as non-root users. The 48 checks covered protected APIs, authorized platform
readiness and catalogs, PostgreSQL checkpoints, outcome semantics and invalid
queries, production IVR refusal, adapter service identity and unconditional
production mutation refusal. Sixteen critical deployed source hashes matched the
reviewed tree. A synthetic credential log scan was clean. Smoke resources were
removed afterward; existing application containers were preserved.

These checks validate local integration and the documented restrictions. Real
enterprise providers, production identity, remote Qwen inference, distributed
realtime routing and operational acceptance still require deployment-specific
qualification. GitHub CI runs the service, PostgreSQL, deployment, documentation
and dependency gates for the pushed main revision.
