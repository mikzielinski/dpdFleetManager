/**
 * Staging deploy (Node) — mirrors .uipath/deploy-dpdmonitoring.ps1
 * Requires: uip login --authority https://staging.uipath.com/identity_ ...
 * Usage: node scripts/deploy-staging.mjs [semver]  (default 1.1.2)
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  authFilePath,
  loadStagingDeployConfig,
  parseAuthFile,
  requireStagingAuth,
  STAGING_LOGIN_ARGS,
} from './uipath-staging-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const version = process.argv[2] || '1.1.3';
const envName = process.argv.includes('--production') ? 'production' : 'staging';

const cfgPath = path.join(root, '.uipath', `deploy-config.${envName}.json`);
if (!fs.existsSync(cfgPath)) {
  console.error(`Missing ${cfgPath}`);
  process.exit(1);
}
const cfg =
  envName === 'staging' ? loadStagingDeployConfig(root) : JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

if (envName === 'staging') {
  requireStagingAuth(cfg);
}

const authFile = authFilePath();
if (!fs.existsSync(authFile)) {
  console.error(`Brak sesji UiPath: ${authFile}`);
  console.error(`Zaloguj się: npm run login:staging`);
  console.error(`Lub: uip login ${STAGING_LOGIN_ARGS}`);
  process.exit(1);
}

function parseAuth(file) {
  return parseAuthFile(file);
}

function jwtExp(token) {
  const payload = token.split('.')[1];
  const pad = (4 - (payload.length % 4)) % 4;
  const json = Buffer.from(payload + '='.repeat(pad), 'base64').toString('utf8');
  return JSON.parse(json).exp;
}

async function refreshTokenIfNeeded(tokens) {
  const exp = jwtExp(tokens.accessToken);
  if (Date.now() / 1000 < exp - 60) {
    console.log(`Token valid until ${new Date(exp * 1000).toLocaleString()}`);
    return tokens.accessToken;
  }
  console.log('Token expired, refreshing…');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: cfg.identityClientId,
  });
  const res = await fetch(`https://${cfg.portalHost}/identity_/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let lines = fs.readFileSync(authFile, 'utf8').split(/\r?\n/);
  lines = lines.map((l) =>
    l.startsWith('UIPATH_ACCESS_TOKEN=')
      ? `UIPATH_ACCESS_TOKEN=${data.access_token}`
      : l.startsWith('UIPATH_REFRESH_TOKEN=') && data.refresh_token
        ? `UIPATH_REFRESH_TOKEN=${data.refresh_token}`
        : l,
  );
  fs.writeFileSync(authFile, lines.join('\n'));
  console.log(`Token refreshed (${data.expires_in}s)`);
  return data.access_token;
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'x-uipath-internal-tenantid': cfg.tenantId,
    'x-uipath-folderkey': cfg.folderKey,
    'Content-Type': 'application/json',
  };
}

async function main() {
  console.log(`==> Environment: ${cfg.environment}`);
  if (!fs.existsSync(path.join(root, '.env'))) {
    fs.copyFileSync(path.join(root, '.env.example'), path.join(root, '.env'));
    console.log('Created .env from .env.example');
  }

  console.log('==> Build');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });

  console.log(`==> Repack nupkg (${version})`);
  execSync(`node scripts/repack-nupkg.mjs ${version}`, { cwd: root, stdio: 'inherit' });

  const pkgId = cfg.packageId;
  const nupkg = path.join(root, '.uipath', `${pkgId}.${version}.nupkg`);
  if (!fs.existsSync(nupkg)) throw new Error(`Missing ${nupkg}`);

  const token = await refreshTokenIfNeeded(parseAuth(authFile));
  const portalBase = `https://${cfg.portalHost}`;
  const appsBase = `${portalBase}/${cfg.orgId}/apps_/default/api/v1/default/models`;

  console.log('==> Upload to Orchestrator');
  const uploadUrl = `${portalBase}/${cfg.orgId}/${cfg.tenantId}/orchestrator_/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage()?origin=uip&command=codedapp`;
  const form = new FormData();
  form.append(
    'uploads[]',
    new Blob([fs.readFileSync(nupkg)], { type: 'application/octet-stream' }),
    `${pkgId}.${version}.nupkg`,
  );
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let uploadSkipped = false;
  if (!up.ok) {
    const t = await up.text();
    if (!/already exists/i.test(t)) throw new Error(`Upload failed: ${up.status} ${t}`);
    uploadSkipped = true;
    console.warn(
      'Package already in feed — feed may still hold the previous build. Use a new semver (e.g. 1.1.1) when dist/ changed.',
    );
  } else {
    console.log('Upload OK');
  }

  const searchUrl = `${appsBase}/tenants/${cfg.tenantId}/publish/apps?searchText=${encodeURIComponent(pkgId)}&folderFeedType=tenant&origin=uip&command=codedapp`;

  async function loadPublishFeed() {
    return (await (await fetch(searchUrl, { headers: apiHeaders(token) })).json()).value || [];
  }

  function findPublishedBySemver(items, semVersion) {
    return items.find(
      (a) =>
        a.title === pkgId &&
        (a.semVersion === semVersion || a.packageVersion === semVersion || a.version === semVersion),
    );
  }

  console.log('==> Publish coded app');
  let deployVersion;
  const pub = await fetch(`${appsBase}/apps/codedapp/publish?origin=uip&command=codedapp`, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify({
      tenantName: cfg.tenantName,
      packageName: pkgId,
      packageVersion: version,
      title: pkgId,
      schema: {},
    }),
  });
  if (pub.ok) {
    const pubJson = await pub.json();
    deployVersion = pubJson.deployVersion;
    console.log(`Published deployVersion=${deployVersion}`);
  } else {
    const errText = await pub.text();
    if (pub.status === 400 && /already exists/i.test(errText)) {
      if (uploadSkipped) {
        throw new Error(
          `Publish skipped: version ${version} already published and package was not re-uploaded. Deploy a new semver, e.g.: node scripts/deploy-staging.mjs 1.1.1`,
        );
      }
      const existing = findPublishedBySemver(await loadPublishFeed(), version);
      if (!existing?.deployVersion) {
        throw new Error(`Publish failed (already exists) but could not find ${version} in feed: ${errText}`);
      }
      deployVersion = existing.deployVersion;
      console.warn(
        `Version ${version} already published — reusing deployVersion=${deployVersion} for upgrade only.`,
      );
    } else {
      throw new Error(`Publish failed: ${pub.status} ${errText}`);
    }
  }

  console.log(`==> Deploy / upgrade (${cfg.routingName})`);
  const feed = await loadPublishFeed();
  const published = (feed || []).find(
    (a) => a.title === pkgId && a.deployVersion === deployVersion,
  );
  if (!published?.systemName) throw new Error('Published app not found in feed');

  const listUrl = `${appsBase}/deployed/apps?origin=uip&command=codedapp`;
  let deployed = ((await (await fetch(listUrl, { headers: apiHeaders(token) })).json()).value || []).find(
    (a) => a.routingName === cfg.routingName,
  );

  let upgradeOk = false;
  if (deployed) {
    const patch = await fetch(`${appsBase}/deployed/apps/${deployed.id}?origin=uip&command=codedapp`, {
      method: 'PATCH',
      headers: apiHeaders(token),
      body: JSON.stringify({ title: pkgId, version: deployVersion }),
    });
    if (patch.ok) {
      await new Promise((r) => setTimeout(r, 5000));
      deployed = ((await (await fetch(listUrl, { headers: apiHeaders(token) })).json()).value || []).find(
        (a) => a.routingName === cfg.routingName,
      );
      if (deployed?.deployVersion === deployVersion) {
        upgradeOk = true;
        console.log(`Upgrade OK ${deployed.semVersion} deployVersion=${deployed.deployVersion}`);
      }
    } else {
      console.warn('PATCH upgrade failed:', await patch.text());
    }
  }

  if (!upgradeOk) {
    if (deployed) {
      console.log('Redeploy: remove old app…');
      await fetch(`${appsBase}/deployed/apps/${deployed.id}?origin=uip&command=codedapp`, {
        method: 'DELETE',
        headers: apiHeaders(token),
      });
      await new Promise((r) => setTimeout(r, 2000));
    }
    const dep = await fetch(
      `${appsBase}/${published.systemName}/publish/versions/${deployVersion}/deploy?origin=uip&command=codedapp`,
      {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({ title: pkgId, routingName: cfg.routingName }),
      },
    );
    if (!dep.ok) throw new Error(`Deploy failed: ${dep.status} ${await dep.text()}`);
    await new Promise((r) => setTimeout(r, 5000));
    deployed = ((await (await fetch(listUrl, { headers: apiHeaders(token) })).json()).value || []).find(
      (a) => a.routingName === cfg.routingName,
    );
    if (deployed?.deployVersion === deployVersion) {
      upgradeOk = true;
      console.log(`Fresh deploy OK ${deployed.semVersion} deployVersion=${deployed.deployVersion}`);
    }
  }

  if (!upgradeOk) {
    console.error('Deploy failed — re-run script. Do NOT use Orchestrator Upgrade button.');
    process.exit(1);
  }

  console.log('==> Verify hosted bundle');
  const verifyUrl = cfg.hostedBaseUrl.endsWith('/') ? cfg.hostedBaseUrl : `${cfg.hostedBaseUrl}/`;
  const html = await (await fetch(verifyUrl)).text();
  const indexHtml = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  const expected = indexHtml.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1];
  const live = html.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1];
  const cdn = html.match(/uipath:cdn-base" content="[^"]+\/(\d+)"/)?.[1];
  if (live === expected && cdn === String(deployVersion)) {
    console.log(`Live bundle OK: index-${live}.js CDN deployVersion=${cdn}`);
  } else {
    console.warn(
      `Still serving index-${live}.js (expected index-${expected}.js, CDN=${cdn} want ${deployVersion}) — Ctrl+Shift+R`,
    );
  }

  console.log('\nDone. App URL:', cfg.hostedBaseUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
