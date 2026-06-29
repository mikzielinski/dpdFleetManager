#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, '.uipath/deploy-config.staging.json'), 'utf8'));
const appCfg = JSON.parse(fs.readFileSync(path.join(root, '.uipath/app.config.json'), 'utf8'));
const studioSystem = appCfg.systemName;
const auth = Object.fromEntries(
  fs.readFileSync(path.join(os.homedir(), '.uipath', '.auth'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const token = auth.UIPATH_ACCESS_TOKEN;
const base = `https://staging.uipath.com/${cfg.orgId}/apps_/default/api/v1/default/models`;
const headers = {
  Authorization: `Bearer ${token}`,
  'x-uipath-internal-tenantid': cfg.tenantId,
  'x-uipath-folderkey': cfg.folderKey,
};

const versions = await (await fetch(`${base}/${studioSystem}/publish/versions?origin=uip&command=codedapp`, { headers })).json();
console.log('Studio system:', studioSystem, 'versions:', versions.length);
const expected = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/index-([A-Za-z0-9_-]+)\.js/)?.[1];
console.log('Local hash:', expected);
for (const v of versions.slice(0, 8)) {
  console.log(`  deployV${v.deployVersion} ${v.datePublished}`);
}

const live = await (await fetch(cfg.hostedBaseUrl + '/', { cache: 'no-store' })).text();
const liveHash = live.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1];
const cdnVer = live.match(/cdn-base" content="[^"]+\/(\d+)"/)?.[1];
console.log('Live:', `index-${liveHash}.js`, 'cdnV=', cdnVer);
if (liveHash) {
  const js = await (await fetch(`${cfg.hostedBaseUrl}/assets/index-${liveHash}.js`)).text();
  console.log('findRecentInstanceForRecord:', js.includes('findRecentInstanceForRecord'));
}
