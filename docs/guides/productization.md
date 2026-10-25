# Productization Guide

This repository can now be positioned as an enterprise conversational platform with a banking accelerator, but it is not yet a drop-in multi-tenant SaaS product. The first supported model is a dedicated enterprise deployment with provider-neutral adapters. The [implementation matrix](servicing-product-implementation.md) records current capabilities, differentiation and remaining deployment qualification.

## What Was Added

- A working [customer servicing control plane](control-plane.md) at `/control-plane`, with signed operator roles, PostgreSQL persistence, versioned configuration and immutable releases
- Editors for every canonical intent's system/user prompts, shared extraction prompts, recognition phrases, required/optional entities, permitted tools and confirmation settings
- Digital, AVA and signed provider-neutral IVR ingress, cross-channel one-time resume grants, case adapters, durable fulfillment, SLA escalation and reconciliation
- Custom typed intents, governed knowledge, evaluation gates, independent approval, environment promotion, canaries, rollout monitoring, operational traces and measured costs
- Published runtime configuration consumed by the existing orchestrator, with request-scoped prompts and release snapshots pinned across confirmation/data collection

- Runtime enterprise branding and endpoint configuration for the frontend via `services/frontend/public/runtime-config.json`
- A tenant profile template at `config/product/enterprise-profile.example.json`
- An enterprise asset generator at `deployment-scripts/generate-enterprise-assets.mjs`
- Updated root environment templates and a current `scripts/validate-env.sh`

These changes support enterprise packaging and runtime servicing configuration without rebuilding the UI. The control plane is deployment-scoped. Provider-neutral voice/case/knowledge contracts and OIDC sign-in are implemented; actual provider connections and shared SaaS tenancy have separate qualification requirements.

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

OIDC authorization-code sign-in with PKCE, nonce/state verification, pinned issuer/
audience/JWKS, local identity mappings and short-lived signed role tokens is
implemented. Configure the IdP client and exact callback, then map authoritative
issuer/subject identities to local users in Servicing Studio. Local JWT sign-in
remains available for the established application.

SCIM provisioning and native SAML are not included. A SAML-based enterprise can
federate through its OIDC broker or supply a reviewed identity adapter. The asset
generator's legacy SAML profile option does not activate native SAML validation.
See the [identity runbook](servicing-operations.md#enterprise-identity).

### 2. Multi-Tenant Isolation

The control plane now enforces signed deployment tenant claims and stores tenant-scoped configuration and audit records. Existing banking/chat data remains deployment-scoped, not fully multi-tenant. To become a reusable SaaS product you still need:

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

The implemented connector registry supports case, voice and governed text-knowledge
contracts with secret references, trusted hosts, deadlines, real health checks,
signed callbacks and deterministic replay protection. Configure enterprise
providers behind those contracts and qualify them in their sandboxes. Provider
adapters own source-system extraction and permission mapping.

### 5. Governance, Trust, and Compliance

Versioned prompts/policy, exact-content evaluations, independent approval,
environment promotion, canary observation, restricted context, operational
retention/privacy and signed evidence export are implemented. Configure customer
retention/legal holds, immutable external archival and appropriate data residency.
The existing policy engine and bounded operational redaction do not establish
regulatory certification or universal PII detection.

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
- commercial billing/entitlement integration over measured usage
- support diagnostics bundle export
- commercial packaging around the existing servicing admin console
- documented upgrade compatibility matrix

## How To Package A New Enterprise Deployment

1. Copy `config/product/enterprise-profile.example.json` and create a tenant-specific profile.
2. Run `npm run product:validate` to validate the profile schema.
3. Run `npm run product:generate` or call the generator directly with `--profile` and `--output`.
4. Mount the generated `frontend-runtime-config.json` as `/runtime-config.json` in the frontend deployment.
5. Load `.env.enterprise.generated` into your deployment environment, secret manager, or Helm values.
6. Replace demo endpoints with enterprise ingress, private service addresses, and real identity settings.
7. Validate the profile with `npm run product:validate`; verify environment configuration, health checks, login and a scripted chat smoke test.

## Recommended Next Engineering Slice

Provider-neutral voice, case, knowledge and identity contracts, durable multi-replica coordination, custom typed intents, evaluated releases, approvals/canaries and operational evidence are implemented. Qualify enterprise provider adapters and run representative customer/load/recovery tests before live activation. See the [implementation matrix](servicing-product-implementation.md), [control plane guide](control-plane.md) and [operations runbook](servicing-operations.md) for exact capabilities and deployment boundaries.
