# Architecture Recommendations

This document captures the highest-value follow-ups after reconciling the active runtime with the current repository layout.

## What Was Corrected

- The API gateway now proxies the chat and session REST endpoints that the frontend already expects.
- The missing standalone NLP service is now covered by compatibility endpoints exposed from the NLU service.
- The active Docker entry points were narrowed to `docker/docker-compose.local.yml` and `docker/docker-compose-full-stack.yml`.

## Recommended Next Steps

### 1. Collapse the ghost NLP service contract

The codebase still carries `NLP_SERVICE_URL` across multiple services even though the monorepo only ships `nlu-service`. The compatibility endpoints remove the immediate runtime break, but the naming debt remains.

Recommendation:
- Standardize on `nlu-service` as the only natural-language runtime.
- Remove `nlp` route names and environment variables after consumers are updated.

### 2. Define a single browser ingress policy

The current runtime is workable, but the split should be explicit:

- Browser REST traffic should enter through the API gateway.
- Browser WebSocket traffic should connect directly to the chat backend.
- Direct browser calls to the banking service should be limited to authenticated flows that intentionally bypass the gateway.

Recommendation:
- Capture this contract in tests and environment templates.
- Fail CI if the frontend default URLs no longer match the gateway and chat backend surfaces.

### 3. Generate deployment config from one source of truth

Port, service-name, and compose drift was the main source of operational breakage.

Recommendation:
- Keep a single machine-readable service manifest for names, ports, health paths, and dependencies.
- Generate helper scripts, compose fragments, and documentation tables from that manifest.

### 4. Add smoke tests for each supported startup path

The repo supports multiple ways to run the platform, but they had diverged.

Recommendation:
- Add CI smoke checks for:
  - `npm run dev` plus `npm run dev:frontend`
  - `docker compose -f docker/docker-compose.local.yml up -d --build`
  - `docker compose -f docker/docker-compose-full-stack.yml up -d --build`
- Validate a minimal login, session creation, chat message, and health sweep in each path.

### 5. Reduce active-doc sprawl

The archive is useful for history, but active docs need clearer boundaries.

Recommendation:
- Treat `README.md` and `docs/` as the only actively maintained documentation surface.
- Keep new status notes out of `docs/archive/` unless they are historical snapshots.