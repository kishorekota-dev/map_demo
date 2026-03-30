# Deployment Scripts

This directory contains helpers for packaging the platform for enterprise rollout.

## Enterprise Profile Generation

Use the enterprise profile template at `config/product/enterprise-profile.example.json` and generate deployment assets:

```bash
npm run product:generate
```

This creates:

- `deployment-scripts/output/<profile>/.env.enterprise.generated`
- `deployment-scripts/output/<profile>/frontend-runtime-config.json`
- `deployment-scripts/output/<profile>/enterprise-summary.md`

You can also validate a profile without generating files:

```bash
npm run product:validate
```

Override the profile or output path directly if needed:

```bash
node deployment-scripts/generate-enterprise-assets.mjs \
  --profile config/product/enterprise-profile.example.json \
  --output deployment-scripts/output/acme
```

Mount `frontend-runtime-config.json` as `/runtime-config.json` in the frontend deployment so branding and endpoints can change per enterprise without rebuilding the UI.
