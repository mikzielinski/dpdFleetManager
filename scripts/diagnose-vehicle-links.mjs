/**
 * Diagnostyka: czy puste Region/Firma to błąd aplikacji czy brak powiązań w Data Fabric.
 *
 * Wymaga: uip login --organization mzpocevylrxu --tenant DefaultTenant \
 *   --authority https://staging.uipath.com/identity_
 *
 * Uruchom: node scripts/diagnose-vehicle-links.mjs
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

const ENTITY_NAMES = {
  vehicles: ['DPDB2BVehicles', 'DPD_B2B_Vehicles'],
  areas: ['DPDAreasWroclaw', 'DPD_Areas_Wroclaw'],
  companies: ['DPDB2BCourierCompanies', 'DPD_B2B_Courier_Companies'],
  poc: ['DPDPOC', 'DPD_POC'],
};

const POC_ENTITY_ID = '4e2e38d9-bf4a-f111-8ef3-000d3a261acd';

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
    'x-uipath-internal-tenantid': cfg.tenantId,
    'x-uipath-folderkey': cfg.folderKey,
    'Content-Type': 'application/json',
  };
}

const apiBase = `https://${cfg.apiHost}`;

async function apiGet(token, path, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, String(v));
  }
  const url = `${apiBase}${path}${q.size ? `?${q}` : ''}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
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

function relationshipFields(entityMeta, targetNames) {
  return (entityMeta.fields ?? []).filter(
    (f) =>
      f.fieldDisplayType === 'Relationship' &&
      entityNameMatches(f.referenceEntityName ?? f.referenceEntity?.name, targetNames),
  );
}

function classifyValue(v) {
  if (v === undefined || v === null || v === '') return 'empty';
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return 'empty';
    if (/^[0-9a-f-]{36}$/i.test(s)) return 'guid';
    return 'text';
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v;
    const label =
      o.displayName ?? o.DisplayName ?? o.name ?? o.Name ?? o.CompanyName ?? o.AreaName;
    if (label != null && String(label).trim()) return 'expanded';
    const id = o.Id ?? o.id;
    if (id != null && String(id).trim()) return 'guid';
    return 'empty';
  }
  return 'other';
}

function analyzeField(records, fieldName) {
  const stats = { empty: 0, guid: 0, expanded: 0, text: 0, other: 0 };
  const samples = { empty: [], guid: [], expanded: [] };
  for (const row of records) {
    const kind = classifyValue(row[fieldName]);
    stats[kind] = (stats[kind] ?? 0) + 1;
    if (samples[kind]?.length < 2) {
      samples[kind].push({
        plate: row.CarRegistration ?? row.Registration ?? row.VehicleID ?? row.Id,
        raw: row[fieldName],
      });
    }
  }
  return { stats, samples };
}

function resolveEntity(entities, names) {
  const wanted = new Set(names.map(normalizeKey));
  return entities.find(
    (e) => wanted.has(normalizeKey(e.name)) || wanted.has(normalizeKey(e.displayName)),
  );
}

function printVerdict(label, analysis) {
  const total = Object.values(analysis.stats).reduce((a, b) => a + b, 0);
  const { empty, guid, expanded } = analysis.stats;
  console.log(`\n=== ${label} (rekordów: ${total}) ===`);
  console.log(`  puste: ${empty}, samo Id (FK): ${guid}, rozwinięte (z etykietą): ${expanded}`);
  if (expanded > 0) {
    console.log('  → Dane SĄ w encji; jeśli UI pokazuje „—”, to raczej błąd aplikacji / deploy.');
  } else if (guid > 0) {
    console.log(
      '  → Powiązania ISTNIEJĄ (GUID); UI bez etykiet = błąd mapowania lub stary build bez expansion.',
    );
  } else if (empty === total) {
    console.log('  → Żaden rekord nie ma ustawionej relacji — to brak danych w Data Fabric, nie UI.');
  }
  if (analysis.samples.guid.length) {
    console.log('  Przykład FK:', JSON.stringify(analysis.samples.guid[0], null, 2));
  }
  if (analysis.samples.expanded.length) {
    console.log('  Przykład expanded:', JSON.stringify(analysis.samples.expanded[0], null, 2));
  }
}

async function main() {
  if (!fs.existsSync(authFile)) {
    console.error(`Brak ${authFile} — zaloguj się przez uip login (staging).`);
    process.exit(1);
  }
  const token = parseAuth(authFile);
  if (!token) {
    console.error('Brak UIPATH_ACCESS_TOKEN w .auth');
    process.exit(1);
  }

  console.log('Pobieram metadane encji…');
  const all = await listEntities(token);
  const vehiclesMeta = resolveEntity(all, ENTITY_NAMES.vehicles);
  const areasMeta = resolveEntity(all, ENTITY_NAMES.areas);
  const companiesMeta = resolveEntity(all, ENTITY_NAMES.companies);
  const pocMeta =
    resolveEntity(all, ENTITY_NAMES.poc) ??
    (await getEntityMeta(token, POC_ENTITY_ID).then((m) => ({ ...m, id: POC_ENTITY_ID })).catch(() => null));

  if (!vehiclesMeta?.id) {
    console.error('Nie znaleziono encji B2B Vehicles.');
    process.exit(1);
  }

  const vehiclesFull = await getEntityMeta(token, vehiclesMeta.id);
  const areaRel = relationshipFields(vehiclesFull, ENTITY_NAMES.areas);
  const companyRel = relationshipFields(vehiclesFull, ENTITY_NAMES.companies);

  console.log('\n--- Schemat DPD_B2B_Vehicles ---');
  console.log(`Encja: ${vehiclesFull.displayName ?? vehiclesFull.name} (${vehiclesFull.id})`);
  console.log(
    'Pola Relationship → region:',
    areaRel.length
      ? areaRel.map((f) => `${f.name} → ${f.referenceEntityName}`)
      : '(brak w schemacie)',
  );
  console.log(
    'Pola Relationship → firma:',
    companyRel.length
      ? companyRel.map((f) => `${f.name} → ${f.referenceEntityName}`)
      : '(brak w schemacie)',
  );

  if (pocMeta) {
    const pocFull = pocMeta.fields ? pocMeta : await getEntityMeta(token, pocMeta.id);
    const pocVeh = relationshipFields(pocFull, ENTITY_NAMES.vehicles);
    console.log(
      'POC → pojazd:',
      pocVeh.length ? pocVeh.map((f) => `${f.name} → ${f.referenceEntityName}`) : '(brak relacji w schemacie)',
    );
  }

  console.log('\nPobieram rekordy pojazdów (expansionLevel 0 i 2)…');
  const at0 = await readAllRecords(token, vehiclesMeta.id, 0);
  const at2 = await readAllRecords(token, vehiclesMeta.id, 2);

  console.log(`Liczba pojazdów: ${at0.length}`);
  if (areasMeta) {
    const areas = await readAllRecords(token, areasMeta.id, 1);
    console.log(`Liczba regionów (${areasMeta.name}): ${areas.length}`);
  }
  if (companiesMeta) {
    const cos = await readAllRecords(token, companiesMeta.id, 1);
    console.log(`Liczba firm (${companiesMeta.name}): ${cos.length}`);
  }

  for (const f of companyRel) {
    printVerdict(`Firma [${f.name}] expansion=0`, analyzeField(at0, f.name));
    printVerdict(`Firma [${f.name}] expansion=2`, analyzeField(at2, f.name));
  }
  for (const f of areaRel) {
    printVerdict(`Region [${f.name}] expansion=0`, analyzeField(at0, f.name));
    printVerdict(`Region [${f.name}] expansion=2`, analyzeField(at2, f.name));
  }

  if (!companyRel.length && !areaRel.length) {
    console.log(
      '\nUWAGA: W schemacie pojazdów nie ma pól Relationship do firmy/regionu — model może być inny (np. firma na POC).',
    );
    console.log('Wszystkie pola Relationship na pojazdach:');
    for (const f of vehiclesFull.fields ?? []) {
      if (f.fieldDisplayType === 'Relationship') {
        console.log(`  - ${f.name} → ${f.referenceEntityName ?? '?'}`);
      }
    }
  }

  if (pocMeta?.id) {
    const pocRows = await readAllRecords(token, pocMeta.id, 2);
    const pocFull = await getEntityMeta(token, pocMeta.id);
    const pocVeh = relationshipFields(pocFull, ENTITY_NAMES.vehicles);
    console.log(`\n--- DPD_POC (${pocRows.length} rekordów) ---`);
    for (const f of pocVeh) {
      printVerdict(`POC→pojazd [${f.name}]`, analyzeField(pocRows, f.name));
    }
    const regFilled = pocRows.filter((r) => r.CarRegistration ?? r.CarRegistraction).length;
    console.log(`Rejestracja tekstowa (CarRegistration): ${regFilled}/${pocRows.length}`);
  }

  console.log('\n--- Podsumowanie ---');
  const anyCompanyData = companyRel.some((f) => {
    const a = analyzeField(at2, f.name);
    return a.stats.guid + a.stats.expanded > 0;
  });
  const anyAreaData = areaRel.some((f) => {
    const a = analyzeField(at2, f.name);
    return a.stats.guid + a.stats.expanded > 0;
  });
  if (!anyCompanyData && !anyAreaData) {
    console.log(
      'WERDYKT: Pojazdy w Data Fabric nie są powiązane z firmą ani regionem — UI słusznie pokazuje „—”.',
    );
    console.log('Uzupełnij relacje w DPD_B2B_Vehicles (Data Fabric) lub zaimportuj dane z powiązaniami.');
  } else if (anyCompanyData || anyAreaData) {
    console.log(
      'WERDYKT: Powiązania są w danych — jeśli UI nadal puste, wdroż build z fix relacji (≥1.1.4) lub sprawdź konsolę [vehicles].',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
