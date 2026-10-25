# Platform review: October 2026

Reviewed October 25, 2026 against the canonical `services/*` code. This record
lists the gaps found in a full code review, what was changed, the evidence, and
what remains. It complements the [platform gap assessment](platform-gap-assessment.md),
which tracks market and pilot-level capability gaps.

## Fixed: authorization and identity

Banking enforces these rules itself, so they hold for direct calls, MCP tools and
future integrations. Details: [banking API contract](../../services/banking-service/API-DOCUMENTATION.md#customer-and-staff-boundaries).

| Severity | Finding | Change |
| --- | --- | --- |
| Critical | Any customer could open an account with `initialBalance` up to 1,000,000 (money created from nothing), and choose their own credit limit, interest rate and transaction limits. | Opening balances, credit terms and limits are staff/service-only (403 `ACCOUNT_FIELD_FORBIDDEN`). Customers open zero-balance accounts and fund them by transfer. |
| High | An account owner could `PUT` `status: active` to undo an administrator freeze, or `closed` to bypass the zero-balance close check. | Customers may only rename (`nickname`). Status changes are staff-only, and closing always uses the close endpoint. |
| High | An owner could `PUT` their own dispute to `resolved_in_favor`, bypassing the admin-only resolve route; any edit also erased `resolved_at`. | Customers may correct description, reason or amount of an open dispute only. Decided disputes cannot be edited, withdrawn or resolved twice. `resolved_at` is preserved. Disputed amount cannot exceed the transaction. |
| High | The recipient of a transfer could cancel it. | Only the sender (or staff) can cancel; both parties can still read it. |
| High | Unlimited password guessing: the failed-login counter never locked an account, and the stricter auth rate limiter was defined but unused. | Temporary per-account lock (`AUTH_MAX_FAILED_ATTEMPTS`, default 5; `AUTH_LOCKOUT_MINUTES`, default 15) using the existing `locked_until` column, with 429 and `Retry-After`. Per-account rather than per-IP, because chat-backend logins share one source address. |
| Medium | Username enumeration: unknown usernames skipped bcrypt (timing) and inactive/locked status was disclosed before the password was checked. | Unknown usernames pay a cost-12 bcrypt comparison; status is disclosed only after a correct password. |
| Medium | Expired `user_roles` assignments still granted roles and permissions, including control-plane roles. | Role and permission queries exclude expired assignments. |
| Medium | Refresh tokens were stored in plaintext with a hard-coded 7-day database expiry. | Stored as SHA-256 digests with the signed expiry; legacy rows match until they expire. Refresh verification pins HS256. |
| Medium | The gateway accepted 7-day refresh tokens as access tokens, any tenant and any HMAC algorithm. The chat socket handshake accepted refresh tokens and evaluation delegations. | One policy in gateway and chat: HS256, a subject, the deployment tenant, never refresh tokens or delegations. |
| Medium | Credential-free chat development tokens (any `userId`) were enabled whenever `NODE_ENV` was not exactly `production`, including `staging`. | Allowed only when `NODE_ENV` is unset, `development` or `test`. |
| Low | Banking returned 403 for expired tokens, contradicting its docs and RFC 6750, so clients that refresh on 401 did not. | Invalid or expired tokens return 401 with `WWW-Authenticate`; scope denials stay 403. |

## Fixed: build, CI and operations

| Finding | Change |
| --- | --- |
| The root `package-lock.json` held only macOS rollup/esbuild binaries, so the documented root install could not build or test the frontend on Linux. | Added the 75 missing platform entries at the locked versions with registry integrity; no existing entry changed. |
| The root `postinstall` failed `npm ci` when `JWT_SECRET` was unset, so a fresh clone following the quick start could not install. | The check is advisory during install; `npm run validate` still reports issues. |
| Lint passed in all eight workspaces but CI never ran it. | New `workspace-quality` CI job: root install, lint, frontend build, profile validation. |
| Six application images ran as root outside the production Compose overlay. | Images default to the unprivileged `node` user. |
| A loopback test failed on hosts without IPv6. | Skipped, visibly, when `::1` is unavailable. |
| A stale `routes/auth.js.bak` copy of banking auth code was tracked. | Removed. |

## New capability: procedures and guardrails

Operators can import standard operating procedures that the assistant follows,
with guardrails enforced in code and retrieval-grounded answers with citations.
See [Procedures and guardrails](procedures-and-guardrails.md).

Follow-up: procedure retrieval can be semantic or hybrid. Any provider plugin can
serve the new `embedding` route, vectors are content-addressed and shared through
PostgreSQL, a turn falls back to BM25 (and says why) instead of waiting for the
index, and Studio measures each strategy on authored cases and suggests a
similarity floor. With a small open model on 25 cases, calibrated semantic and
hybrid retrieval answered 90% correctly against 67% for BM25; see
[measured behavior](procedures-and-guardrails.md#measured-behavior).

## Verification

Run from the final commit with PostgreSQL-backed suites enabled:

| Suite | Result |
| --- | --- |
| ai-orchestrator | 236 passed |
| api-gateway | 275 passed, 1 skipped (IPv6 loopback unavailable on the host) |
| banking-service (including migration/seed/bootstrap on PostgreSQL) | 80 passed |
| chat-backend | 119 passed |
| mcp-service | 110 passed |
| nlu-service | 29 passed |
| agent-ui | 22 passed |
| frontend (Vitest) | 46 passed |
| deployment scripts | 15 passed |

Lint, the frontend production build and the documentation link check pass.
Before this review, the root install could not run the frontend suite, and the
gateway suite failed on the IPv6 host issue.

The new sign-in behavior was also exercised against a migrated and seeded
PostgreSQL database: five wrong passwords lock the account, the lock returns 429
with `Retry-After: 900`, an expired lock admits the correct password, refresh
tokens are stored as digests with the signed expiry, and success clears the
counters. The Procedures workspace was driven in Chromium against a running
gateway: import, review, accepting a suggestion, enabling, saving the draft through
server validation, and simulation showing the applied procedure.

Not verified here: container images were not built (no Docker daemon was
available). The production Compose overlay already runs these services as the
same `node` user, which limits the risk of the Dockerfile change.

## Remaining gaps

| Priority | Gap | Recommendation |
| --- | --- | --- |
| P1 | Every service verifies the same HMAC `JWT_SECRET`, so compromise of any one service allows minting tokens accepted by all. | Single issuer with asymmetric signing (RS256/EdDSA), JWKS distribution and a per-service audience. |
| P1 | Browser access and refresh tokens are in `localStorage`, exposed to any XSS. | Use the HTTP-only cookie session the OIDC path already provides for the local login too. |
| P1 | Refresh tokens are not rotated and reuse is not detected. | Rotate on each refresh and revoke the token family on reuse. This changes the client contract. |
| P2 | The gateway adds the internal service credential to every authenticated customer request it proxies to MCP/NLU (documented design). NLU conversation context is keyed only by session ID, so any authenticated customer can read or replace another session's context if they know its UUID. | Bind NLU context to the principal, or stop exposing NLU context routes through the public gateway. |
| P2 | Procedure retrieval quality is qualified only on authored cases, with no reranker or evaluation against production questions; imports accept text and Markdown only; the agent workspace does not yet show the governing procedure. Approved knowledge retrieval remains lexical. | See the procedures guide's next steps. |
| P2 | Banking balance arithmetic runs in JavaScript numbers. It is correct today because values come from `DECIMAL(15,2)` and are rounded on write, but this depends on that scale. | Move balance arithmetic into SQL or integer minor units before widening precision or adding currencies with other scales. |
| P3 | The orchestrator runtime image ships a compiler toolchain (`python3`, `make`, `g++`). | Multi-stage build so the runtime image carries only production dependencies. |
| P0 (pilot) | Live IVR/media, enterprise IdP, real model qualification, load and disaster-recovery evidence. | Unchanged; see the [platform gap assessment](platform-gap-assessment.md). |
