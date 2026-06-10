/**
 * Migracja DPD_POC: przeniesienie błędnie zapisanej kwoty brutto z Amount → GrossPrice.
 *
 * Problem staging: we wszystkich rekordach Amount wygląda jak brutto (Amount > NetPrice),
 * podczas gdy Amount powinno być ilością, NetPrice netto, GrossPrice/Total brutto.
 *
 * Wymaga: najpierw dodaj pole GrossPrice (Number) w encji DPD_POC w Data Fabric Studio.
 *
 * Dry-run (domyślnie):
 *   node scripts/migrate-poc-prices.mjs
 *
 * Zapis:
 *   node scripts/migrate-poc-prices.mjs --apply
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cfg = JSON.parse(
  fs.readFileSync(path.join(root, '.uipath', 'deploy-config.staging.json'), 'utf8'),
);
const authFile = path.join(os.homedir(), '.uipath', '.auth');
const POC_ENTITY_ID = '4e2e38d9-bf4a-f111-8ef3-000d3a261acd';
const apply = process.argv.includes('--apply');

function parseAuth(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  ).UIPATH_ACCESS_TOKEN;
}

const apiRoot = `https://${cfg.apiHost}/${cfg.orgName}/${cfg.tenantName}/`;

async function api(token, method, path, body) {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, apiRoot);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.pathname} → ${res.status}\n${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function readAll(token) {
  const items = [];
  let start = 0;
  for (let page = 0; page < 30; page++) {
    const data = await api(
      token,
      'GET',
      `/datafabric_/api/EntityService/entity/${POC_ENTITY_ID}/read?start=${start}&limit=100&expansionLevel=0`,
    );
    const batch = data.value ?? [];
    items.push(...batch);
    start += batch.length;
    if (batch.length < 100) break;
  }
  return items;
}

async function main() {
  if (!fs.existsSync(authFile)) {
    console.error('Brak ~/.uipath/.auth — uip login');
    process.exit(1);
  }
  const token = parseAuth(authFile);
  const meta = await api(token, 'GET', `/datafabric_/api/Entity/${POC_ENTITY_ID}`);
  const fieldNames = new Set((meta.fields ?? []).map((f) => f.name));
  if (!fieldNames.has('GrossPrice')) {
    console.error(
      'Brak pola GrossPrice w encji DPD_POC.\n' +
        'Dodaj w Data Fabric: pole Number o nazwie GrossPrice (display: Brutto),\n' +
        'potem uruchom ten skrypt ponownie.',
    );
    process.exit(1);
  }

  const rows = await readAll(token);
  const candidates = rows.filter((r) => {
    const amount = Number(r.Amount);
    const net = Number(r.NetPrice);
    const gross = r.GrossPrice;
    return (
      Number.isFinite(amount) &&
      Number.isFinite(net) &&
      amount > net &&
      (gross === undefined || gross === null || gross === '')
    );
  });

  console.log(`Rekordów do migracji (Amount → GrossPrice, Amount wyczyszczone): ${candidates.length}/${rows.length}`);
  if (candidates.length === 0) {
    console.log('Nic do zrobienia.');
    return;
  }

  for (const row of candidates.slice(0, 5)) {
    console.log(
      `  ${row.CarRegistration}: Amount ${row.Amount} → GrossPrice, NetPrice ${row.NetPrice}, Amount → null`,
    );
  }
  if (candidates.length > 5) console.log(`  … i ${candidates.length - 5} więcej`);

  if (!apply) {
    console.log('\nDry-run. Aby zapisać: node scripts/migrate-poc-prices.mjs --apply');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const row of candidates) {
    const id = row.Id ?? row.id;
    try {
      await api(token, 'PATCH', `/datafabric_/api/EntityService/entity/${POC_ENTITY_ID}/${id}`, {
        GrossPrice: Number(row.Amount),
        Amount: null,
      });
      ok += 1;
    } catch (e) {
      fail += 1;
      console.error(`Błąd ${id}:`, e.message);
    }
  }
  console.log(`\nZaktualizowano: ${ok}, błędy: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
