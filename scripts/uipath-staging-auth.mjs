/**
 * Wspólna logika: sesja CLI musi być na staging (nie cloud.uipath.com).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

export const STAGING_AUTHORITY = 'https://staging.uipath.com/identity_';
export const STAGING_LOGIN_ARGS =
  '--organization mzpocevylrxu --tenant DefaultTenant --authority https://staging.uipath.com/identity_';

export function loadStagingDeployConfig(root = REPO_ROOT) {
  const cfgPath = path.join(root, '.uipath', 'deploy-config.staging.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`Missing ${cfgPath}`);
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

export function authFilePath() {
  return path.join(os.homedir(), '.uipath', '.auth');
}

export function parseAuthFile(file = authFilePath()) {
  const map = Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
  return {
    accessToken: map.UIPATH_ACCESS_TOKEN ?? '',
    refreshToken: map.UIPATH_REFRESH_TOKEN ?? '',
  };
}

export function decodeJwtPayload(token) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid JWT');
  const pad = (4 - (payload.length % 4)) % 4;
  return JSON.parse(Buffer.from(payload + '='.repeat(pad), 'base64').toString('utf8'));
}

export function tokenEnvironmentHint(payload) {
  const iss = String(payload.iss ?? '');
  if (/staging\.uipath\.com/i.test(iss)) return 'staging';
  if (/cloud\.uipath\.com/i.test(iss) && !/staging/i.test(iss)) return 'production';
  return 'unknown';
}

export function printWrongEnvironmentHelp(detected) {
  console.error('');
  console.error(`❌ Sesja UiPath CLI: ${detected === 'production' ? 'PRODUCTION (cloud)' : 'nieznane środowisko'}.`);
  console.error('   Ten projekt wymaga STAGING (staging.uipath.com / staging.api.uipath.com).');
  console.error('');
  console.error('   Przyczyna: `uip login` BEZ --authority otwiera cloud.uipath.com.');
  console.error('');
  console.error('   Naprawa (PowerShell / bash):');
  console.error('     npm run login:staging');
  console.error('');
  console.error('   Lub ręcznie:');
  console.error(`     uip logout`);
  console.error(`     uip login ${STAGING_LOGIN_ARGS}`);
  console.error('');
}

/**
 * Kończy proces z kodem 1, gdy token jest z production cloud.
 * @returns {{ accessToken: string, payload: object }}
 */
export function requireStagingAuth(cfg = loadStagingDeployConfig()) {
  const authFile = authFilePath();
  if (!fs.existsSync(authFile)) {
    console.error(`Brak pliku sesji: ${authFile}`);
    printWrongEnvironmentHelp('missing');
    process.exit(1);
  }

  const { accessToken } = parseAuthFile(authFile);
  if (!accessToken) {
    console.error('Brak UIPATH_ACCESS_TOKEN w ~/.uipath/.auth');
    printWrongEnvironmentHelp('missing');
    process.exit(1);
  }

  let payload;
  try {
    payload = decodeJwtPayload(accessToken);
  } catch (e) {
    console.error('Nie można odczytać JWT:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const env = tokenEnvironmentHint(payload);
  if (env === 'production') {
    console.error('JWT iss:', payload.iss);
    printWrongEnvironmentHelp('production');
    process.exit(1);
  }

  if (env !== 'staging') {
    console.warn('⚠ Nie rozpoznano staging w iss:', payload.iss);
    console.warn(`  Oczekiwany portal: https://${cfg.portalHost}`);
    console.warn('  Jeśli diagnostyka zwraca HTML zamiast JSON → npm run login:staging');
  } else {
    console.log(`✓ Sesja staging (iss: ${payload.iss})`);
  }

  return { accessToken, payload, cfg };
}
