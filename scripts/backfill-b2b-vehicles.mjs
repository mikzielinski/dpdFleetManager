/**
 * Uzupełnia brakujące pojazdy w DPD_B2B_Vehicles na podstawie rejestracji z DPD_POC
 * (i opcjonalnie eksportu instancji procesu UiPath).
 *
 * Wymaga: uip login --organization mzpocevylrxu --tenant DefaultTenant \
 *   --authority https://staging.uipath.com/identity_
 *
 *   node scripts/backfill-b2b-vehicles.mjs              # podgląd
 *   node scripts/backfill-b2b-vehicles.mjs --apply      # zapis do Data Fabric
 *   node scripts/backfill-b2b-vehicles.mjs --apply WR136DPD
 *   node scripts/backfill-b2b-vehicles.mjs --instance /path/to/Instance_*.json
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
  vehicles: '090e7421-c34a-f111-8ef3-000d3a261acd',
  poc: '4e2e38d9-bf4a-f111-8ef3-000d3a261acd',
  vehicleFlags: '8d83c3fe-c34a-f111-8ef3-000d3a261acd',
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

function normalizePlate(value) {
  return String(value ?? '')
    .replace(/^VH[-_\s]*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function displayPlate(normalized) {
  if (!normalized) return '';
  if (/^WR\d+DPD$/i.test(normalized)) return normalized.toUpperCase();
  return normalized;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

const apiRoot = `https://${cfg.apiHost}/${cfg.orgName}/${cfg.tenantName}/`;

async function apiGet(token, relPath, params = {}) {
  const url = new URL(relPath.replace(/^\//, ''), apiRoot);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url.pathname} → HTTP ${res.status}\n${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function apiPost(token, relPath, body, params = {}) {
  const url = new URL(relPath.replace(/^\//, ''), apiRoot);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url.pathname} → HTTP ${res.status}\n${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function readAllRecords(token, entityId, expansionLevel = 1) {
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
    start += batch.length;
    if (batch.length < limit) break;
    const total = data.totalRecordCount ?? data.totalCount;
    if (total != null && start >= total) break;
  }
  return items;
}

function modeValue(rows, field, fallback = '') {
  const counts = new Map();
  for (const row of rows) {
    const v = String(row[field] ?? '').trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = fallback;
  let max = 0;
  for (const [v, n] of counts) {
    if (n > max) {
      max = n;
      best = v;
    }
  }
  return best;
}

function buildPocProfile(pocRows) {
  const byPlate = new Map();
  for (const row of pocRows) {
    const plate = normalizePlate(row.CarRegistration ?? row.CarRegistraction);
    if (!plate) continue;
    let bucket = byPlate.get(plate);
    if (!bucket) {
      bucket = { companies: new Map(), regions: new Map(), count: 0 };
      byPlate.set(plate, bucket);
    }
    bucket.count += 1;
    const co = String(row.CompanyName ?? '').trim();
    if (co) bucket.companies.set(co, (bucket.companies.get(co) ?? 0) + 1);
  }
  const out = new Map();
  for (const [plate, bucket] of byPlate) {
    const company = [...bucket.companies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    out.set(plate, { company, claimCount: bucket.count });
  }
  return out;
}

function buildFlagHints(flagRows) {
  const out = new Map();
  for (const row of flagRows) {
    const plate = normalizePlate(row.VehicleID ?? row.CarRegistration);
    if (!plate) continue;
    out.set(plate, {
      companyId: String(row.CompanyID ?? '').trim(),
      vehicleId: String(row.VehicleID ?? '').trim(),
    });
  }
  return out;
}

function parseInstanceJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const hints = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        const key = k.toLowerCase();
        if (/carregistration|vehiclereg|registration|vehicleid/.test(key)) {
          const plate = normalizePlate(v);
          if (plate && plate.length >= 5) {
            hints.set(plate, { source: 'instance', rawKey: k, rawValue: v });
          }
        }
      } else if (typeof v === 'object') {
        walk(v);
      }
    }
  };
  walk(raw);
  return hints;
}

function buildVehiclePayload(plate, template, pocProfile, flagHints) {
  const display = displayPlate(plate);
  const poc = pocProfile.get(plate);
  const flag = flagHints.get(plate);
  const company =
    flag?.companyId ||
    poc?.company ||
    template.CompanyID ||
    'BP Polska';
  const region = /^WR/i.test(display)
    ? 'Wrocław'
    : template.AssignedRegion || 'Wrocław';

  return {
    VehicleID: flag?.vehicleId || `VH-${display}`,
    CarRegistration: display,
    CompanyID: company,
    VehicleModel: template.VehicleModel || 'Ford Transit',
    ProductionYear: template.ProductionYear || '2022',
    FuelType: template.FuelType || 'Petrol',
    MileageKM: template.MileageKM || '125000',
    VehicleStatus: template.VehicleStatus || 'Active',
    AssignedRegion: region,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const onlyPlate = args.find((a) => !a.startsWith('--'))?.toUpperCase();
  const instanceArgIdx = args.indexOf('--instance');
  const instancePath =
    instanceArgIdx >= 0 ? args[instanceArgIdx + 1] : process.env.INSTANCE_JSON ?? null;

  if (!fs.existsSync(authFile)) {
    console.error(`Brak ${authFile} — zaloguj się: uip login (staging).`);
    process.exit(1);
  }
  const token = parseAuth(authFile);
  if (!token) {
    console.error('Brak UIPATH_ACCESS_TOKEN.');
    process.exit(1);
  }

  console.log(`API: ${apiRoot}datafabric_/api/EntityService`);
  console.log(`Tryb: ${apply ? 'ZAPIS (--apply)' : 'PODGLĄD (dodaj --apply aby utworzyć rekordy)'}`);
  if (instancePath) console.log(`Instance JSON: ${instancePath}`);

  const [vehicles, pocRows, flagRows] = await Promise.all([
    readAllRecords(token, ENTITY_IDS.vehicles, 1),
    readAllRecords(token, ENTITY_IDS.poc, 1),
    readAllRecords(token, ENTITY_IDS.vehicleFlags, 1),
  ]);

  const existing = new Set(
    vehicles.map((v) => normalizePlate(v.CarRegistration ?? v.VehicleID)),
  );
  const pocProfile = buildPocProfile(pocRows);
  const flagHints = buildFlagHints(flagRows);
  const instanceHints = parseInstanceJson(instancePath);

  const template = {
    VehicleModel: modeValue(vehicles, 'VehicleModel', 'Ford Transit'),
    ProductionYear: modeValue(vehicles, 'ProductionYear', '2022'),
    FuelType: modeValue(vehicles, 'FuelType', 'Petrol'),
    MileageKM: modeValue(vehicles, 'MileageKM', '125000'),
    VehicleStatus: modeValue(vehicles, 'VehicleStatus', 'Active'),
    AssignedRegion: modeValue(vehicles, 'AssignedRegion', 'Wrocław'),
    CompanyID: modeValue(vehicles, 'CompanyID', 'BP Polska'),
  };

  const pocPlates = [...pocProfile.keys()].sort();
  const instancePlates = [...instanceHints.keys()].sort();
  const targetPlates = new Set([...pocPlates, ...instancePlates]);
  let missing = [...targetPlates].filter((p) => p && !existing.has(p)).sort();
  if (onlyPlate) {
    missing = missing.filter((p) => p === normalizePlate(onlyPlate));
    if (!missing.length && !existing.has(normalizePlate(onlyPlate))) {
      missing = [normalizePlate(onlyPlate)];
    }
  }

  console.log(`\nPojazdy w B2B: ${vehicles.length}`);
  console.log(`Unikalne rejestracje POC: ${pocPlates.length}`);
  console.log(`Brakujące w B2B: ${missing.length}`);
  if (!missing.length) {
    console.log('Nic do uzupełnienia.');
    return;
  }

  const created = [];
  const failed = [];

  for (const plate of missing) {
    const payload = buildVehiclePayload(plate, template, pocProfile, flagHints);
    console.log(`\n→ ${plate}`);
    console.log(JSON.stringify(payload, null, 2));
    if (!apply) continue;
    try {
      const result = await apiPost(
        token,
        `/datafabric_/api/EntityService/entity/${ENTITY_IDS.vehicles}/insert`,
        payload,
        { expansionLevel: 1 },
      );
      created.push({ plate, id: result.Id });
      console.log(`  OK Id=${result.Id}`);
    } catch (e) {
      failed.push({ plate, error: e.message });
      console.error(`  BŁĄD: ${e.message}`);
    }
  }

  console.log('\n--- Podsumowanie ---');
  if (apply) {
    console.log(`Utworzono: ${created.length}`);
    if (failed.length) console.log(`Błędy: ${failed.length}`);
    for (const c of created) console.log(`  ${c.plate} → ${c.id}`);
  } else {
    console.log(`Do utworzenia: ${missing.length}. Uruchom ponownie z --apply.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
