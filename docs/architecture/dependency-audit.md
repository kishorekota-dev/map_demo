# Production dependency audit — 2026-10-24

This record covers npm production dependencies for the eight canonical service workspaces, the root workspace lock, and the frontend's separate static-server runtime. It is a dated dependency check, not a certification of the application, container operating system, deployment, or external providers.

## Result and scope

The root `npm audit --omit=dev` initially reported 19 vulnerable packages: 1 critical, 12 high, and 6 moderate. After the changes below, the root and all eight standalone service production audits report **zero reported vulnerabilities**. Each service was checked with `npm audit --omit=dev --workspaces=false` against its own lockfile, which is the tree used by its image build.

| Standalone tree | Before: critical / high / moderate | After: total |
| --- | --- | --- |
| agent-ui | 1 / 5 / 2 | 0 |
| ai-orchestrator | 1 / 8 / 6 | 0 |
| api-gateway | 1 / 4 / 3 | 0 |
| banking-service | 1 / 4 / 4 | 0 |
| chat-backend | 1 / 7 / 4 | 0 |
| frontend application | 0 / 2 / 0 | 0 |
| mcp-service | 1 / 3 / 3 | 0 |
| nlu-service | 1 / 5 / 3 | 0 |
| frontend static-server runtime | 0 / 1 / 0 | 0 |

Counts describe vulnerable package nodes, not independent vulnerabilities or proven exploits. Service counts overlap because services share packages. No live model/provider calls were used for validation.

The banking image also installs its nested `services/banking-service/database` dependency tree; that existing lock was audited separately and reports zero findings without changes.

The frontend image previously installed `serve@14.2.6` globally, outside the workspace lock. That release pins vulnerable `compression@1.8.1`. The new [runtime manifest](../../services/frontend/runtime/package.json) and [runtime lock](../../services/frontend/runtime/package-lock.json) retain serve 14.2.6 and narrowly override its compression dependency to 1.8.2. This runtime is audited separately; its build is reproducible through `npm ci`.

## Changes and actual dependency paths

Direct minimum versions were raised within their existing majors: Express 4.22.3, Axios 1.20.0, compression 1.8.2, Morgan 1.12.1, Joi 17.13.8, Moment 2.31.0, Multer 2.5.0, and MCP SDK 1.32.2. Compatible transitive patches include proxy-addr 2.0.8, body-parser 1.20.9/2.4.0, Engine.IO 6.6.11, and gRPC JS 1.14.6. Existing unrelated overrides remain in place. No `--force` upgrade was used.

- **Express → proxy-addr:** the critical advisory concerns malformed IPv4-mapped IPv6 trust subnets allowing forged client IPs. This affects IP-based controls when those trust settings are used; it is not evidence that the application was exploited. Patched to 2.0.8. [Maintainer advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
- **Express → body-parser:** the services use JSON/body parsers before route authentication. The compressed-body failure path is therefore relevant to their request boundary. Both installed major lines now use their patched releases. [Maintainer advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- **Shared HTTP/socket/validation dependencies:** Axios is used by internal and provider clients; compression and Socket.IO/Engine.IO are active server middleware. Patch upgrades avoid relying solely on endpoint allowlists or service authentication to contain library defects. Other findings were resolved through compatible dependency ranges, including Google client transitive dependencies.
- **Orchestrator → MCP SDK:** the repository uses the SDK client with its own authenticated Node WebSocket transport. SDK HTTP-server bearer middleware and experimental task storage are not the active servicing server path. The package was still upgraded; the new SDK initialization/discovery fixture exercises the actual client and JSON-RPC schema validation. [Experimental-task advisory and applicability](https://github.com/advisories/GHSA-22jm-h49p-29qw).
- **Orchestrator → LangChain/MCP SDK → Zod:** Zod moved from 3.25.76 to 4.6.7 because the advisory's patched range starts at 4.6.6. The installed LangChain, SDK, OpenAI, and zod-to-json-schema consumers declare compatible 3-or-4 ranges. No direct application major dependency was forcibly upgraded. Full graph, extraction, recognition, provider, and protocol fixtures pass. [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- **Chat → Multer:** the declared upload dependency was patched to 2.5.0 even though no active Multer middleware was found in the current chat request pipeline. The newest advisory specifically requires asynchronous file filtering. [Maintainer advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

## Validation and remaining findings

On Node 22 with the updated installed tree: gateway 156 tests, banking 29, orchestrator 130, chat 63, NLU 15, MCP 16, agent UI 9, and frontend 29 passed. PostgreSQL suites used disposable databases and isolated records/schemas; these include migration repetition, ownership, coordination, replay, and banking bootstrap. The frontend TypeScript/Vite production build passed. The SDK fixture performs synthetic WebSocket initialization/discovery only, without a banking operation or model inference.

The development-inclusive root audit and all eight standalone development-inclusive audits also report **zero reported vulnerabilities**. Compatible build/lint transitive updates removed the remaining findings. Vitest was explicitly upgraded from 3.x to patched 4.1.12 after reviewing the [official migration guide](https://v4.vitest.dev/guide/migration.html); Vite remained on its existing 6.x major at patched 6.4.5. The 29 frontend tests and production build pass without test or application behavior changes. No forced or legacy-peer dependency resolution was used.

The initial major test-tool resolution exposed an npm 10 Arborist peer-resolution error. npm 11 generated the compatible lockfile; standard npm 10 installation and `npm ci --dry-run` subsequently succeeded. The lockfiles remain version 3.

Repeat audits in CI because advisory data changes. Container/OS scanning, live deployment acceptance, and target provider verification remain separate evidence. See [architecture boundaries](overview.md) and [runtime recovery](../../services/ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
