# Chat architecture

The chat backend is the authenticated conversation adapter for Digital, AVA, and IVR. REST and Socket.IO both enforce identity and session ownership and carry the bound channel to the orchestrator. New messages use an NLU hint; the enabled control-plane runtime performs authoritative published recognition. Pending data/confirmation replies use the feedback endpoint without reclassifying the workflow.

[sessionManager](services/sessionManager.js) manages session lifecycle and [chatService](services/chatService.js) maps messages/history. With persistence enabled, [databaseService](services/databaseService.js) stores `chat_sessions` and `chat_messages`. [agentOrchestrator](services/agentOrchestrator.js) forwards the customer JWT to AI and separately authenticates internal NLU calls using the service token. It maps workflow outcomes into client responses; it does not execute banking mutations itself.

[handoffService](services/handoffService.js) creates identity/channel-bound short-lived grants, stores hashes, and consumes them once in PostgreSQL. The orchestrator's internal channel update requires both customer JWT and servicing credential. A downstream failure leaves the consumed grant unusable; issue a new grant after inspecting state.

Durable messages/grants do not make Socket.IO rooms, process caches, or connection delivery shared. Horizontal deployments still need a supported shared socket adapter/routing strategy and failover tests. See [API](README.md), [event reference](QUICK-REFERENCE.md), [handoff](SESSION-RESUME-FLOW.md), and the [servicing runtime](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
