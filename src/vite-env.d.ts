/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BYPASS_AUTH?: string;
  readonly VITE_UIPATH_CLIENT_ID: string;
  readonly VITE_UIPATH_SCOPE: string;
  readonly VITE_UIPATH_ORG_NAME: string;
  readonly VITE_UIPATH_TENANT_NAME: string;
  readonly VITE_UIPATH_BASE_URL: string;
  /** Optional: exact redirect_uri for hosted staging (baked into build). */
  readonly VITE_UIPATH_REDIRECT_URI?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
