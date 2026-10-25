# Maintaining intents and prompts

Use published configuration for supported behavior edits. Save a draft, inspect the diff, run the configured evaluations, publish, then promote to the intended environment. Check the selected release on a new workflow; continuing sessions deliberately retain their original version.

To extend executable behavior, review the canonical intent configuration, workflow branch, policy validation, MCP tool contract, banking authorization, and deterministic formatter together. Add meaningful failure/confirmation/replay tests, regenerate the gateway seed catalog if the baseline changes, and verify recognition/resolver parity. Do not relax baseline authorization or confirmation to fit an editable intent.

For custom cases, declare required/optional scalar fields and optional additive `fieldSchemas`. For knowledge, publish approved evidence with correct access roles and expiry. For models, add a server provider registration and published profile; never put credentials or arbitrary endpoints into prompts or releases.

Run `npm test -w services/ai-orchestrator -- --runInBand` from the root. Include isolated PostgreSQL tests via `RUNTIME_TEST_DATABASE_URL`; gateway tests verify cross-service recognition/routing contracts. Provider fixture tests do not certify a live provider. See [runtime](CONTROL-PLANE-RUNTIME.md), [provider extension contract](src/llm/README.md), and [current README](README.md).
