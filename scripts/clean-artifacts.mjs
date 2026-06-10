/**
 * Usuwa lokalne artefakty build/deploy (nie commitowane do gita).
 * Usage: node scripts/clean-artifacts.mjs [--keep-latest]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const uipathDir = path.join(root, '.uipath');
const keepLatest = process.argv.includes('--keep-latest');

function rmDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  fs.rmSync(dir, { recursive: true, force: true });
  return 1;
}

function rmFile(file) {
  if (!fs.existsSync(file)) return 0;
  fs.rmSync(file);
  return 1;
}

let removed = 0;

const dist = path.join(root, 'dist');
if (rmDir(dist)) {
  console.log('Removed dist/');
  removed++;
}

for (const pattern of ['cmp-*', 'pkg-*', 'verify', 'nupkg-inspect']) {
  if (!fs.existsSync(uipathDir)) break;
  for (const entry of fs.readdirSync(uipathDir)) {
    if (pattern.endsWith('*') ? entry.startsWith(pattern.slice(0, -1)) : entry === pattern) {
      const p = path.join(uipathDir, entry);
      if (fs.statSync(p).isDirectory() && rmDir(p)) {
        console.log(`Removed .uipath/${entry}/`);
        removed++;
      }
    }
  }
}

const nupkgs = fs.existsSync(uipathDir)
  ? fs
      .readdirSync(uipathDir)
      .filter((f) => f.endsWith('.nupkg'))
      .map((f) => ({ name: f, path: path.join(uipathDir, f), mtime: fs.statSync(path.join(uipathDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
  : [];

if (nupkgs.length > 0) {
  const toDelete = keepLatest && nupkgs.length > 1 ? nupkgs.slice(1) : nupkgs;
  for (const f of toDelete) {
    if (rmFile(f.path)) {
      console.log(`Removed .uipath/${f.name}`);
      removed++;
    }
  }
  if (keepLatest && nupkgs.length > 0) {
    console.log(`Kept .uipath/${nupkgs[0].name}`);
  }
}

for (const zip of fs.existsSync(uipathDir)
  ? fs.readdirSync(uipathDir).filter((f) => f.endsWith('.zip'))
  : []) {
  if (rmFile(path.join(uipathDir, zip))) {
    console.log(`Removed .uipath/${zip}`);
    removed++;
  }
}

console.log(removed ? `Done (${removed} artifact group(s) removed).` : 'Nothing to clean.');
