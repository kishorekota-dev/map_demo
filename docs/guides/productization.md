# Productization Guide

This repository can now be positioned as an enterprise conversational platform with a banking accelerator, but it is not yet a drop-in multi-tenant SaaS product. The changes in this guide explain what was added, what still needs to change, and how to move from POC deployment to reusable enterprise product.

## What Was Added

- Runtime enterprise branding and endpoint configuration for the frontend via `services/frontend/public/runtime-config.json`
- A tenant profile template at `config/product/enterprise-profile.example.json`
- An enterprise asset generator at `deployment-scripts/generate-enterprise-assets.mjs`
- Updated root environment templates and a current `scripts/validate-env.sh`

These changes remove hard-coded frontend branding, make deployment metadata explicit, and allow enterprise-specific packaging without rebuilding the UI for every customer.

## Product Boundary

To serve any enterprise, the system should be treated as two layers:

1. Platform core
   - `frontend`
   - `api-gateway`
   - `chat-backend`
   - `nlu-service`
   - `mcp-service`
   - `ai-orchestrator`
   - `agent-ui`

2. Domain accelerators
   - `banking-service` today
   - future CRM, HR, ITSM, insurance, healthcare, and operations adapters

The platform core should remain domain-neutral. Industry-specific business logic should live behind adapter contracts, tool registries, or domain services.

## What Still Needs To Change

### 1. Identity and Enterprise Access

The current stack still assumes local JWT-style flows. For enterprise rollout you need:

- OIDC and SAML support
- SCIM or equivalent user provisioning
- organization and workspace RBAC
- per-tenant session policy and token issuer validation

> ⚠️ **Not yet functional:** the enterprise asset generator accepts
> `identity.provider: oidc|saml` and emits `OIDC_ISSUER_URL` / `OIDC_AUDIENCE`,
> but there is **no OIDC/SAML token-issuer validation implemented** in the
> services yet (only local JWT). Treat `oidc`/`saml` profiles as placeholders;
> use `jwt` for working deployments.

### 2. Multi-Tenant Isolation

Today the codebase is deployment-configurable, not fully multi-tenant. To become a reusable enterprise product you need:

- tenant registry and tenant metadata store
- per-tenant secrets and model credentials
- tenant-aware database schema or isolated databases
- tenant-aware audit trails, rate limits, and feature flags

### 3. Domain Adapter Contracts

`banking-service` is still embedded as the primary business domain. To support any enterprise:

- define a domain adapter interface for authenticated actions, retrieval, workflow execution, and case updates
- move banking-specific prompts and tool mappings behind a banking package or adapter
- allow `ai-orchestrator` and `mcp-service` to load domain-specific tool bundles by tenant or deployment profile

### 4. Knowledge and Integration Layer

Any enterprise deployment will need connectors beyond banking APIs. Add:

- connector framework for CRM, ITSM, HRIS, case management, and document systems
- ingestion pipelines for enterprise knowledge bases
- per-connector auth policy and data residency controls

### 5. Governance, Trust, and Compliance

Productization requires operational controls, not just AI flows:

- prompt and policy versioning
- content safety and PII redaction pipelines
- audit retention policy
- explainability and escalation traces
- model approval and fallback policy

### 6. Deployment and Operations

Enterprises need repeatable rollout artifacts:

- Helm charts or Terraform modules
- secrets-management integration
- SLOs, dashboards, tracing, and alerting
- smoke tests per supported topology
- release channels and upgrade runbooks

### 7. Commercial Product Concerns

To ship this as a product rather than a project, add:

- feature licensing and entitlements
- tenant usage metering
- support diagnostics bundle export
- admin console for tenant configuration
- documented upgrade compatibility matrix

## How To Package A New Enterprise Deployment

1. Copy `config/product/enterprise-profile.example.json` and create a tenant-specific profile.
2. Run `npm run product:validate` to validate the profile schema.
3. Run `npm run product:generate` or call the generator directly with `--profile` and `--output`.
4. Mount the generated `frontend-runtime-config.json` as `/runtime-config.json` in the frontend deployment.
5. Load `.env.enterprise.generated` into your deployment environment, secret manager, or Helm values.
6. Replace demo endpoints with enterprise ingress, private service addresses, and real identity settings.
7. Validate startup with `npm run validate`, health checks, login, and a scripted chat smoke test.

## Recommended Next Engineering Slice

The highest-value next implementation is to introduce a domain adapter contract and move banking-specific prompt and tool registration behind it. That is the architectural step that turns this repo from a banking chatbot solution into a reusable enterprise conversational product.