/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_AUTH_API_BASE_URL: string;
  readonly VITE_BANKING_SERVICE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_TAGLINE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_TENANT_ID: string;
  readonly VITE_SUPPORT_EMAIL: string;
  readonly VITE_ALLOW_TOKEN_AUTH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}