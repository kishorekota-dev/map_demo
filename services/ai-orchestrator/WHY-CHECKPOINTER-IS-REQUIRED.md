# Graph checkpoints and durable recovery

The current graph uses LangGraph `MemorySaver` when checkpointing is enabled. It keeps graph state within a process. It does not persist across process restart or coordinate workers, and must not be advertised as a PostgreSQL graph checkpointer.

The application persists sessions, pending feedback, release snapshots, and interaction identity in PostgreSQL. A separate durable mutation ledger records dispatch and authoritative acknowledgement, while advisory locks coordinate turns. These mechanisms support pending workflow continuation and prevent blind duplicate mutations even when the graph helper is process-local.

A crash after dispatch but before acknowledgement is uncertain. Recovery surfaces reconciliation rather than repeating the action. A completed effect whose terminal session update fails can be replayed from the original ledger identity; it does not justify a fresh dispatch. Cross-service handoff and provider operations are not distributed transactions.

A future durable graph checkpointer must be evaluated with the existing session/ledger lifecycle and retention rules. It cannot replace domain authorization, confirmation, idempotency, or provider reconciliation. See [runtime recovery](CONTROL-PLANE-RUNTIME.md) and [architecture](ARCHITECTURE-DIAGRAMS.md).
