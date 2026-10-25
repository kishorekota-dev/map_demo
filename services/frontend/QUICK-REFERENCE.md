# Frontend quick reference

Current sources: [README](README.md), [setup](SETUP-GUIDE.md), and
[operator guide](OPERATIONS-CONSOLE.md). Run commands from the repository root.

```bash
npm run dev:frontend
npm run typecheck -w services/frontend
npm run lint -w services/frontend
npm run test -w services/frontend
npm run build -w services/frontend
npm run preview -w services/frontend
```

Node.js 22+, npm 10+. Development and preview default to port 3000; preview needs
an existing build. Root development commands load `.env.development` through
[run-with-env.sh](../../scripts/run-with-env.sh).

| Browser route | Purpose |
| --- | --- |
| `/auth` | Password, optional token, or configured enterprise sign-in |
| `/chat` | Customer conversation |
| `/control-plane` | Servicing design and operations |

| Client | API base and calls |
| --- | --- |
| `authService` | `authBaseUrl` + `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` |
| Enterprise identity | `apiBaseUrl` + `/identity/config`, `/identity/session`, `/identity/logout` |
| Customer API | `apiBaseUrl` + `/sessions`, `/chat/message`, `/chat/history`, `/nlu/...` |
| Control plane | `apiBaseUrl` + `/control-plane/...` |
| Operations | `apiBaseUrl` + `/operations/...` |
| Model registry | `apiBaseUrl` + `/orchestrator/llm/...` |

Local defaults are gateway `http://localhost:3001/api` and banking authentication
`http://localhost:3005/api/v1`. Runtime JSON overrides Vite fallbacks. The chat-only
request deadline defaults to 420,000 ms and accepts 1,000–600,000 ms; ordinary
Axios API calls use 30 seconds.

Configuration changes follow **edit → validate → save draft → evaluate/approve
when required → publish → promote environment when needed**. Synthetic provider
tests and contract evaluations have different scopes. Neither changes published
routing automatically. Existing sessions keep their pinned release.

Use [Models & providers](OPERATIONS-CONSOLE.md#models-and-providers) to discover
and test a server-configured provider. The remote Mac Studio host and cloud
credentials are deployment configuration, not browser form fields.
