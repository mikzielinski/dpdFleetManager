/**
 * Logowanie UiPath CLI na STAGING (nie production cloud).
 * Usage: npm run login:staging
 */
import { execSync } from 'child_process';
import { STAGING_AUTHORITY, STAGING_LOGIN_ARGS } from './uipath-staging-auth.mjs';

console.log('==> UiPath login — STAGING only');
console.log(`    Authority: ${STAGING_AUTHORITY}`);
console.log('    (bez --authority CLI otwiera https://cloud.uipath.com)\n');

try {
  execSync('uip logout', { stdio: 'inherit' });
} catch {
  /* already logged out */
}

execSync(`uip login ${STAGING_LOGIN_ARGS}`, { stdio: 'inherit', shell: true });

console.log('\n==> Gotowe. Sprawdź sesję:');
console.log('    npm run diagnose:fabric');
