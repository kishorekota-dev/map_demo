# Documentation review record

Reviewed on October 24, 2026 against the canonical `services/*` implementation.
The [documentation index](../README.md) is the current entry point.

## Review scope

- Root README, quick start, configuration, development/deployment, troubleshooting,
  architecture, deterministic behavior, API index and product positioning.
- Prompt/intent/runtime, model setup/plugins, fulfillment/identity/privacy/cost
  contracts, new platform packages/readiness and administrator bootstrap.
- Current market assessment, measured-response evaluation/gates, case assignment/knowledge,
  durable graph checkpoint/recovery contracts and customer resume behavior.
- Current frontend, banking, chat, orchestrator, NLU and MCP service guides and
  deployment tooling references.
- Earlier implementation, completion, review and test reports: preserved with
  historical banners where superseded. Archive drafts were not rewritten.

Claims were checked against route validators, package scripts, Compose services,
Docker entrypoints, migrations and regression tests. The review corrected the
request flow, optional-model determinism scope, service counts/ports, internal
service identity, supported identity modes, safe environment loading, schema
ownership, readiness semantics, durable graph storage, scoped evaluation delegation,
operator case handling, and dedicated-deployment limits. It removed
unsupported claims that a template, sample or passing unit suite establishes a
production SLA, generic domain neutrality, native SAML, shared SaaS isolation or
live telephony/model qualification.

## Maintain the documentation

```bash
npm run docs:check
```

The checker starts at the root README and documentation index, follows reachable
Markdown references, and checks local target files. It ignores fenced examples,
external URLs and historical document bodies/archives. It does not validate remote
URLs, heading anchors or API behavior. Service-specific reviews additionally
checked owned current references and their linked files. CI runs the link check
alongside deployment and database regression checks.

Route-owner references and executable validators take precedence over historical
OpenAPI artifacts and older completion reports. A changed route, environment
variable, persistence boundary or release workflow should update its current guide
in the same change. Record verification evidence in the
[implementation record](../guides/servicing-product-implementation.md), with exact
scope and external qualification still required.
