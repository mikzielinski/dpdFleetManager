import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UiPath } from '@uipath/uipath-typescript/core';
import type { UiPathSDKConfig } from '@uipath/uipath-typescript/core';
import {
  clearPersistedOAuthUrlError,
  consumeOAuthUrlError,
  getEnvRedirectUri,
  getRedirectUri,
  getRedirectUriWithTrailingSlash,
  getMetaTagContent,
  getHostedRedirectUriCandidates,
  getPlatformMetaRedirectUri,
  isRedirectUriEnvOverride,
  isStudioDesignerPreview,
  readPersistedOAuthUrlError,
  resolveRedirectUri,
  getAccountAccessErrorHint,
} from '../utils/oauthRedirect';
import {
  createUiPathSdk,
  getStagingExternalAppsUrl,
  getStagingPortalOrgUrl,
} from '../utils/uipathOAuth';

import { BYPASS_AUTH } from '../services/demoData';

export { BYPASS_AUTH };

interface AuthContextValue {
  sdk: UiPath;
  isAuthenticated: boolean;
  /** True after SDK initialize() / OAuth callback — safe to call Data Fabric APIs */
  sdkReady: boolean;
  isInitializing: boolean;
  authError: string | null;
  oauthUrlError: string | null;
  redirectUri: string;
  login: () => Promise<void>;
  dismissOAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ENV_LABELS: Record<string, string> = {
  VITE_UIPATH_CLIENT_ID: 'Client ID (External Application)',
  VITE_UIPATH_SCOPE: 'Zakres OAuth (scope)',
  VITE_UIPATH_ORG_NAME: 'Organizacja',
  VITE_UIPATH_TENANT_NAME: 'Tenant',
  VITE_UIPATH_BASE_URL: 'Base URL API',
};

type AuthConfigResult =
  | { ok: true; config: UiPathSDKConfig }
  | { ok: false; missing: string[]; message: string };

function readAuthConfig(): AuthConfigResult {
  const clientId =
    getMetaTagContent('uipath:client-id') ||
    (import.meta.env.VITE_UIPATH_CLIENT_ID ?? '').trim();
  const scope =
    getMetaTagContent('uipath:scope') || (import.meta.env.VITE_UIPATH_SCOPE ?? '').trim();
  const orgName =
    getMetaTagContent('uipath:org-name') || (import.meta.env.VITE_UIPATH_ORG_NAME ?? '').trim();
  const tenantName =
    getMetaTagContent('uipath:tenant-name') ||
    (import.meta.env.VITE_UIPATH_TENANT_NAME ?? '').trim();
  const baseUrl =
    getMetaTagContent('uipath:base-url') || (import.meta.env.VITE_UIPATH_BASE_URL ?? '').trim();

  const missing: string[] = [];
  if (!clientId) missing.push('VITE_UIPATH_CLIENT_ID');
  if (!scope) missing.push('VITE_UIPATH_SCOPE');
  if (!orgName) missing.push('VITE_UIPATH_ORG_NAME');
  if (!tenantName) missing.push('VITE_UIPATH_TENANT_NAME');
  if (!baseUrl) missing.push('VITE_UIPATH_BASE_URL');

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message:
        'Brakuje zmiennych VITE_UIPATH_* wbudowanych w build. Uzupełnij .env, zbuduj ponownie (npm run build) i wypchnij aplikację (uip codedapp push).',
    };
  }

  const redirectUri = resolveRedirectUri();
  if (import.meta.env.DEV) {
    const metaRedirect = getPlatformMetaRedirectUri();
    console.info('[OAuth] SDK redirect_uri:', redirectUri, {
      window: typeof window !== 'undefined' ? getRedirectUri() : null,
      env: getEnvRedirectUri() || null,
      platformMeta: metaRedirect || null,
    });
    if (metaRedirect && metaRedirect !== redirectUri) {
      console.warn(
        '[OAuth] Platform meta uipath:redirect-uri differs from SDK value — using browser URL:',
        { metaRedirect, sdkRedirectUri: redirectUri },
      );
    }
  }

  return {
    ok: true,
    config: {
      baseUrl,
      orgName,
      tenantName,
      clientId,
      redirectUri,
      scope,
    },
  };
}

/** Fallback SDK config when bypassing auth without full VITE_* build vars. API calls need a real token. */
function getStubAuthConfig(): UiPathSDKConfig {
  return {
    baseUrl:
      (import.meta.env.VITE_UIPATH_BASE_URL ?? '').trim() || 'https://staging.api.uipath.com',
    orgName: (import.meta.env.VITE_UIPATH_ORG_NAME ?? '').trim() || 'mzpocevylrxu',
    tenantName: (import.meta.env.VITE_UIPATH_TENANT_NAME ?? '').trim() || 'DefaultTenant',
    clientId: (import.meta.env.VITE_UIPATH_CLIENT_ID ?? '').trim() || 'bypass-dev-client',
    redirectUri: resolveRedirectUri(),
    scope:
      (import.meta.env.VITE_UIPATH_SCOPE ?? '').trim() ||
      'DataFabric.Schema.Read DataFabric.Data.Read',
  };
}

function SdkRedirectUriBlock({
  sdkRedirectUri,
  envOverride,
}: {
  sdkRedirectUri: string;
  envOverride: boolean;
}) {
  const browserUri = getRedirectUri();
  const browserUriSlash = getRedirectUriWithTrailingSlash();
  const platformMeta = getPlatformMetaRedirectUri();

  return (
    <>
      <h2 className="config-subtitle">redirect_uri przekazywany do SDK</h2>
      <p className="hint-small">
        Ten adres jest wysyłany w żądaniu authorize (parametr <code>redirect_uri</code>). Zarejestruj
        go w External Application — znak po znaku, bez <code>?errorCode=</code>.
      </p>
      {envOverride && (
        <p className="hint-small">
          Użyto <code>VITE_UIPATH_REDIRECT_URI</code> z builda (nie adresu z paska przeglądarki).
        </p>
      )}
      <code className="config-uri">{sdkRedirectUri}</code>
      {platformMeta && platformMeta !== sdkRedirectUri && (
        <p className="hint-small">
          Meta platformy <code>uipath:redirect-uri</code> (nieużywane przez SDK):{' '}
          <code>{platformMeta}</code> — zarejestruj oba w External Application, jeśli testujesz
          różne hosty.
        </p>
      )}
      {browserUriSlash !== sdkRedirectUri && browserUriSlash !== browserUri && (
        <p className="hint-small">
          Wariant ze slashem: <code>{browserUriSlash}</code>
        </p>
      )}
    </>
  );
}

function RedirectUriRegistrationHints() {
  const candidates = getHostedRedirectUriCandidates();

  return (
    <>
      <h2 className="config-subtitle">Zarejestruj w External Application (wszystkie)</h2>
      <p className="hint-small">
        Portal:{' '}
        <a
          href="https://staging.uipath.com/mzpocevylrxu/portal_/admin/external-apps/oauth"
          target="_blank"
          rel="noreferrer"
        >
          Admin → External Applications
        </a>
        . Client ID: <code>{import.meta.env.VITE_UIPATH_CLIENT_ID}</code>
      </p>
      <ul className="config-list config-uri-list">
        {candidates.map((uri) => (
          <li key={uri}>
            <code>{uri}</code>
          </li>
        ))}
      </ul>
    </>
  );
}

function AuthConfigScreen({ result }: { result: Extract<AuthConfigResult, { ok: false }> }) {
  const sdkRedirectUri = resolveRedirectUri();

  return (
    <div className="auth-screen">
      <div className="auth-card config-card">
        <div className="dpd-logo">DPD</div>
        <h1>Fleet Manager — konfiguracja OAuth</h1>
        <p className="config-lead">{result.message}</p>

        <h2 className="config-subtitle">Brakujące zmienne</h2>
        <ul className="config-list">
          {result.missing.map((key) => (
            <li key={key}>
              <code>{key}</code> — {ENV_LABELS[key] ?? key}
            </li>
          ))}
        </ul>

        <SdkRedirectUriBlock
          sdkRedirectUri={sdkRedirectUri}
          envOverride={isRedirectUriEnvOverride()}
        />
        <RedirectUriRegistrationHints />

        <p className="hint-small">
          Org: mzpocevylrxu · Tenant: DefaultTenant · API: staging.api.uipath.com
        </p>
      </div>
    </div>
  );
}

function isAccountOAuthFailure(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid or missing account') ||
    lower.includes('missing account') ||
    lower.includes('konto nie ma dostępu') ||
    lower.includes('invalid_account') ||
    lower.includes('kod: 401')
  );
}

export function AuthLoginScreen({
  authError,
  oauthUrlError,
  redirectUri,
  isInitializing,
  onLogin,
  onDismissOAuthError,
}: {
  authError: string | null;
  oauthUrlError: string | null;
  redirectUri: string;
  isInitializing: boolean;
  onLogin: () => void;
  onDismissOAuthError: () => void;
}) {
  const showOAuthFailure = Boolean(oauthUrlError);
  const envOverride = isRedirectUriEnvOverride();
  const showAccountHint = isAccountOAuthFailure(oauthUrlError);

  return (
    <div className="auth-screen">
      <div className="auth-card config-card">
        <div className="dpd-logo">DPD</div>
        <h1>{showOAuthFailure ? 'Błąd logowania UiPath' : 'Fleet Manager'}</h1>

        {showOAuthFailure ? (
          <>
            <p className="config-lead">
              {showAccountHint
                ? 'Błąd konta (401) — zalogowane konto nie ma dostępu do organizacji staging lub tenant DefaultTenant.'
                : 'Logowanie OAuth nie powiodło się. Sprawdź Redirect URI w External Application — musi być identyczny z adresem aplikacji (bez parametrów ?errorCode=).'}
            </p>
            <p className="error-text oauth-error-detail">{oauthUrlError}</p>
            {showAccountHint ? (
              <div className="oauth-account-hint">
                <p className="hint-small">{getAccountAccessErrorHint()}</p>
                <p className="hint-small">
                  Portal organizacji:{' '}
                  <a href={getStagingPortalOrgUrl()} target="_blank" rel="noreferrer">
                    {getStagingPortalOrgUrl()}
                  </a>
                  {' · '}
                  <a href={getStagingExternalAppsUrl()} target="_blank" rel="noreferrer">
                    External Applications
                  </a>
                </p>
              </div>
            ) : (
              <>
                <SdkRedirectUriBlock sdkRedirectUri={redirectUri} envOverride={envOverride} />
                <RedirectUriRegistrationHints />
              </>
            )}
            {authError && authError !== oauthUrlError && (
              <p className="error-text">{authError}</p>
            )}
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={isInitializing}
                onClick={onDismissOAuthError}
              >
                {isInitializing ? 'Przekierowanie…' : 'Spróbuj ponownie'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Zaloguj się do UiPath (staging), aby przeglądać koszty kierowców z Data Fabric.</p>
            {isStudioDesignerPreview() && (
              <p className="error-text">
                Podgląd w Studio Web ma inny redirect_uri niż hosted app. Otwórz aplikację pod adresem{' '}
                <code>https://mzpocevylrxu.staging.uipath.host/dpdmonitoring</code> lub zarejestruj
                w External Application URI z paska adresu designer.
              </p>
            )}
            <p className="hint-small">
              Użyj konta z dostępem do org <strong>mzpocevylrxu</strong> / tenant{' '}
              <strong>DefaultTenant</strong>. Jeśli widzisz „Invalid or missing account”, najpierw
              otwórz{' '}
              <a href={getStagingPortalOrgUrl()} target="_blank" rel="noreferrer">
                portal staging
              </a>
              .
            </p>
            <SdkRedirectUriBlock sdkRedirectUri={redirectUri} envOverride={envOverride} />
            <RedirectUriRegistrationHints />
            {authError && <p className="error-text">{authError}</p>}
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={isInitializing}
                onClick={onLogin}
              >
                {isInitializing ? 'Przekierowanie…' : 'Zaloguj'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AuthProviderInner({
  children,
  config,
  bypassAuth = false,
}: {
  children: ReactNode;
  config: UiPathSDKConfig;
  /** When true, skip OAuth redirect/callback; UI loads as "logged in" without a token. */
  bypassAuth?: boolean;
}) {
  const [sdk, setSdk] = useState(() =>
    bypassAuth ? new UiPath(config) : createUiPathSdk(config),
  );
  const [redirectUri, setRedirectUri] = useState(() => resolveRedirectUri());

  useEffect(() => {
    if (import.meta.env.DEV && !bypassAuth) {
      console.info('[OAuth] UiPath SDK config.redirectUri:', redirectUri);
    }
  }, [redirectUri, bypassAuth]);

  const [isAuthenticated, setIsAuthenticated] = useState(() => bypassAuth || sdk.isAuthenticated());
  const [sdkReady, setSdkReady] = useState(() => bypassAuth);
  const [isInitializing, setIsInitializing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [oauthUrlError, setOauthUrlError] = useState<string | null>(() => consumeOAuthUrlError());
  const blockAutoLoginRef = useRef(Boolean(oauthUrlError));

  const refreshAuth = useCallback(() => {
    setIsAuthenticated(sdk.isAuthenticated());
  }, [sdk]);

  const login = useCallback(async () => {
    if (bypassAuth) return;
    if (blockAutoLoginRef.current) return;
    setAuthError(null);
    setIsInitializing(true);
    try {
      const freshRedirect = resolveRedirectUri();
      if (!freshRedirect) {
        throw new Error(
          'Brak redirect_uri. Otwórz aplikację pod adresem hosted (np. …/dpdmonitoring) lub ustaw VITE_UIPATH_REDIRECT_URI.',
        );
      }
      const activeSdk = createUiPathSdk(config);
      setSdk(activeSdk);
      setRedirectUri(freshRedirect);
      await activeSdk.initialize();
      const authed = activeSdk.isAuthenticated();
      setIsAuthenticated(authed);
      setSdkReady(authed);
      if (authed) {
        clearPersistedOAuthUrlError();
        setOauthUrlError(null);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsInitializing(false);
    }
  }, [config, bypassAuth]);

  const dismissOAuthError = useCallback(() => {
    if (bypassAuth) return;
    clearPersistedOAuthUrlError();
    setOauthUrlError(null);
    setAuthError(null);
    blockAutoLoginRef.current = false;
    void login();
  }, [login, bypassAuth]);

  useEffect(() => {
    if (bypassAuth) return;

    let cancelled = false;

    (async () => {
      const urlError = consumeOAuthUrlError();
      if (urlError) {
        blockAutoLoginRef.current = true;
        if (!cancelled) {
          setOauthUrlError(urlError);
          setAuthError(urlError);
          setIsInitializing(false);
        }
        return;
      }

      if (blockAutoLoginRef.current || readPersistedOAuthUrlError()) {
        if (!cancelled) setIsInitializing(false);
        return;
      }

      if (!sdk.isInOAuthCallback()) {
        if (!cancelled) setIsInitializing(true);
        try {
          await sdk.initialize();
          if (!cancelled) {
            refreshAuth();
            const authed = sdk.isAuthenticated();
            setSdkReady(authed);
            if (authed) {
              clearPersistedOAuthUrlError();
              setOauthUrlError(null);
            }
          }
        } catch (e) {
          if (!cancelled) {
            setAuthError(e instanceof Error ? e.message : String(e));
            setSdkReady(false);
          }
        } finally {
          if (!cancelled) setIsInitializing(false);
        }
        return;
      }

      if (!cancelled) setIsInitializing(true);
      try {
        const activeSdk = createUiPathSdk(config);
        if (!cancelled) {
          setSdk(activeSdk);
          setRedirectUri(resolveRedirectUri());
        }
        await activeSdk.completeOAuth();
        if (!cancelled) {
          const authed = activeSdk.isAuthenticated();
          setIsAuthenticated(authed);
          setSdkReady(authed);
          if (authed) {
            clearPersistedOAuthUrlError();
            setOauthUrlError(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setAuthError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sdk, refreshAuth, bypassAuth, config]);

  const value = useMemo(
    () => ({
      sdk,
      isAuthenticated,
      sdkReady,
      isInitializing,
      authError,
      oauthUrlError,
      redirectUri,
      login,
      dismissOAuthError,
    }),
    [
      sdk,
      isAuthenticated,
      sdkReady,
      isInitializing,
      authError,
      oauthUrlError,
      redirectUri,
      login,
      dismissOAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configResult = useMemo(() => readAuthConfig(), []);

  if (BYPASS_AUTH) {
    const config = configResult.ok ? configResult.config : getStubAuthConfig();
    return (
      <AuthProviderInner config={config} bypassAuth>
        {children}
      </AuthProviderInner>
    );
  }

  if (!configResult.ok) {
    return <AuthConfigScreen result={configResult} />;
  }

  return <AuthProviderInner config={configResult.config}>{children}</AuthProviderInner>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
