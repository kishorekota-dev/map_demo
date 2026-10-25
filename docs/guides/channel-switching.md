# Continue a conversation across Digital, AVA, and IVR

The customer workspace can continue the same owned conversation in Digital or AVA and prepare a transfer into an organization's voice service. IVR uses the existing durable servicing operations voice webhook contract. These paths retain the conversation ID, transcript, current intent, collected workflow data, pending feedback, and published release already pinned to the workflow. A switch does not submit a new customer request or execute a tool.

The workspace exposes the verified current channel, **Continue in Digital**, **Continue in AVA**, **Prepare IVR transfer**, and **Refresh conversation**. When IVR owns the conversation, the browser composer is disabled until the customer resumes in Digital or AVA. AVA selects the published AVA routing and prompt configuration. Avatar rendering, speech recognition, speech synthesis, and telephone connectivity remain responsibilities of the chosen channel adapter; this feature does not invent a phone number or place a call.

## Customer transitions

| From | Destination | Transition |
| --- | --- | --- |
| Digital or AVA | Digital or AVA | The authenticated workspace issues a grant and redeems it for the selected destination. The conversation stays open. |
| Digital or AVA | IVR | Prepare an IVR transfer, then provide its one-use grant to the organization's authenticated voice adapter. The adapter sends `voice.start` with `resumeGrant`. Refresh the workspace after connection. Preparing the grant alone does not move the conversation. |
| IVR | Digital or AVA | The authenticated adapter sends `voice.handoff` for the selected destination and securely gives the returned grant to the customer. After signing in to the destination workspace, open **Resume a transfer from IVR**, select the matching destination, and redeem the grant. |
| IVR | Digital or AVA in an already signed-in workspace | Refresh the existing conversation and use its continuation button. Previously active voice calls cannot submit more turns after the channel changes. |

An active or queued live-agent conversation must finish before switching. An interrupted workflow must be recovered first. Pending customer confirmations are preserved. Because confirmations bind the original request and channel, a pending action is re-presented for fresh confirmation after a channel change. The prior confirmation cannot authorize a financial action in the destination channel.

## Existing API contract

All customer endpoints require a currently valid access token and enforce tenant and conversation ownership on the backend.

- `POST /api/sessions/:sessionId/handoff`: JSON `targetChannel`, one of `digital`, `ava`, or `ivr`. Returns `grant`, `expiresAt`, `sessionId`, and `targetChannel`.
- `POST /api/sessions/resume`: JSON `grant` and `targetChannel`. The explicit destination must match the issued grant **before** consumption. The destination revalidates the access token and the trusted servicing credential before changing the existing workflow's channel.
- Socket equivalents are `requestHandoff` and `resumeSession`; redemption also requires `targetChannel`. IVR message input uses the signed durable voice contract rather than a customer socket.
- Message input carries its expected channel. The workflow checks that expectation under the existing durable session lock, preventing a previously authorized turn from executing after a concurrent switch.

The published workflow snapshot remains pinned. The destination route is recalculated from that snapshot for the same intent. A disabled destination channel, intent, or journey rejects the switch. Changing a channel does not publish a new configuration or release a new version. A chat conversation with no started workflow has no pinned workflow snapshot yet; its first request still goes through the normal published-channel policy.

## Provider-neutral durable voice contract

Configure a voice connector in the server-owned connector catalog, including its exact public webhook URL and environment secret reference. The operator enables the catalog entry through the normal control plane. See [servicing operations](servicing-operations.md) for configuration and signature requirements. Every event requires both the fresh provider signature over the configured public URL and raw request body, and the verified customer's access token. A phone number or provider call ID is never customer authentication. The gateway forwards the existing server-only `SERVICING_SERVICE_TOKEN` for IVR input; direct browser IVR message posts are rejected.

`voice.start` accepts the provider's `callId` and optional `resumeGrant`. With a grant, it resumes the original session into IVR instead of creating another one. The IVR destination is checked before consuming the grant. Call claiming, event receipts, tenant separation, and uncertainty handling remain in the existing PostgreSQL operations store.

`voice.handoff` accepts the existing `callId` and `targetChannel` of `digital` or `ava`. Its actions are:

1. `stop_playback`.
2. `resume_session`, containing `sessionId`, `targetChannel`, `grant`, and `expiresAt`.
3. `end`.

The adapter must deliver the short-lived transfer artifact to the same customer through its authenticated destination experience. It must not put the grant into a link, query string, analytics event, queue notification, transcript, or spoken telephone identifier. The artifact contains no access token or provider credential. Durable replay receipts retain only the handoff outcome, never the redeemable grant. Repeating an event does not issue another grant. If delivery is lost, use the authenticated existing conversation to prepare a fresh transfer rather than replaying an uncertain financial request.

Before `voice.turn`, `voice.interrupt`, or `voice.handoff`, the gateway reads the current owned session and verifies that its channel is IVR. A call that has ended, handed off, or lost channel ownership cannot submit a turn. Workflow dispatch also checks the expected channel while holding durable session coordination. Existing `voice.end` closes the transport call without deleting the conversation or transcript.

## Grant lifecycle and failures

Grants use 32 random bytes, expire after five minutes, bind the customer, tenant, conversation, and destination, and can be consumed once. PostgreSQL stores their hashes. In the customer workspace, the IVR artifact lives only in memory and is cleared at expiry; it is not saved to local storage, session storage, or the URL. The existing account-scoped conversation ID may be remembered separately.

A wrong destination or wrong principal cannot consume a valid grant. Invalid input is rejected, while expired or already consumed grants return a conflict. A destination outage or a persistence failure after redemption can leave a switch uncertain: the consumed grant is not automatically replayed. Refresh the original conversation, confirm the actual channel, and resolve any interrupted workflow before preparing another transfer. No action is silently retried.

This implementation validates the product API, durable grants, and voice-adapter contract locally. It does not claim certification or live verification for a carrier, voice vendor, avatar vendor, identity provider, or model endpoint. Distributed transport delivery and the selected provider's authenticated handoff UX must be verified in the deployment's acceptance environment.

## Verification

The cross-service API fixture uses the real chat and orchestrator route handlers, PostgreSQL grant consumption and voice event receipts, signed local provider events, and a synthetic conversation. It exercises Digital → AVA → IVR → Digital, replay rejection, destination checking, disabled pinned policy, owner checks, pending-context retention, unchanged transcript, stale voice/browser input, and the direct-IVR transport guard without model or financial tool calls. Separate grant tests cover expiry, tenant isolation, and simultaneous redemption by two workers. Frontend contract and rendered-workspace tests cover authenticated request bodies, the current-channel label, continuation controls, and the IVR composer lock.

Run from the repository root with Node 22 and an isolated PostgreSQL fixture supplied through `RUNTIME_TEST_DATABASE_URL` for chat, and `TEST_OPERATIONS_DATABASE_URL` / `TEST_CONTROL_PLANE_DATABASE_URL` for gateway suites. These variables are local test configuration, not production credentials. Follow the repository test commands; do not point fixtures at a customer database.
