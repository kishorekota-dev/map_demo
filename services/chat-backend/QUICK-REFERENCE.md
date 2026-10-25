# Chat REST and Socket.IO reference

The [README API table](README.md#customer-rest-api) is the maintained REST contract. Browser REST uses gateway port 3001; direct chat uses 3006. Socket.IO uses the chat server `/socket.io` path with `auth:{token:accessToken}`; raw WebSocket JSON is a different protocol.

| Client event | Purpose |
| --- | --- |
| `createSession` | Create an authenticated customer session; optional metadata channel |
| `joinSession` | Join an owned session and recover its current context |
| `sendMessage` | Submit message for the owned session; retain `clientMessageId` on retry |
| `typing`, `stopTyping` | Presence hints within the authorized session |
| `endSession` | End the owned session |
| `requestHandoff` | `{sessionId,targetChannel}`; response `handoffCreated` |
| `resumeSession` | `{grant}`; response `sessionResumed` |
| `ping` | Connection heartbeat |

The generic `request` envelope supports operator functionality with explicit signed-role/permission checks; a client-side agent flag grants no access. See [socketHandler.js](services/socketHandler.js) for exact per-event payload and acknowledgement shapes.

A new message retains its interaction ID through collection/confirmation. Model unavailability preserves pending feedback. Treat reconciliation-required and timeout responses as uncertain action outcomes, not permission to submit a fresh action. See [handoff contract](SESSION-RESUME-FLOW.md), [architecture](ARCHITECTURE.md), and [governed runtime](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
