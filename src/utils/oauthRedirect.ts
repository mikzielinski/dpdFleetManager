import { UIPATH_DEFAULT_SCOPE } from '../config';

const OAUTH_ERROR_STORAGE_KEY = 'dpd-fleet-manager-oauth-url-error';

const STAGING_ORG_NAME = 'mzpocevylrxu';
const STAGING_ORG_ID = 'c9ffe0f3-25c8-4539-a40f-1cb8e9248fd2';
const APP_ROUTE = 'dpdmonitoring';

/** Optional build-time override (fallback when window is unavailable). */
export function getEnvRedirectUri(): string {
  return (import.meta.env.VITE_UIPATH_REDIRECT_URI ?? '').trim();
}

/**
 * OAuth scope for SDK authorize. Uses build-time VITE_UIPATH_SCOPE only.
 * Do NOT read meta uipath:scope — hosted Apps inject every External Application
 * scope (OR.*, PM.*, …) and Identity rejects the request with "Invalid scope".
 */
export function resolveOAuthScope(): string {
  return (import.meta.env.VITE_UIPATH_SCOPE ?? '').trim() || UIPATH_DEFAULT_SCOPE;
}

/** True only when SDK actually uses the env value (not the browser URL). */
export function isRedirectUriEnvOverride(): boolean {
  const fromEnv = getEnvRedirectUri();
  if (!fromEnv) return false;
  if (getPlatformMetaRedirectUri()) return false;
  return resolveRedirectUri() === normalizeRedirectUri(fromEnv);
}

/**
 * All redirect URIs to register in External Application (both staging host forms + slash variants).
 */
export function getHostedRedirectUriCandidates(): string[] {
  const hosts = [
    `${STAGING_ORG_NAME}.staging.uipath.host`,
    `${STAGING_ORG_ID}.staging.uipath.host`,
  ];
  const paths = [`/${APP_ROUTE}`, `/${APP_ROUTE}/`, `/${APP_ROUTE}/index.html`];
  const uris = new Set<string>();
  for (const host of hosts) {
    for (const path of paths) {
      uris.add(`https://${host}${path}`);
    }
  }
  const current = resolveRedirectUri();
  if (current) {
    uris.add(current);
    uris.add(getRedirectUriWithTrailingSlash());
  }
  return [...uris];
}

/**
 * Normalize pathname for OAuth redirect_uri (UiPath requires exact match with External App).
 * - strips trailing slash (except root)
 * - strips /index.html (Vite base: './' on hosted apps)
 * - collapses .../dpdmonitoring/index.html → .../dpdmonitoring
 */
export function normalizeRedirectPathname(pathname: string): string {
  let path = pathname || '/';
  if (/\/index\.html$/i.test(path)) {
    path = path.replace(/\/index\.html$/i, '') || '/';
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/** Redirect URI from current browser location — must match External Application (no query/hash). */
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  return origin + normalizeRedirectPathname(pathname);
}

/** True when app runs in Studio Web designer preview (redirect URI ≠ hosted Orchestrator URL). */
export function isStudioDesignerPreview(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/studio_/designer');
}

/** Platform-injected redirect (Coded Web App deployment); may differ from browser URL. */
export function getPlatformMetaRedirectUri(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="uipath:redirect-uri"]')?.getAttribute('content')?.trim() ?? '';
}

function normalizeRedirectUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.search = '';
    const path = normalizeRedirectPathname(url.pathname);
    return url.origin + path;
  } catch {
    return trimmed;
  }
}

/**
 * redirect_uri for SDK authorize/token.
 * Priority (aligned with UiPath coded-app meta + process-app-v1 sample):
 * 1. Platform meta uipath:redirect-uri (registered URI from deployment)
 * 2. VITE_UIPATH_REDIRECT_URI from build
 * 3. Current browser origin + pathname (normalized)
 */
export function resolveRedirectUri(): string {
  const meta = getPlatformMetaRedirectUri();
  if (meta) return normalizeRedirectUri(meta);

  const fromEnv = getEnvRedirectUri();
  if (fromEnv) return normalizeRedirectUri(fromEnv);

  if (typeof window !== 'undefined') {
    const fromWindow = getRedirectUri();
    if (fromWindow) return fromWindow;
  }

  return '';
}

export function getMetaTagContent(name: string): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
}

/** Alternate form some Admin consoles expect (trailing slash). */
export function getRedirectUriWithTrailingSlash(): string {
  const base = resolveRedirectUri();
  return base.endsWith('/') ? base : `${base}/`;
}

const STAGING_PORTAL_ORG_URL = 'https://staging.uipath.com/mzpocevylrxu';

function isAccountAccessError(errorCode: string | null, errorDescription: string | null): boolean {
  const combined = `${errorCode ?? ''} ${errorDescription ?? ''}`.toLowerCase();
  return (
    combined.includes('invalid or missing account') ||
    combined.includes('missing account') ||
    combined.includes('invalid_account') ||
    combined.includes('account not found') ||
    combined.includes('unknown account') ||
    errorCode === '401' ||
    errorCode === 'invalid_account'
  );
}

export function getAccountAccessErrorHint(): string {
  return [
    'Konto nie ma dostępu do organizacji staging mzpocevylrxu (tenant DefaultTenant).',
    `Zaloguj się najpierw w portalu: ${STAGING_PORTAL_ORG_URL}`,
    'Użyj tego samego adresu e-mail, który administrator dodał do organizacji.',
    'Administrator: External Application musi mieć user scopes i użytkownik musi być w organizacji.',
  ].join(' ');
}

export function parseOAuthUrlError(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get('errorCode') ?? params.get('error');
  const errorDescription =
    params.get('error_description') ?? params.get('errorDescription') ?? params.get('message');

  if (!errorCode && !errorDescription) return null;

  const normalizedCode = errorCode?.toLowerCase() ?? '';

  const codeHint: Record<string, string> = {
    invalid_redirect_uri:
      'Redirect URI nie pasuje do zarejestrowanego w External Application. Skopiuj adres z ekranu poniżej.',
    invalid_request:
      'Nieprawidłowe żądanie OAuth — często oznacza invalid_redirect_uri. Zarejestruj dokładny redirect_uri z ekranu aplikacji.',
    invalid_client: 'Nieprawidłowy Client ID lub aplikacja nie jest aktywna.',
    access_denied: 'Odmowa dostępu — użytkownik anulował logowanie lub brak uprawnień.',
    invalid_account: getAccountAccessErrorHint(),
    invalid_grant:
      'Sesja logowania wygasła lub kod autoryzacji jest nieważny — spróbuj zalogować się ponownie.',
  };

  let hint =
    (errorCode && codeHint[errorCode]) ||
    (normalizedCode && codeHint[normalizedCode]) ||
    undefined;

  if (!hint && isAccountAccessError(errorCode, errorDescription)) {
    hint = getAccountAccessErrorHint();
  }

  const descLower = (errorDescription ?? '').toLowerCase();
  if (!hint && (descLower.includes('invalid scope') || descLower.includes('nieprawidłowy zakres'))) {
    hint = [
      'Aplikacja żąda scope, których nie ma w External Application.',
      'Fleet Manager (minimum): DataFabric.Schema.Read, DataFabric.Data.Read, DataFabric.Data.Write, PIMS.',
      'Maestro wymaga dodatkowo: OR.Execution, OR.Jobs, OR.Folders.Read (UiPath.Orchestrator → User scopes).',
      `Portal: ${STAGING_PORTAL_ORG_URL}/portal_/admin/external-apps/oauth`,
    ].join(' ');
  }

  const parts = [
    errorCode ? `Kod: ${errorCode}` : null,
    errorDescription ? `Opis: ${errorDescription}` : null,
    hint,
  ].filter(Boolean);

  return parts.join(' — ');
}

export function clearOAuthQueryFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of [
    'error',
    'errorCode',
    'error_description',
    'errorDescription',
    'message',
    'state',
    'code',
  ]) {
    url.searchParams.delete(key);
  }
  const search = url.searchParams.toString();
  const next = url.pathname + (search ? `?${search}` : '') + url.hash;
  window.history.replaceState({}, '', next);
}

export function persistOAuthUrlError(message: string): void {
  try {
    sessionStorage.setItem(OAUTH_ERROR_STORAGE_KEY, message);
  } catch {
    /* ignore */
  }
}

export function readPersistedOAuthUrlError(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_ERROR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPersistedOAuthUrlError(): void {
  try {
    sessionStorage.removeItem(OAUTH_ERROR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeOAuthUrlError(): string | null {
  const fromUrl = parseOAuthUrlError();
  if (fromUrl) {
    persistOAuthUrlError(fromUrl);
    clearOAuthQueryFromUrl();
    return fromUrl;
  }
  return readPersistedOAuthUrlError();
}
