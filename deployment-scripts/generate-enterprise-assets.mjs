import fs from 'node:fs/promises';
import path from 'node:path';
import environment from './lib/environment.cjs';
const { quote } = environment;

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
    throw new Error('Unknown or incomplete option. Run with --help.');
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

  const supportedIdentityProviders = new Set(['jwt', 'oidc']);
  if (!supportedIdentityProviders.has(profile.identity?.provider)) {
    errors.push('identity.provider must be jwt or oidc; a SAML broker is not implemented.');
  }

  const supportedDeploymentModes = new Set(['docker-compose', 'pm2', 'kubernetes']);
  if (!supportedDeploymentModes.has(profile.deployment?.mode)) {
    errors.push(`deployment.mode must be one of: ${Array.from(supportedDeploymentModes).join(', ')}`);
  }

  const inspectStrings = (value, field = 'profile') => {
    if (typeof value === 'string' && (value.length > 2048 || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) errors.push(`${field} contains unsupported control characters or exceeds its size limit.`);
    if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) inspectStrings(nested, `${field}.${key}`);
  };
  inspectStrings(profile);
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(profile.tenantId || '')) errors.push('tenantId must be a lowercase deployment identifier (2–63 characters).');
  for (const field of ['deployment.ingressBaseUrl', ...requiredPaths.filter(item => item.startsWith('services.')),
    ...(profile.identity?.provider === 'oidc' ? ['identity.issuerUrl'] : [])]) {
    try {
      const url = new URL(getValue(profile, field));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      if (['deployment.ingressBaseUrl', 'identity.issuerUrl'].includes(field) && url.protocol !== 'https:') throw new Error();
    } catch { errors.push(`${field} must be an HTTP(S) endpoint without credentials/query/fragment; public ingress and OIDC require HTTPS.`); }
  }
  if (!profile.features || typeof profile.features.allowTokenAuth !== 'boolean') errors.push('features.allowTokenAuth must be a boolean.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.supportEmail || '')) errors.push('supportEmail must be an email address.');
  return errors;
};

const buildEnvFile = (profile) => `# Generated enterprise deployment profile (dotenv data; never shell-source this file)
ORG_SLUG=${profile.tenantId}
DEPLOYMENT_TENANT_ID=${profile.tenantId}
CONTROL_PLANE_ENABLED=true
CONTROL_PLANE_URL=${profile.services.apiBaseUrl.replace(/\/$/, '')}/control-plane
# Set CONTROL_PLANE_DATABASE_URL to a PostgreSQL connection string in your secret manager.
# Alternatively configure CONTROL_PLANE_DATA_FILE plus CONTROL_PLANE_SINGLE_WRITER=true.
OPERATIONS_URL=${profile.services.apiBaseUrl.replace(/\/$/, '')}/operations
FULFILLMENT_WORKER_ENABLED=true
WORKFLOW_DURABLE_EXECUTION=true
HANDOFF_STORAGE=postgres
# Operations require PostgreSQL even when development configuration uses a file.
# Set OPERATIONS_DATABASE_URL (or CONTROL_PLANE_DATABASE_URL), SERVICING_SERVICE_TOKEN,
# connector secret references and all OIDC endpoints through your secret manager.
CONTROL_PLANE_ENVIRONMENT=production
AGENT_RESPONSE_TIMEOUT=400000
SERVICING_REQUEST_TIMEOUT_MS=410000
# Model provider registry is server-owned; see docs/guides/llm-providers.md.
# Mount a deployment-specific file and set its absolute container/runtime path.
# LLM_PROVIDERS_FILE=/run/config/llm-providers.json
# LLM_OLLAMA_BASE_URL=http://mac-studio.local:11434
# Set explicitly referenced API credentials through your secret manager.
ORG_NAME=${profile.organizationName}
PRODUCT_DISPLAY_NAME=${profile.productName}
PRODUCT_TAGLINE=${profile.tagline}
AUTH_PROVIDER=${profile.identity.provider}
DEFAULT_DEPLOYMENT_MODE=${profile.deployment.mode}
FRONTEND_RUNTIME_CONFIG_PATH=/app/dist/runtime-config.json
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
OIDC_ISSUER=${profile.identity.issuerUrl || ''}
OIDC_AUDIENCE=${profile.identity.audience || ''}
ALLOW_TOKEN_AUTH=${profile.features.allowTokenAuth ? 'true' : 'false'}
`.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (_line, key, value) => `${key}=${quote(value)}`);

const buildRuntimeConfig = (profile) => ({
  tenantId: profile.tenantId,
  productName: profile.productName,
  tagline: profile.tagline,
  supportEmail: profile.supportEmail,
  apiBaseUrl: profile.services.apiBaseUrl,
  authBaseUrl: profile.services.authBaseUrl,
  chatRequestTimeoutMs: 420000,
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

1. Review .env.enterprise.generated as dotenv data and inject values through the environment loader or deployment tooling; never shell-source it.
2. Mount frontend-runtime-config.json as /runtime-config.json in the frontend container or static hosting root.
3. Replace placeholder endpoints with enterprise ingress and internal service addresses.
4. Integrate the configured identity provider before enabling external users.
5. Configure CONTROL_PLANE_DATABASE_URL, run banking migrations for operator roles, and sign in again to obtain signed role claims.
6. Complete the production environment, run production:preflight, and run deployment smoke tests before publishing servicing changes. Profile validation checks structure only; it does not certify deployment readiness.
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
