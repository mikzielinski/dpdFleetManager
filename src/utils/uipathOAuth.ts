import { UiPath } from '@uipath/uipath-typescript/core';
import type { UiPathSDKConfig } from '@uipath/uipath-typescript/core';
import { resolveRedirectUri } from './oauthRedirect';

const STAGING_PORTAL_ORG_URL = 'https://staging.uipath.com/mzpocevylrxu';
const STAGING_EXTERNAL_APPS_URL =
  'https://staging.uipath.com/mzpocevylrxu/portal_/admin/external-apps/oauth';

/**
 * UiPath Identity returns 401 "Invalid or missing account" when acr_values pins an org
 * the signed-in user does not belong to. setMultiLogin() skips acr_values so the user can
 * pick the correct staging account / org in the login UI.
 */
export function prepareSdkForOAuth(sdk: UiPath): void {
  sdk.setMultiLogin();
}

/** Create SDK with redirect_uri resolved at call time (sample: VITE_UIPATH_REDIRECT_URI || location). */
export function createUiPathSdk(config: UiPathSDKConfig, options?: { bypassAuth?: boolean }): UiPath {
  const redirectUri = resolveRedirectUri();
  if (!redirectUri) {
    throw new Error('redirect_uri is empty — open the hosted app URL or set VITE_UIPATH_REDIRECT_URI');
  }
  const sdkConfig = {
    baseUrl: config.baseUrl,
    orgName: config.orgName,
    tenantName: config.tenantName,
    clientId: config.clientId ?? '',
    scope: config.scope ?? '',
    redirectUri,
  } satisfies UiPathSDKConfig;
  const sdk = new UiPath(sdkConfig);
  if (!options?.bypassAuth) {
    prepareSdkForOAuth(sdk);
    logOAuthConfig(sdkConfig, redirectUri);
  }
  return sdk;
}

export function getStagingPortalOrgUrl(): string {
  return STAGING_PORTAL_ORG_URL;
}

export function getStagingExternalAppsUrl(): string {
  return STAGING_EXTERNAL_APPS_URL;
}

/** Log OAuth-related SDK config in dev (no secrets). */
export function logOAuthConfig(config: UiPathSDKConfig, redirectUri: string): void {
  if (!import.meta.env.DEV) return;
  const orgName = config.orgName ?? '';
  const isGuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgName);
  const acrPreview = isGuid ? `tenant:${orgName}` : `tenantName:${orgName}`;
  console.info('[OAuth] SDK config', {
    baseUrl: config.baseUrl,
    orgName: config.orgName,
    tenantName: config.tenantName,
    clientId: config.clientId,
    redirectUri,
    scope: config.scope,
    multiLogin: true,
    acrValuesSkipped: true,
    acrValuesIfNotSkipped: acrPreview,
    authorizePath: `${config.baseUrl}/${config.orgName}/identity_/connect/authorize`,
  });
}
