# Agent workspace

The Servicing Studio **Agent workspace** brings durable servicing cases, assignment,
approved knowledge and handling evidence together. It operates on connector-backed
cases already recorded by the runtime. Manual control-plane work items remain in
**Fulfillment**; live agent chat, media and transfer delivery remain in the separate
agent console and the configured provider adapter.

The workspace never executes banking tools or changes the provider's execution
status. Its next steps are explicit rules based on case state, not generated advice.
It retrieves only the case's existing routing, redacted summary/reference, session
reference, SLA and pinned journey metadata. It does not aggregate bank balances,
customer identities, raw intent fields, transcripts, raw provider errors or records
from another customer system. Case text is bounded; email addresses and digit runs
of six or more characters are redacted. This is not comprehensive data classification:
operators must not enter customer secrets or account information in handling notes.

## Permissions and ownership

| Role | Allowed actions |
| --- | --- |
| Viewer/editor | Read the bounded case workspace and knowledge permitted by signed roles |
| Operator | Claim an unassigned case for self; update/release only own assignment |
| Administrator | Operator actions plus release another operator's assignment with a reason |

Assignment never accepts a browser-provided assignee. Every write requires both
the latest case revision and handling revision, and a bounded note. Transactions
use the existing tenant lock and compare revisions before accepting a change.
Concurrent claims have one winner; the other receives 409. A provider update also
invalidates a stale case revision. Refresh preserves the browser's unsaved note;
the operator reviews current state before saving again.

Agent handling is a nested `case.agentWork` object, with its own revision, owner,
status, disposition and most recent 50 history entries. Existing case retention and
subject erasure remove it with the case. The existing worker/provider payload is
explicitly selected and does not include agent notes or assignment. No new database
schema or migration is required.

## Handling and provider outcomes

Claiming moves handling from `unclaimed` to `in_progress`. The owner can record
`in_progress` or `waiting`; release returns work to `unclaimed`. Resolving is allowed
only when provider execution is `completed` or `failed`. Resolved handling is
immutable. `service_completed` requires provider `completed`; a failed operation
cannot be described as successful. Outstanding `follow_up_required` or `escalated`
dispositions cannot close handling. `reconciliation_required` remains blocked until
an authorized operator resolves the external outcome through the existing recovery
contract. This workspace has no retry action.
Interrupted customer workflows require the customer's current authentication and
the owning conversation recovery flow; an operator cannot resume a customer graph
from this workspace.

Knowledge retrieval searches only current published, nonexpired documents matching
the operator's signed roles. It uses the existing lexical retrieval implementation,
returns at most five sources and displays at most 6,000 characters per source.
Sources have safe HTTP(S) links when available. Saving a citation rechecks its
published version, expiry and role permission; stale or revoked citations return
409. Notes retain source ID, version and title. Publication itself is the existing
knowledge workflow; the workspace does not grant additional document access.

Each handling mutation appends an event to the existing evidence chain. Events
contain action/status/disposition, case/session reference, operator hash, citation
IDs/versions and the note digest, without copying note content. The detail panel
shows the most recent 25 case events. Administrator evidence export provides older
action records under its existing retention and signing configuration.

## API

All paths are beneath `/api/operations`; existing access-token and deployment-tenant
validation applies. The server supplies allowed actions per case.

| Method/path | Contract |
| --- | --- |
| `GET /agent/cases` | `queue`, `channel`, `status` (handling), `executionStatus`, `assignment=all\|mine\|unassigned`, `overdue=true\|false`, `limit=1..50`, `offset`; bounded items, filtered queue counts, queue choices and permissions |
| `GET /agent/cases/:id` | Bounded case context, pinned journey, deterministic next steps, recent case evidence |
| `GET /agent/cases/:id/knowledge?query=...` | Query up to 1,000 characters; permitted published source excerpts |
| `POST /agent/cases/:id/claim` | `{revision,caseRevision,note}`; claim for authenticated operator |
| `POST /agent/cases/:id/release` | `{revision,caseRevision,note}`; owner or administrator |
| `PATCH /agent/cases/:id/work` | `{revision,caseRevision,status,disposition,note,citations:[{id,version}]}`; assigned owner only |

Supported dispositions: `information_provided`, `follow_up_required`, `escalated`,
`service_completed`, `unable_to_complete`. Each write returns `{item}` with current
revisions and actions. Notes are 1–1,000 characters; at most five citations are
accepted. A 403 means the actor lacks the role/ownership; a 409 requires reloading
and reviewing changed source state. Queue summaries display at most 100 groups;
total matching cases are counted independently.

## Verification

`operations/__tests__/agent-workspace.test.js` covers projection safety and next-step
rules without a database. Set `TEST_OPERATIONS_DATABASE_URL` to an isolated disposable
PostgreSQL database for real concurrent claims, tenant/role boundaries, assignment,
provider-state conflicts, knowledge ACL/version checks, restart persistence and
privacy deletion tests. Tests create and remove unique tenant records. Do not point
them at customer infrastructure.

See the [operations runbook](../../../docs/guides/servicing-operations.md) and
[Studio operator guide](../../frontend/OPERATIONS-CONSOLE.md) for surrounding flows.
