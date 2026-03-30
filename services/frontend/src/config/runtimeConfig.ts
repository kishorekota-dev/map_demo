export interface RuntimeConfig {
  tenantId: string;
  productName: string;
  tagline: string;
  supportEmail: string;
  apiBaseUrl: string;
  authBaseUrl: string;
  features: {
    allowTokenAuth: boolean;
  };
}

const resolveString = (value: string | undefined, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const resolveBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return !['false', '0', 'no', 'off'].includes(normalized);
};

const defaultRuntimeConfig: RuntimeConfig = {
  tenantId: resolveString(import.meta.env.VITE_TENANT_ID, 'default-enterprise'),
  productName: resolveString(import.meta.env.VITE_APP_NAME, 'Enterprise Conversational Platform'),
  tagline: resolveString(
    import.meta.env.VITE_APP_TAGLINE,
    'Configurable AI assistants for secure enterprise workflows'
  ),
  supportEmail: resolveString(import.meta.env.VITE_SUPPORT_EMAIL, 'support@example.com'),
  apiBaseUrl: resolveString(import.meta.env.VITE_API_BASE_URL, 'http://localhost:3001/api'),
  authBaseUrl: resolveString(
    import.meta.env.VITE_AUTH_API_BASE_URL || import.meta.env.VITE_BANKING_SERVICE_URL,
    'http://localhost:3005/api/v1'
  ),
  features: {
    allowTokenAuth: resolveBoolean(import.meta.env.VITE_ALLOW_TOKEN_AUTH, true),
  },
};

let runtimeConfig: RuntimeConfig = defaultRuntimeConfig;

const mergeRuntimeConfig = (partialConfig: Partial<RuntimeConfig>): RuntimeConfig => {
  const features = partialConfig.features || {};

  return {
    ...defaultRuntimeConfig,
    ...partialConfig,
    features: {
      ...defaultRuntimeConfig.features,
      ...features,
    },
  };
};

export async function initializeRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/runtime-config.json', { cache: 'no-store' });

    if (response.ok) {
      const candidateConfig = (await response.json()) as Partial<RuntimeConfig>;
      runtimeConfig = mergeRuntimeConfig(candidateConfig);
    }
  } catch {
    runtimeConfig = defaultRuntimeConfig;
  }

  document.title = runtimeConfig.productName;
  return runtimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}