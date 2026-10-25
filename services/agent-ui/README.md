# Agent workspace service

This service hosts the existing agent dashboard and relays its Socket.IO requests
to the owning chat backend. It does not grant ownership based on a browser profile,
session ID or room membership.

## Identity and session access

Configure `CHAT_BACKEND_URL` and, if needed, the server-owned
`AGENT_AUTHENTICATION_URL` / `AGENT_TOKEN_VALIDATION_URL`. Validation must return a
verified `userId`, `roles` and finite future ISO `expires`. Supported signed
operator roles are `agent`, `admin`, `control_plane_admin` and
`control_plane_operator`; customer roles, missing expiry and unavailable validation
fail closed. The canonical chat validation endpoint supplies this contract from
verified access tokens. No operator privileges come from `agentInfo`.

Sockets retain verified identity/expiry metadata instead of copying the bearer
token into agent records. Every event and transcript delivery checks expiry; an
expiry timer disconnects the socket and removes rooms. The backend still owns
assignment and customer authorization. Agent UI tracks successful assignments and
trusted backend assignment/end notifications, checking active ownership before
customer details, typing, sending and delivery. Transcript requests carry the
canonical verified agent identity to the owning backend for persisted-assignee
authorization, and recheck expiry before disclosure. A transfer evicts the old
agent even if a stale room survives. Reauthentication replaces the older socket's
access for the same identity.

Queue/detail APIs, unaccepted offers and broadcasts expose routing metadata and
aggregate queue counts. They omit customer identities, free-text reasons,
transcripts and nested customer/provider payloads. Customer context becomes
available after successful backend assignment. History-list requests show routing
metadata only; individual transcripts require the backend-verified assignee. An
ended session remains readable only by its persisted assignee without a subsequent
reassignment. REST
agent detail/history and mutation routes require the same agent identity or the
configured internal service key. Customer details also require the matching
assigned session; the browser sends both IDs. Unknown account types display
`Not available`.

The final log format permits fixed event messages and enumerated/numeric/boolean
operational fields only, including in debug mode. It excludes request
headers/URLs/IPs, identities, transcripts, raw errors and provider payloads. Add new
static event messages explicitly in `services/logMessages.js`; arbitrary messages
become `Operational event`.

## Run and verify

Use Node 22 and the repository's configured environment. From the repository root:

```bash
npm run dev:agent
npm test -w services/agent-ui -- --runInBand
npm run lint -w services/agent-ui
npm run build -w services/agent-ui
```

These checks use mocked identity/backend transports. The local browser fixture
under `tests/fixtures` supplies a synthetic operator token contract; it is not a
real identity provider.

## Limits

Realtime assignment maps, connected sockets and room routing are local to this
process. This hardening does not qualify distributed Socket.IO delivery, a real
enterprise IdP/contact center, token revocation propagation, load, disaster recovery
or a customer pilot. Validate the configured identity service's contract and the
actual deployment topology before rollout. The React customer page still does not
expose the newer live-agent request protocol.
