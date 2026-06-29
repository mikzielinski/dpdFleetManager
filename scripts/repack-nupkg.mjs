import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, '.uipath/deploy-config.staging.json'), 'utf8'));
const pkgId = cfg.packageId || 'DPDCarInvestigator.AppV2.DPDAppMonitor';
const ver = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const distDir = path.join(root, 'dist');
const outDir = path.join(root, '.uipath');
const templateDir = path.join(outDir, 'nupkg-inspect', 'content');
const STUDIO_PROJECT_ID = process.env.STUDIO_PROJECT_ID || cfg.studioProjectId || '28ac09c2-3a5c-4ba8-a78c-80883f38e6b5';
const OAUTH_CLIENT_ID = cfg.oauthClientId || '98aa3ef7-06e0-431b-9997-1963d708bd45';
const hostedBase = (cfg.hostedBaseUrl || 'https://mzpocevylrxu.staging.uipath.host/dpdmonitoring').replace(/\/?$/, '');
const DEFAULT_SCOPE = JSON.parse(
  fs.readFileSync(path.join(root, 'uipath.json'), 'utf8'),
).scope;

const nuspec = `<?xml version="1.0"?>
<package>
  <metadata>
    <id>${pkgId}</id>
    <version>${ver}</version>
    <title>${pkgId}</title>
    <authors>UiPath Developer</authors>
    <owners>UiPath</owners>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>DPD Fleet Manager</description>
    <projectUrl>https://github.com/UiPath/uipath-typescript</projectUrl>
    <tags>uipath automation webapp</tags>
  </metadata>
  <files>
    <file src="content/**/*" target="content/" />
  </files>
</package>`;

async function addDir(zip, dir, prefix) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const target = prefix ? `${prefix}/${entry}` : entry;
    if (fs.statSync(full).isDirectory()) {
      await addDir(zip, full, target);
    } else {
      zip.file(target, fs.readFileSync(full));
    }
  }
}

for (const f of ['bindings.json', 'bindings_v2.json', 'entry-points.json', 'package-descriptor.json']) {
  const src = path.join(templateDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, f));
  }
}

const operate = {
  $schema: 'https://cloud.uipath.com/draft/2024-12/operate',
  projectId: STUDIO_PROJECT_ID,
  main: 'index.html',
  contentType: 'webapp',
  targetFramework: 'Portable',
  targetRuntime: 'Coded',
  runtimeOptions: { requiresUserInteraction: false, isAttended: false },
  designOptions: { projectProfile: 'Development', outputType: 'webapp' },
};
fs.writeFileSync(path.join(distDir, 'operate.json'), JSON.stringify(operate, null, 2));

fs.writeFileSync(
  path.join(distDir, 'uipath.json'),
  JSON.stringify(
    {
      packageName: pkgId,
      scope: process.env.VITE_UIPATH_SCOPE || DEFAULT_SCOPE,
      clientId: OAUTH_CLIENT_ID,
      orgName: cfg.orgName || 'mzpocevylrxu',
      tenantName: cfg.tenantName || 'DefaultTenant',
      baseUrl: `https://${cfg.apiHost || 'staging.api.uipath.com'}`,
      redirectUri: hostedBase,
    },
    null,
    2,
  ),
);

const zip = new JSZip();
zip.file(`${pkgId}.nuspec`, nuspec);
await addDir(zip, distDir, 'content');
const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
const out = path.join(outDir, `${pkgId}.${ver}.nupkg`);
fs.writeFileSync(out, buf);
console.log(`Wrote ${out} (${buf.length} bytes)`);
