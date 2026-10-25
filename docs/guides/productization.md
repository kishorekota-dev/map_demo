# Enterprise product packaging

The first supported offering is a dedicated enterprise servicing deployment with
provider-neutral adapters and a banking accelerator. The product now includes a
configuration/control plane, operator workspaces, reusable solutions, durable
execution, identity, fulfillment and deployment tooling. The [implementation
record](servicing-product-implementation.md) distinguishes delivered mechanisms
from customer qualification and commercial work.

## Delivered platform mechanisms

| Area | Product behavior |
| --- | --- |
| Authoring | Every canonical intent/prompt, typed custom intents, shared prompts, recognition, journeys, channels, queues and model routing |
| Governance | Immutable releases, exact-content contract evaluation, independent approval, environments, canaries, observed rollback and pinned continuations |
| Reuse | Validated solution catalog/import/export, semantic diff, reviewed conflicts, optimistic draft application and package provenance |
| Integrations | Server-owned model registry and provider-neutral case, voice and knowledge adapters, secret references and trusted networking |
| Operations | Cases, leased fulfillment, SLA/reconciliation, evidence, retention/privacy, measured usage and configured costs |
| Identity | Signed tenant roles, OIDC authorization code/PKCE, local mappings, revocable browser sessions and offline first-administrator bootstrap |
| Deployment | Safe environment parser, production preflight, private Compose overlay, explicit migrations, verification-only runtime schemas, readiness and sanitized diagnostic export |

These controls are deployment-scoped. Banking remains embedded in canonical
intent validation, tools, response formatting and authorization; generic service
and knowledge journeys are supported. A new industry action still needs reviewed
code and authenticated source-system contracts. A configuration package cannot
install executable integrations or transform the app into a new domain alone.

## Package an enterprise deployment

1. Copy [enterprise profile](../../config/product/enterprise-profile.example.json)
   and choose the tenant, branding, endpoints and identity mode. The generator
   accepts `jwt` or `oidc`; native SAML is not implemented. Federate SAML through
   an enterprise OIDC broker when appropriate.
2. Validate/generate with `npm run product:validate` and
   `npm run product:generate`. CLI `--profile` and `--output` select explicit paths.
   Generated files contain defaults, not provisioned production secrets.
3. Complete a protected copy of [production environment](../../.env.production.example).
   Mount the generated public runtime JSON read-only, set exact HTTPS endpoints,
   disable browser token entry, inject named credential environment variables and
   supply private model/connector declaration mounts.
4. Run static preflight and explicit banking/servicing migration jobs. Bootstrap
   the initial operator against the intended database and configure authoritative
   identity mappings. Start the production overlay behind controlled TLS ingress.
5. Inspect authenticated runtime readiness, install a reviewed solution draft,
   then evaluate, approve and publish it. Configure live connectors only after
   provider sandbox tests and customer identity/authorization mappings pass.
6. Record representative journey, capacity, outage and backup/restore evidence
   before live activation; archive the relevant signed operational exports.

Follow [Deployment](deployment.md) for executable commands and
[Platform operations](platform-readiness.md) for diagnostics, administrator
bootstrap and reusable packages. Environment files are data, with no shell
substitution/interpolation. Public runtime JSON must never contain credentials.

## Product and operational boundaries

| Boundary | Current scope / remaining work |
| --- | --- |
| Tenancy | Signed deployment tenant and tenant-scoped operational/control records; banking/chat isolated by dedicated deployment, without pooled SaaS tenancy |
| Domain portability | Reviewed registered tools and adapters; banking-specific code remains, with no arbitrary workflow-code marketplace |
| Identity | OIDC/local JWT implemented; customer IdP registration/mappings required, SCIM and native SAML absent |
| Voice | Signed normalized turn/action contract; actual media, ASR/TTS, DTMF timing and contact-center transfer require a provider adapter |
| Model portability | Protocol fixtures and governed profiles verified; separate Mac Studio/cloud reachability, quality and latency require target testing |
| Reliability | Durable records, leases, unknown-outcome handling and readiness; graph checkpoints now persist in PostgreSQL; socket/cache state remains process-local, and throughput/SLO/RPO/RTO remain unmeasured |
| Deployment | Supported dedicated Compose overlay and explicit schema lifecycle; no generated production Helm/Terraform installer or universal rolling-upgrade compatibility guarantee |
| Assurance | Operational ACL/retention/evidence mechanisms; customer legal policy, immutable archival, full data lifecycle and regulatory certification remain external |
| Commercial | Measured usage/configured costs; no licensing, entitlement enforcement, subscriptions, invoicing or commercial support contract |

A health report and passing fixtures are useful operational evidence; a customer
pilot establishes whether the deployment meets its service objectives. See
[architecture recommendations](../architecture/recommendations.md) for technical
limits and [market comparison](market-comparison.md) for the differentiation
assessment and dated primary-source references.
