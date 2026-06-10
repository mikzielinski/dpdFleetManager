/**
 * Diagnostyka pól DPD_POC i powiązanych encji Data Fabric (bez System Users).
 *
 * Wymaga: uip login --organization mzpocevylrxu --tenant DefaultTenant \
 *   --authority https://staging.uipath.com/identity_
 *
 * Uruchom:
 *   node scripts/diagnose-poc-fields.mjs
 *   node scripts/diagnose-poc-fields.mjs 4e72ce52-2113-4e16-89bd-019e06f75877
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

const ENTITY_IDS = {
  poc: '4e2e38d9-bf4a-f111-8ef3-000d3a261acd',
  vehicleFlags: '8d83c3fe-c34a-f111-8ef3-000d3a261acd',
};

const ENTITY_LOOKUP = {
  vehicles: ['DPDB2BVehicles', 'DPD_B2B_Vehicles'],
  areas: ['DPDAreasWroclaw', 'DPD_Areas_Wroclaw'],
  companies: ['DPDB2BCourierCompanies', 'DPD_B2B_Courier_Companies'],
  poc: ['DPDPOC', 'DPD_POC'],
  vehicleFlags: ['DPDVehicleFlags', 'DPD_VehicleFlags'],
};

/** Pola oczekiwane w panelu „Szczegóły zgłoszenia” */
const DETAIL_FIELD_CANDIDATES = {
  totalPrice: ['TotalPrice', 'GrossPrice', 'GrossAmount', 'Brutto', 'TotalAmount', 'Amount'],
  date: ['Date', 'ServiceDate', 'InvoiceDate', 'DocumentDate', 'TransactionDate', 'CostDate'],
  invoiceFileName: ['InvoiceFileName', 'invoiceFileName', 'Invoice File', 'InvoiceFile'],
  comments: ['Comments', 'ManagerComment', 'Comment', 'Note'],
  riskLevel: ['RiskLevel', 'Risk Level', 'riskLevel'],
  combinedScore: ['CombinedScore', 'Combined Score', 'AI Confidence Score', 'AIConfidenceScore'],
  flagType: ['FlagType', 'Flag Type', 'AnomalyType', 'Anomaly Type'],
  fleetManagerNote: ['FleetManagerNote', 'Fleet Manager Note', 'ManagerNote', 'Manager Note'],
};

const INVOICE_FILE_FIELDS = [
  'Invoice',
  'InvoiceRecipt',
  'InvoiceReceipt',
  'Invoice File',
  'InvoiceFile',
  'Attachment',
];

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

function normalizeKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_]/g, '');
}

function entityNameMatches(refName, candidates) {
  if (!refName) return false;
  const ref = normalizeKey(refName);
  return candidates.some((c) => normalizeKey(c) === ref);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

const apiRoot = `https://${cfg.apiHost}/${cfg.orgName}/${cfg.tenantName}/`;

async function apiGet(token, path, params = {}) {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalized, apiRoot);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: headers(token) });
  const text = await res.text();
  const ctype = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    throw new Error(`${url.pathname} → HTTP ${res.status}\n${text.slice(0, 400)}`);
  }
  if (!ctype.includes('json')) {
    throw new Error(`${url.pathname} → oczekiwano JSON\n${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function listEntities(token) {
  const data = await apiGet(token, '/datafabric_/api/Entity');
  return Array.isArray(data) ? data : data.value ?? data.items ?? [];
}

async function getEntityMeta(token, entityId) {
  return apiGet(token, `/datafabric_/api/Entity/${entityId}`);
}

async function readAllRecords(token, entityId, expansionLevel) {
  const items = [];
  let start = 0;
  const limit = 100;
  for (let page = 0; page < 30; page++) {
    const data = await apiGet(token, `/datafabric_/api/EntityService/entity/${entityId}/read`, {
      start,
      limit,
      expansionLevel,
    });
    const batch = data.value ?? data.items ?? (Array.isArray(data) ? data : []);
    items.push(...batch);
    const total = data.totalRecordCount ?? data.totalCount;
    start += batch.length;
    if (batch.length < limit) break;
    if (total != null && start >= total) break;
  }
  return items;
}

function resolveEntity(entities, names) {
  const wanted = new Set(names.map(normalizeKey));
  return entities.find(
    (e) => wanted.has(normalizeKey(e.name)) || wanted.has(normalizeKey(e.displayName)),
  );
}

function isEmpty(v) {
  if (v === undefined || v === null || v === '') return true;
  if (typeof v === 'string' && !v.trim()) return true;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v;
    const label = o.displayName ?? o.DisplayName ?? o.name ?? o.Name;
    if (label != null && String(label).trim()) return false;
    const id = o.Id ?? o.id;
    if (id != null && String(id).trim()) return false;
    return true;
  }
  return false;
}

function pickFirst(row, names) {
  for (const n of names) {
    if (!isEmpty(row[n])) return { field: n, value: row[n] };
  }
  return null;
}

function summarizeFieldPopulation(records, fieldNames) {
  const stats = {};
  for (const name of fieldNames) {
    let filled = 0;
    for (const row of records) {
      if (!isEmpty(row[name])) filled += 1;
    }
    stats[name] = { filled, total: records.length };
  }
  return stats;
}

function printSchema(entityMeta) {
  console.log(`\n=== Schemat: ${entityMeta.displayName ?? entityMeta.name} (${entityMeta.id}) ===`);
  for (const f of entityMeta.fields ?? []) {
    const extra =
      f.fieldDisplayType === 'Relationship'
        ? ` → ${f.referenceEntityName ?? '?'}`
        : f.fieldDisplayType === 'File'
          ? ' [File]'
          : f.referenceChoiceSet?.id
            ? ' [ChoiceSet]'
            : '';
    console.log(`  ${f.name}${extra}`);
  }
}

function printDetailCoverage(label, records, specificId) {
  console.log(`\n--- ${label} (${records.length} rekordów) ---`);
  const allFieldNames = new Set();
  for (const row of records) {
    for (const k of Object.keys(row)) {
      if (!['Id', 'id', 'CreateTime', 'UpdateTime', 'CreatedBy', 'UpdatedBy'].includes(k)) {
        allFieldNames.add(k);
      }
    }
  }

  console.log('\nPola z danymi (≥1 rekord):');
  const populated = [];
  for (const name of [...allFieldNames].sort()) {
    const { filled, total } = summarizeFieldPopulation(records, [name])[name];
    if (filled > 0) populated.push({ name, filled, total });
  }
  for (const { name, filled, total } of populated) {
    console.log(`  ${name}: ${filled}/${total}`);
  }

  console.log('\nPola puste we WSZYSTKICH rekordach:');
  const alwaysEmpty = [...allFieldNames].filter((name) => {
    const { filled } = summarizeFieldPopulation(records, [name])[name];
    return filled === 0;
  });
  if (alwaysEmpty.length === 0) console.log('  (brak — każde pole ma przynajmniej jedną wartość)');
  else alwaysEmpty.forEach((n) => console.log(`  ${n}`));

  console.log('\nMapowanie pól panelu „Szczegóły zgłoszenia”:');
  for (const [uiKey, candidates] of Object.entries(DETAIL_FIELD_CANDIDATES)) {
    const schemaHits = candidates.filter((c) => allFieldNames.has(c));
    const dataHits = candidates.filter((c) => {
      const s = summarizeFieldPopulation(records, [c])[c];
      return s && s.filled > 0;
    });
    const status =
      dataHits.length > 0
        ? `OK — dane w: ${dataHits.join(', ')}`
        : schemaHits.length > 0
          ? `PUSTE — pole istnieje (${schemaHits.join(', ')}), brak wartości`
          : 'BRAK POLA w encji — UI nie znajdzie źródła';
    console.log(`  ${uiKey}: ${status}`);
  }

  const fileFields = INVOICE_FILE_FIELDS.filter((f) => {
    const s = summarizeFieldPopulation(records, [f])[f];
    return s && s.filled > 0;
  });
  console.log(
    `\nZałączniki faktury (File): ${fileFields.length ? fileFields.join(', ') : 'brak w danych'}`,
  );

  if (specificId) {
    const row = records.find((r) => String(r.Id ?? r.id).toLowerCase() === specificId.toLowerCase());
    if (!row) {
      console.log(`\nRekord ${specificId}: NIE ZNALEZIONY`);
      return;
    }
    console.log(`\n--- Rekord ${specificId} ---`);
    for (const [k, v] of Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) {
      if (['CreateTime', 'UpdateTime', 'CreatedBy', 'UpdatedBy'].includes(k)) continue;
      const display = isEmpty(v)
        ? '—'
        : typeof v === 'object'
          ? JSON.stringify(v).slice(0, 120)
          : String(v).slice(0, 120);
      console.log(`  ${k}: ${display}`);
    }
    console.log('\n  Panel szczegółów (kandydaci):');
    for (const [uiKey, candidates] of Object.entries(DETAIL_FIELD_CANDIDATES)) {
      const hit = pickFirst(row, candidates);
      console.log(`    ${uiKey}: ${hit ? `${hit.field} = ${JSON.stringify(hit.value).slice(0, 80)}` : '—'}`);
    }
    const inv = pickFirst(row, INVOICE_FILE_FIELDS);
    if (inv) {
      const name = inv.value?.name ?? inv.value?.Name ?? '(brak name w metadanych)';
      console.log(`    invoiceFileName (z File): ${inv.field}.name = ${name}`);
    }
  }
}

async function main() {
  const specificId = process.argv[2]?.trim();

  if (!fs.existsSync(authFile)) {
    console.error(`Brak ${authFile} — zaloguj się przez uip login (staging).`);
    process.exit(1);
  }
  const token = parseAuth(authFile);
  if (!token) {
    console.error('Brak UIPATH_ACCESS_TOKEN w .auth');
    process.exit(1);
  }

  console.log(`API: ${apiRoot}datafabric_/api/Entity`);
  if (specificId) console.log(`Fokus na rekord: ${specificId}`);

  const allEntities = await listEntities(token);
  const customEntities = allEntities.filter(
    (e) => !entityNameMatches(e.name, ['SystemUser', 'System Users']),
  );

  console.log('\n=== Encje Data Fabric (bez System Users) ===');
  for (const e of customEntities) {
    console.log(
      `  ${e.displayName ?? e.name} (${e.name}) — ${e.recordCount ?? '?'} rekordów, ${e.fieldCount ?? '?'} pól`,
    );
  }

  const pocMeta = await getEntityMeta(token, ENTITY_IDS.poc);
  printSchema(pocMeta);

  const flagsMeta = await getEntityMeta(token, ENTITY_IDS.vehicleFlags);
  printSchema(flagsMeta);

  console.log('\nPobieram rekordy DPD_POC (expansionLevel=2)…');
  const pocRows = await readAllRecords(token, ENTITY_IDS.poc, 2);
  printDetailCoverage('DPD_POC', pocRows, specificId);

  console.log('\nPobieram rekordy DPD_VehicleFlags (expansionLevel=1)…');
  const flagRows = await readAllRecords(token, ENTITY_IDS.vehicleFlags, 1);

  if (specificId) {
    const linked = flagRows.filter((r) => {
      const rel =
        r['Related Cost Record ID'] ??
        r.RelatedCostRecordId ??
        r.relatedCostRecordId;
      return rel && String(rel).toLowerCase() === specificId.toLowerCase();
    });
    console.log(`\n--- DPD_VehicleFlags powiązane z ${specificId}: ${linked.length} ---`);
    for (const row of linked) {
      console.log(`  Id: ${row.Id ?? row.id}`);
      for (const [k, v] of Object.entries(row)) {
        if (!isEmpty(v)) console.log(`    ${k}: ${JSON.stringify(v).slice(0, 100)}`);
      }
    }
  }

  const flagFieldStats = summarizeFieldPopulation(
    flagRows,
    (flagsMeta.fields ?? []).map((f) => f.name).filter(Boolean),
  );
  console.log('\n--- DPD_VehicleFlags — pokrycie pól ---');
  for (const [name, { filled, total }] of Object.entries(flagFieldStats)) {
    if (filled > 0) console.log(`  ${name}: ${filled}/${total}`);
  }

  for (const [key, names] of Object.entries(ENTITY_LOOKUP)) {
    if (key === 'poc' || key === 'vehicleFlags') continue;
    const meta = resolveEntity(allEntities, names);
    if (!meta?.id) continue;
    const full = await getEntityMeta(token, meta.id);
    console.log(`\n=== ${full.displayName ?? full.name}: ${full.fields?.length ?? 0} pól ===`);
    for (const f of full.fields ?? []) {
      console.log(`  ${f.name} (${f.fieldDisplayType ?? '?'})`);
    }
  }

  console.log('\n--- Werdykt ---');
  const emptyDetailFields = [];
  for (const [uiKey, candidates] of Object.entries(DETAIL_FIELD_CANDIDATES)) {
    const hasData = candidates.some((c) => {
      const s = summarizeFieldPopulation(pocRows, [c])[c];
      return s && s.filled > 0;
    });
    if (!hasData) emptyDetailFields.push(uiKey);
  }
  if (emptyDetailFields.length === 0) {
    console.log('Wszystkie pola szczegółów mają źródło w DPD_POC.');
  } else {
    console.log(
      `Pola bez danych w DPD_POC: ${emptyDetailFields.join(', ')}.\n` +
        'Jeśli Maestro/DPD_VehicleFlags je wypełniają — UI musi scalać te źródła (fix w aplikacji).\n' +
        'Jeśli nigdzie nie ma wartości — uzupełnij dane lub proces zapisu do Data Fabric.',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
