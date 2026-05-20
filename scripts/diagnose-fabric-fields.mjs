/**
 * Pola daty i przebiegu w DPD_POC / DPD_B2B_Vehicles (Data Fabric).
 * Uruchom po: uip login --organization mzpocevylrxu --tenant DefaultTenant
 *
 * node scripts/diagnose-fabric-fields.mjs
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

const ENTITY_NAMES = {
  vehicles: ['DPDB2BVehicles', 'DPD_B2B_Vehicles'],
  poc: ['DPDPOC', 'DPD_POC'],
};

function parseAuth(file) {
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
  return map.UIPATH_ACCESS_TOKEN;
}

const apiRoot = `https://${cfg.apiHost}/${cfg.orgName}/${cfg.tenantName}/`;

async function apiGet(token, pathSeg, params = {}) {
  const normalized = pathSeg.startsWith('/') ? pathSeg.slice(1) : pathSeg;
  const url = new URL(normalized, apiRoot);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url.pathname} HTTP ${res.status}\n${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function normalizeKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_]/g, '');
}

function resolveEntity(entities, names) {
  const wanted = new Set(names.map(normalizeKey));
  return entities.find(
    (e) => wanted.has(normalizeKey(e.name)) || wanted.has(normalizeKey(e.displayName)),
  );
}

async function readSample(token, entityId, limit = 50) {
  const data = await apiGet(token, `/datafabric_/api/EntityService/entity/${entityId}/read`, {
    start: 0,
    limit,
    expansionLevel: 0,
  });
  return data.value ?? data.items ?? [];
}

function fieldFillStats(records, fieldNames) {
  const stats = {};
  for (const fn of fieldNames) stats[fn] = 0;
  for (const row of records) {
    for (const fn of fieldNames) {
      const v = row[fn];
      if (v !== undefined && v !== null && v !== '') stats[fn] = (stats[fn] ?? 0) + 1;
    }
  }
  return stats;
}

function listSchemaFields(meta, pattern) {
  return (meta.fields ?? [])
    .filter((f) => pattern.test(`${f.name} ${f.displayName ?? ''}`))
    .map((f) => `${f.name} (${f.displayName ?? f.fieldDisplayType})`);
}

async function main() {
  if (!fs.existsSync(authFile)) {
    console.error(`Brak ${authFile} — uip login (staging).`);
    process.exit(1);
  }
  const token = parseAuth(authFile);
  const all = await apiGet(token, '/datafabric_/api/Entity');
  const vehiclesMeta = resolveEntity(all, ENTITY_NAMES.vehicles);
  const pocMeta =
    resolveEntity(all, ENTITY_NAMES.poc) ??
    (await apiGet(token, `/datafabric_/api/Entity/${POC_ENTITY_ID}`).then((m) => ({
      ...m,
      id: POC_ENTITY_ID,
    })));

  const DATE_RE = /date|data|czas|time|service/i;
  const MILEAGE_RE = /mileage|odometer|przebieg|kilometer|licznik/i;

  if (pocMeta?.id) {
    const pocFull = await apiGet(token, `/datafabric_/api/Entity/${pocMeta.id}`);
    const pocRows = await readSample(token, pocMeta.id, 60);
    console.log('\n=== DPD_POC — pola daty w schemacie ===');
    console.log(listSchemaFields(pocFull, DATE_RE).join('\n') || '(brak)');
    console.log('\n=== DPD_POC — pola przebiegu w schemacie ===');
    console.log(listSchemaFields(pocFull, MILEAGE_RE).join('\n') || '(brak)');
    const dateFields = [
      'Date',
      'ServiceDate',
      'CreateTime',
      'Mileage',
      'Przebieg',
      'Odometer',
      'CarRegistration',
    ];
    console.log('\n=== DPD_POC — wypełnienie pól (próbka) ===');
    console.log(fieldFillStats(pocRows, dateFields));
    const withDate = pocRows.filter((r) => r.Date || r.ServiceDate || r.CreateTime).length;
    console.log(`Rekordy z jakąkolwiek datą: ${withDate}/${pocRows.length}`);
    const withMileage = pocRows.filter((r) => r.Mileage || r.Przebieg || r.Odometer).length;
    console.log(`Rekordy z przebiegiem: ${withMileage}/${pocRows.length}`);
  }

  if (vehiclesMeta?.id) {
    const vehFull = await apiGet(token, `/datafabric_/api/Entity/${vehiclesMeta.id}`);
    const vehRows = await readSample(token, vehiclesMeta.id, 40);
    console.log('\n=== DPD_B2B_Vehicles — compliance / przebieg ===');
    console.log(listSchemaFields(vehFull, MILEAGE_RE).join('\n') || '(brak)');
    console.log(
      listSchemaFields(vehFull, /inspection|mot|badanie|insurance|polisa|oc\b|ac\b/i).join('\n') ||
        '(brak pól compliance)',
    );
    console.log('\n=== B2B — wypełnienie (próbka) ===');
    console.log(
      fieldFillStats(vehRows, [
        'Mileage',
        'Przebieg',
        'CarRegistration',
        'TechnicalInspectionValidUntil',
      ]),
    );
  }

  console.log('\n--- Co uzupełnić w Data Fabric ---');
  console.log(
    '1. DPD_POC: pole daty usługi (Date/ServiceDate) na każdym rozliczeniu — okres filtra.',
  );
  console.log(
    '2. DPD_POC: Mileage/Przebieg przy raporcie kierowcy (co miesiąc) — PLN/km i przebieg w okresie.',
  );
  console.log(
    '3. DPD_B2B_Vehicles: bieżący licznik + daty polis / badania — panel Compliance.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
