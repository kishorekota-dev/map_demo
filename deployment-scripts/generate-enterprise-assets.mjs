import fs from 'node:fs/promises';
import path from 'node:path';

const defaultProfilePath = 'config/product/enterprise-profile.example.json';
const defaultOutputDir = 'deployment-scripts/output/example-enterprise';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    profile: defaultProfilePath,
    output: defaultOutputDir,
    validateOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--profile' && args[index + 1]) {
      options.profile = args[index + 1];
      index += 1;
      continue;
    }

    if (current === '--output' && args[index + 1]) {
      options.output = args[index + 1];
      index += 1;
      continue;
    }

    if (current === '--validate-only') {
      options.validateOnly = true;
      continue;
    }

    if (current === '--help') {
      console.log('Usage: node deployment-scripts/generate-enterprise-assets.mjs [--profile path] [--output path] [--validate-only]');
      process.exit(0);
    }
  }

  return options;
};

const requiredPaths = [
  'tenantId',
  'organizationName',
  'productName',
  'tagline',
  'supportEmail',
  'deployment.mode',
  'deployment.ingressBaseUrl',
  'identity.provider',
  'services.apiBaseUrl',
  'services.authBaseUrl',
  'services.chatBackendUrl',
  'services.nluServiceUrl',
  'services.mcpServiceUrl',
  'services.bankingServiceUrl',
  'services.aiOrchestratorUrl',
];

const getValue = (object, dottedPath) => dottedPath.split('.').reduce((value, key) => value?.[key], object);

const validateProfile = (profile) => {
  const errors = [];

  for (const dottedPath of requiredPaths) {
    const value = getValue(profile, dottedPath);
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`Missing required field: ${dottedPath}`);
    }
  }

  const supportedIdentityProviders = new Set(['jwt', 'oidc', 'saml']);
  if (!supportedIdentityProviders.has(profile.identity.provider)) {
    errors.push(`identity.provider must be one of: ${Array.from(supportedIdentityProviders).join(', ')}`);
  }

  const supportedDeploymentModes = new Set(['docker-compose', 'pm2', 'kubernetes']);
  if (!supportedDeploymentModes.has(profile.deployment.mode)) {
    errors.push(`deployment.mode must be one of: ${Array.from(supportedDeploymentModes).join(', ')}`);
  }

  return errors;
};

const buildEnvFile = (profile) => `# Generated enterprise deployment profile for ${profile.organizationName}
ORG_SLUG=${profile.tenantId}
ORG_NAME=${profile.organizationName}
PRODUCT_DISPLAY_NAME=${profile.productName}
PRODUCT_TAGLINE=${profile.tagline}
AUTH_PROVIDER=${profile.identity.provider}
DEFAULT_DEPLOYMENT_MODE=${profile.deployment.mode}
FRONTEND_RUNTIME_CONFIG_PATH=/app/config/runtime-config.json
SUPPORT_EMAIL=${profile.supportEmail}
INGRESS_BASE_URL=${profile.deployment.ingressBaseUrl}
API_GATEWAY_URL=${profile.services.apiBaseUrl.replace(/\/api\/?$/, '')}
CHAT_BACKEND_URL=${profile.services.chatBackendUrl}
BANKING_SERVICE_URL=${profile.services.bankingServiceUrl.replace(/\/api\/v1\/?$/, '')}
AUTH_API_BASE_URL=${profile.services.authBaseUrl}
NLP_SERVICE_URL=${profile.services.nluServiceUrl}
NLU_SERVICE_URL=${profile.services.nluServiceUrl}
MCP_SERVICE_URL=${profile.services.mcpServiceUrl}
AI_ORCHESTRATOR_URL=${profile.services.aiOrchestratorUrl}
OIDC_ISSUER_URL=${profile.identity.issuerUrl || ''}
OIDC_AUDIENCE=${profile.identity.audience || ''}
ALLOW_TOKEN_AUTH=${profile.features.allowTokenAuth ? 'true' : 'false'}
`;

const buildRuntimeConfig = (profile) => ({
  tenantId: profile.tenantId,
  productName: profile.productName,
  tagline: profile.tagline,
  supportEmail: profile.supportEmail,
  apiBaseUrl: profile.services.apiBaseUrl,
  authBaseUrl: profile.services.authBaseUrl,
  features: {
    allowTokenAuth: Boolean(profile.features.allowTokenAuth),
  },
});

const buildSummary = (profile, outputDir) => `# Enterprise Productization Output

## Profile

- Organization: ${profile.organizationName}
- Tenant ID: ${profile.tenantId}
- Product Name: ${profile.productName}
- Deployment Mode: ${profile.deployment.mode}
- Identity Provider: ${profile.identity.provider}

## Generated Files

- ${path.join(outputDir, '.env.enterprise.generated')}
- ${path.join(outputDir, 'frontend-runtime-config.json')}
- ${path.join(outputDir, 'enterprise-summary.md')}

## Deployment Steps

1. Load .env.enterprise.generated into your deployment environment or secret manager.
2. Mount frontend-runtime-config.json as /runtime-config.json in the frontend container or static hosting root.
3. Replace placeholder endpoints with enterprise ingress and internal service addresses.
4. Integrate the configured identity provider before enabling external users.
5. Validate the deployment with npm run validate and your smoke tests.
`;

const main = async () => {
  const options = parseArgs();
  const profilePath = path.resolve(process.cwd(), options.profile);
  const outputDir = path.resolve(process.cwd(), options.output);
  const profileRaw = await fs.readFile(profilePath, 'utf8');
  const profile = JSON.parse(profileRaw);
  const validationErrors = validateProfile(profile);

  if (validationErrors.length > 0) {
    console.error('Enterprise profile validation failed:');
    for (const error of validationErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  if (options.validateOnly) {
    console.log(`Enterprise profile is valid: ${path.relative(process.cwd(), profilePath)}`);
    process.exit(0);
  }

  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(outputDir, '.env.enterprise.generated'), buildEnvFile(profile), 'utf8'),
    fs.writeFile(
      path.join(outputDir, 'frontend-runtime-config.json'),
      `${JSON.stringify(buildRuntimeConfig(profile), null, 2)}\n`,
      'utf8'
    ),
    fs.writeFile(path.join(outputDir, 'enterprise-summary.md'), buildSummary(profile, options.output), 'utf8'),
  ]);

  console.log(`Enterprise assets generated in ${path.relative(process.cwd(), outputDir)}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
