#!/usr/bin/env node
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(path.join(root, '.uipath/deploy-config.staging.json'), 'utf8'));

function getAuth() {
  const isWin = process.platform === 'win32';
  const result = spawnSync(isWin ? 'uip.cmd' : 'uip', ['login', 'refresh', '--output', 'json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });
  if (result.status !== 0) throw new Error('uip login refresh failed');
  const data = JSON.parse(result.stdout);
  const token = data?.Data?.AccessToken ?? data?.AccessToken;
  const orgId = data?.Data?.OrganizationId ?? data?.OrganizationId ?? cfg.orgId;
  const tenantId = data?.Data?.TenantId ?? data?.TenantId ?? cfg.tenantId;
  if (!token) throw new Error('No access token');
  return { token, orgId, tenantId };
}

function appsHeaders(auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    'x-uipath-internal-tenantid': auth.tenantId,
    'x-uipath-folderkey': cfg.folderKey,
  };
}

async function main() {
  const auth = getAuth();
  const base = `https://${cfg.portalHost}/${auth.orgId}`;
  const q = 'origin=uip&command=codedapp';
  const packageName = cfg.packageId;

  const pubRes = await fetch(
    `${base}/apps_/default/api/v1/default/models/tenants/${auth.tenantId}/publish/apps?searchText=${encodeURIComponent(packageName)}&folderFeedType=tenant&${q}`,
    { headers: appsHeaders(auth) },
  );
  if (!pubRes.ok) throw new Error(`Publish lookup HTTP ${pubRes.status}`);
  const published = (await pubRes.json()).value?.find((a) => a.title === packageName);
  if (!published?.systemName || !published?.deployVersion) {
    throw new Error('Published app not indexed yet');
  }

  const depRes = await fetch(
    `${base}/apps_/default/api/v1/default/models/deployed/apps?${q}`,
    { headers: appsHeaders(auth) },
  );
  const deployedApps = depRes.ok ? ((await depRes.json()).value ?? []) : [];
  const existing = deployedApps.find((a) => a.routingName === cfg.routingName);

  if (!existing) {
    const deployRes = await fetch(
      `${base}/apps_/default/api/v1/default/models/${published.systemName}/publish/versions/${published.deployVersion}/deploy?${q}`,
      {
        method: 'POST',
        headers: appsHeaders(auth),
        body: JSON.stringify({ title: packageName, routingName: cfg.routingName }),
      },
    );
    if (!deployRes.ok) throw new Error(`Deploy HTTP ${deployRes.status}: ${await deployRes.text()}`);
    console.log(`Deploy v${published.deployVersion} -> /${cfg.routingName}/`);
    return;
  }

  const upgradeRes = await fetch(
    `${base}/apps_/default/api/v1/default/models/deployed/apps/${existing.id}?${q}`,
    {
      method: 'PATCH',
      headers: appsHeaders(auth),
      body: JSON.stringify({
        title: packageName,
        description: null,
        version: published.deployVersion,
      }),
    },
  );
  if (!upgradeRes.ok) throw new Error(`Upgrade HTTP ${upgradeRes.status}: ${await upgradeRes.text()}`);
  console.log(`Upgrade deploy v${published.deployVersion} -> /${cfg.routingName}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
