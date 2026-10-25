# Authentication and persistence quick reference

Customer requests require a verified access JWT for the deployment tenant. Session ownership is enforced independently of caller body IDs. Operator context and reconciliation also require signed roles plus their dedicated permissions. Internal service credentials supplement customer authentication; they do not replace banking authorization.

| State | Current storage |
| --- | --- |
| Sessions and pending feedback | PostgreSQL `ai_sessions`, `ai_workflow_executions`, `ai_human_feedback` |
| Mutation identity/result/authorization context | PostgreSQL `servicing_tool_operations` when durable execution is enabled |
| Turn coordination | PostgreSQL advisory lock per tenant/session |
| LangGraph checkpoint helper | Process-local `MemorySaver` |
| Cross-channel resume grants | Chat PostgreSQL, hashed and atomically consumed |

Use controlled SQL before production startup, with `DATABASE_MANAGE_SCHEMA=false` and `WORKFLOW_SCHEMA_AUTO_MIGRATE=false`. Configure shared `JWT_SECRET`, `DEPLOYMENT_TENANT_ID`, and `SERVICING_SERVICE_TOKEN`; do not accept browser claims as server policy. See [runtime contracts](CONTROL-PLANE-RUNTIME.md) and [checkpoint boundary](WHY-CHECKPOINTER-IS-REQUIRED.md).
