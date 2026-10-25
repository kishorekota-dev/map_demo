# Intent architecture

The canonical catalog in [intentConfig.js](config/intentConfig.js) defines the reviewed banking handlers, data requirements, prompt names, tool allowlists, and confirmation floors. The gateway seeds these into versioned control-plane releases. Validation keeps required canonical entries and rejects weakened security floors.

At runtime, [controlPlaneRuntime](src/services/controlPlaneRuntime.js) selects and pins a published release. [recognition](src/services/recognition.js) scores published intent candidates; [intentMapper](src/services/intentMapper.js) resolves the published intent and optional base handler using request-scoped context. Parallel sessions cannot mutate each other's global prompt definitions.

The graph still owns explicit domain branches. A custom intent inherits one of those branches, or the supported generic case/knowledge handler. Adding catalog text does not add executable banking behavior. Tool execution passes the policy engine and durable mutation ledger before MCP; the banking service checks the actual customer authorization.

The [runtime reference](CONTROL-PLANE-RUNTIME.md) documents recognition confidence/ambiguity, fields, prompts, model profiles, release pinning, and action boundaries. The [platform architecture](../../docs/architecture/overview.md) describes cross-service ownership.
