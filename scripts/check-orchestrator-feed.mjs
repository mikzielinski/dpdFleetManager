#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, '.uipath/deploy-config.staging.json'), 'utf8'));
const pkg = cfg.packageId || 'DPDCarInvestigator.AppV2.DPDAppMonitor';
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
const orgId = cfg.orgId;
const tenantId = cfg.tenantId;
const filter = `$filter=Id eq '${pkg}'&$select=Id,Version,Key,Published&$orderby=Published desc&$top=15`;
const url = `https://staging.uipath.com/${orgId}/${tenantId}/orchestrator_/odata/Processes?${filter}`;
const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const j = await r.json();
console.log(`Package ${pkg}: HTTP ${r.status}, matches: ${j.value?.length ?? 0}`);
for (const p of j.value ?? []) {
  if (p.Id === pkg) console.log(`  ${p.Version}  ${p.Published}`);
}
