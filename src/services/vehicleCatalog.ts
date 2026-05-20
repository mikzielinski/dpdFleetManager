import { Entities } from '@uipath/uipath-typescript/entities';
import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { UiPath } from '@uipath/uipath-typescript/core';
import { DATA_FABRIC_ENTITY_LOOKUP, DPD_POC_ENTITY_ID } from '../config';
import {
  isPocInvoiceVendorName,
  pickSyntheticPartner,
  SYNTHETIC_B2B_PARTNERS,
} from '../data/syntheticB2BVendors';
import {
  buildLookupMap,
  extractRelationshipId,
  findRelationshipFieldNames,
  pickRecordLabel,
  resolveLinkedVehicleId,
  resolveRelationshipLabel,
  resolveSchemaFieldName,
} from '../utils/entityFields';
import {
  DEMO_FLEET_CASES_ENABLED,
  demoFieldsForB2BRecord,
  getDemoFleetCompliance,
} from '../data/demoFleetCases';
import { resolveVehicleCompliance, type VehicleCompliance } from '../utils/vehicleCompliance';
import type { HealthGrade } from '../utils/healthScore';
import { normalizeDpdRecord, normalizeRegistration, registrationsMatch, type DpdRecord } from '../utils/record';
import { BYPASS_AUTH } from './demoData';
import { fetchAllEntityRecords } from './dataFabric';

export interface VehicleCatalogItem {
  id: string;
  registration: string;
  areaLabel: string;
  companyLabel: string;
  raw: DpdRecord;
  compliance?: VehicleCompliance;
  healthScore?: number;
  healthGrade?: HealthGrade;
  totalCost?: number;
}

export interface VehicleCatalogData {
  vehicles: VehicleCatalogItem[];
  areaOptions: string[];
  companyOptions: string[];
  totalVehicles: number;
  /** Schema-derived POC → B2B vehicle relationship field names (for cost matching). */
  pocVehicleFieldNames: string[];
  /** Region/firma uzupełnione z kosztów POC (brak relacji na B2B_Vehicles). */
  labelsFromPoc?: boolean;
  /** Część etykiet z fikcyjnej puli partnerów B2B (staging / brak relacji). */
  labelsSynthetic?: boolean;
}

const REGISTRATION_FIELDS = [
  'CarRegistration',
  'RegistrationNumber',
  'VehicleRegistration',
  'Registration',
  'LicensePlate',
  'PlateNumber',
  'VehicleID',
  'VehicleId',
  'Vehicle ID',
] as const;

const AREA_REF_FIELDS = [
  'Area',
  'Region',
  'DPDArea',
  'DPD_Area',
  'AreaId',
  'RegionId',
  'DPDAreasWroclaw',
  'DPD_Areas_Wroclaw',
  'AreaID',
] as const;

const AREA_INLINE_FIELDS = ['AreaName', 'City', 'Region', 'RegionName', 'CityName', 'Location'] as const;

const COMPANY_REF_FIELDS = [
  'CourierCompany',
  'Company',
  'B2BCompany',
  'Courier',
  'CompanyId',
  'CourierCompanyId',
  'DPDB2BCourierCompanies',
  'DPD_B2B_Courier_Companies',
] as const;

const COMPANY_INLINE_FIELDS = ['CompanyName', 'CourierCompanyName', 'FirmName', 'ContractorName'] as const;

const POC_VEHICLE_REF_FIELDS = [
  'Vehicle',
  'B2BVehicle',
  'DPDB2BVehicle',
  'DPDB2BVehicles',
  'DPD_B2B_Vehicle',
  'DPD_B2B_Vehicles',
  'VehicleId',
  'VehicleID',
] as const;

const AREA_LABEL_FIELDS = [
  'Name',
  'AreaName',
  'City',
  'Region',
  'RegionName',
  'CityName',
  'DisplayName',
  'Area',
  'Description',
] as const;

const COMPANY_LABEL_FIELDS = [
  'Name',
  'CompanyName',
  'CourierCompanyName',
  'DisplayName',
  'LegalName',
  'TaxName',
] as const;

const POC_COMPANY_FIELDS = [
  'CompanyName',
  'companyName',
  'CourierCompanyName',
  'FirmName',
] as const;

const POC_AREA_FIELDS = [
  'Area',
  'AreaName',
  'City',
  'Region',
  'RegionName',
  'CityName',
  'Location',
  'DPDArea',
] as const;

function normalizeHintKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function modeLabel(counts: Map<string, number>): string {
  let best = '';
  let max = 0;
  for (const [label, n] of counts) {
    if (n > max) {
      max = n;
      best = label;
    }
  }
  return best;
}

type PocEnrichmentContext = {
  companyRows: DpdRecord[];
  companiesEntity: EntityGetResponse | null;
  areasEntity: EntityGetResponse | null;
  areaMap: Map<string, string>;
  areaNames: string[];
  companyNames: string[];
};

/** Firma kurierska (słownik B2B) → etykieta regionu, jeśli jest relacja na encji firmy. */
function buildCompanyCatalogHints(ctx: PocEnrichmentContext): Map<string, { companyLabel: string; areaLabel: string }> {
  const hints = new Map<string, { companyLabel: string; areaLabel: string }>();
  const areaNames = ctx.areasEntity
    ? [ctx.areasEntity.name, ctx.areasEntity.displayName, ...ctx.areaNames]
    : ctx.areaNames;

  for (const row of ctx.companyRows) {
    const companyLabel = blankLabel(pickRecordLabel(row, COMPANY_LABEL_FIELDS));
    if (!companyLabel) continue;
    const fromRel = resolveRelationshipLabel(
      row,
      ctx.companiesEntity,
      areaNames.filter(Boolean) as string[],
      AREA_LABEL_FIELDS,
      AREA_REF_FIELDS,
      AREA_INLINE_FIELDS,
      ctx.areaMap,
    );
    const fromInline = pickRecordLabel(row, AREA_INLINE_FIELDS);
    const areaLabel = blankLabel(fromRel !== '—' ? fromRel : fromInline);
    hints.set(normalizeHintKey(companyLabel), { companyLabel, areaLabel });
  }
  return hints;
}

function findCompanyRow(companyLabel: string, rows: DpdRecord[]): DpdRecord | null {
  const key = normalizeHintKey(companyLabel);
  for (const row of rows) {
    const label = blankLabel(pickRecordLabel(row, COMPANY_LABEL_FIELDS));
    if (!label) continue;
    if (normalizeHintKey(label) === key) return row;
  }
  for (const row of rows) {
    const label = blankLabel(pickRecordLabel(row, COMPANY_LABEL_FIELDS));
    if (!label) continue;
    const lk = normalizeHintKey(label);
    if (lk.includes(key) || key.includes(lk)) return row;
  }
  return null;
}

function areaLabelFromCompanyRow(row: DpdRecord, ctx: PocEnrichmentContext): string {
  const areaNames = ctx.areasEntity
    ? [ctx.areasEntity.name, ctx.areasEntity.displayName, ...ctx.areaNames]
    : ctx.areaNames;
  const fromRel = resolveRelationshipLabel(
    row,
    ctx.companiesEntity,
    areaNames.filter(Boolean) as string[],
    AREA_LABEL_FIELDS,
    AREA_REF_FIELDS,
    AREA_INLINE_FIELDS,
    ctx.areaMap,
  );
  const fromInline = pickRecordLabel(row, AREA_INLINE_FIELDS);
  return blankLabel(fromRel !== '—' ? fromRel : fromInline);
}

/** Najczęstsza firma / region z kosztów DPD_POC dla danej rejestracji. */
function buildPocHintsByPlate(costs: DpdRecord[]): Map<
  string,
  { company: string; area: string }
> {
  const buckets = new Map<string, { companies: Map<string, number>; areas: Map<string, number> }>();

  for (const row of costs) {
    const reg = pickRecordLabel(row, ['CarRegistration', 'CarRegistraction', 'carRegistration']);
    if (reg === '—' || !reg.trim()) continue;
    const plateKey = normalizeRegistration(reg);
    let bucket = buckets.get(plateKey);
    if (!bucket) {
      bucket = { companies: new Map(), areas: new Map() };
      buckets.set(plateKey, bucket);
    }
    const co = pickRecordLabel(row, POC_COMPANY_FIELDS);
    if (co !== '—' && co.trim()) {
      const k = co.trim();
      bucket.companies.set(k, (bucket.companies.get(k) ?? 0) + 1);
    }
    const ar = pickRecordLabel(row, POC_AREA_FIELDS);
    if (ar !== '—' && ar.trim()) {
      const k = ar.trim();
      bucket.areas.set(k, (bucket.areas.get(k) ?? 0) + 1);
    }
  }

  const out = new Map<string, { company: string; area: string }>();
  for (const [plate, bucket] of buckets) {
    out.set(plate, {
      company: modeLabel(bucket.companies),
      area: modeLabel(bucket.areas),
    });
  }
  return out;
}

function resolveAreaFromCompanyName(
  companyLabel: string,
  catalogHints: Map<string, { companyLabel: string; areaLabel: string }>,
  companyRows: DpdRecord[],
  ctx: PocEnrichmentContext,
): string {
  if (!companyLabel.trim()) return '';
  const key = normalizeHintKey(companyLabel);
  if (catalogHints.has(key) && catalogHints.get(key)!.areaLabel) {
    return catalogHints.get(key)!.areaLabel;
  }
  for (const [k, v] of catalogHints) {
    if ((k.includes(key) || key.includes(k)) && v.areaLabel) return v.areaLabel;
  }
  const row = findCompanyRow(companyLabel, companyRows);
  if (row) return areaLabelFromCompanyRow(row, ctx);
  return '';
}

/**
 * Uzupełnia etykiety regionu/firmy z DPD_POC (po rejestracji) i słownika firm B2B,
 * gdy encja pojazdów nie ma pól Relationship (staging).
 */
export function applyPocEnrichment(
  catalog: VehicleCatalogData,
  pocCosts: DpdRecord[],
  ctx: PocEnrichmentContext,
): VehicleCatalogData {
  if (!pocCosts.length) return catalog;

  const pocByPlate = buildPocHintsByPlate(pocCosts);
  const companyCatalog = buildCompanyCatalogHints(ctx);

  const vehicles = catalog.vehicles.map((v) => {
    let companyLabel = v.companyLabel;
    let areaLabel = v.areaLabel;
    const plateKey = normalizeRegistration(v.registration);
    const poc = pocByPlate.get(plateKey);

    if (!companyLabel && poc?.company) {
      companyLabel =
        companyCatalog.get(normalizeHintKey(poc.company))?.companyLabel ?? poc.company;
    }
    if (!areaLabel && poc?.area) areaLabel = poc.area;
    if (!areaLabel && companyLabel) {
      areaLabel = resolveAreaFromCompanyName(
        companyLabel,
        companyCatalog,
        ctx.companyRows,
        ctx,
      );
    }
    if (!areaLabel && /^WR/i.test(v.registration)) {
      const wroclawAreas = [...ctx.areaMap.values()].filter((a) => /wrocław/i.test(a));
      if (wroclawAreas.length) areaLabel = wroclawAreas[0];
    }

    return { ...v, companyLabel, areaLabel };
  });

  const areaOptions = [...new Set(vehicles.map((v) => v.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  const companyOptions = [...new Set(vehicles.map((v) => v.companyLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );

  const withSynthetic = applySyntheticB2BLabels({
    ...catalog,
    vehicles,
    areaOptions,
    companyOptions,
    labelsFromPoc: true,
  });

  return withSynthetic;
}

/**
 * Uzupełnia brakujące (i zastępuje nazwy ze stacji POC) fikcyjnymi partnerami B2B DPD.
 */
export function applySyntheticB2BLabels(catalog: VehicleCatalogData): VehicleCatalogData {
  if (!SYNTHETIC_B2B_PARTNERS.length) return catalog;

  let syntheticCount = 0;
  const vehicles = catalog.vehicles.map((v) => {
    const needsCompany = !v.companyLabel || isPocInvoiceVendorName(v.companyLabel);
    const needsArea = !v.areaLabel;
    if (!needsCompany && !needsArea) return v;

    const partner = pickSyntheticPartner(v.registration || v.id);
    syntheticCount += 1;
    return {
      ...v,
      companyLabel: needsCompany ? partner.company : v.companyLabel,
      areaLabel: needsArea ? partner.area : v.areaLabel,
    };
  });

  const areaOptions = [...new Set(vehicles.map((x) => x.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  const companyOptions = [...new Set(vehicles.map((x) => x.companyLabel).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pl'),
  );

  return {
    ...catalog,
    vehicles,
    areaOptions,
    companyOptions,
    labelsSynthetic: syntheticCount > 0,
  };
}

async function resolveEntityByNames(
  entities: Entities,
  names: readonly string[],
): Promise<EntityGetResponse | null> {
  const all = await entities.getAll();
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const e of all) {
    if (wanted.has(e.name.toLowerCase()) || wanted.has((e.displayName ?? '').toLowerCase())) {
      return entities.getById(e.id);
    }
  }
  return null;
}

function mockVehicleCatalog(): VehicleCatalogData {
  const specs: Omit<VehicleCatalogItem, 'compliance'>[] = [
    {
      id: 'v1',
      registration: 'WR145DPD',
      areaLabel: 'Wrocław Centrum',
      companyLabel: 'Trans-Hex Kurier B2B Sp. z o.o.',
      raw: { Id: 'v1', CarRegistration: 'WR145DPD' },
    },
    {
      id: 'v2',
      registration: 'WR136DPD',
      areaLabel: 'Wrocław Południe',
      companyLabel: 'LogiTrans Partner Sp. z o.o.',
      raw: { Id: 'v2', CarRegistration: 'WR136DPD' },
    },
    {
      id: 'v3',
      registration: 'DW7855U',
      areaLabel: 'Dolnośląskie',
      companyLabel: 'FleetLine B2B Services',
      raw: { Id: 'v3', CarRegistration: 'DW7855U' },
    },
    {
      id: 'v4',
      registration: 'DW2048O',
      areaLabel: 'Dolnośląskie',
      companyLabel: 'Kurier Express Dolny Śląsk',
      raw: { Id: 'v4', CarRegistration: 'DW2048O' },
    },
    {
      id: 'v5',
      registration: 'DW2905K',
      areaLabel: 'Wrocław',
      companyLabel: 'Trans-Hex Kurier B2B Sp. z o.o.',
      raw: { Id: 'v5', CarRegistration: 'DW2905K' },
    },
    {
      id: 'v6',
      registration: 'WR117DPD',
      areaLabel: 'Wrocław',
      companyLabel: 'Auto Partner Flota B2B',
      raw: { Id: 'v6', CarRegistration: 'WR117DPD' },
    },
  ];
  const vehicles: VehicleCatalogItem[] = specs.map((v) => {
    const compliance = DEMO_FLEET_CASES_ENABLED
      ? getDemoFleetCompliance(v.registration)
      : resolveVehicleCompliance(v.raw, v.registration);
    return {
      ...v,
      raw: { ...v.raw, ...demoFieldsForB2BRecord(compliance) },
      compliance,
    };
  });
  const areaOptions = [...new Set(vehicles.map((v) => v.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  const companyOptions = [...new Set(vehicles.map((v) => v.companyLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  return {
    vehicles,
    areaOptions,
    companyOptions,
    totalVehicles: vehicles.length,
    pocVehicleFieldNames: [...POC_VEHICLE_REF_FIELDS],
  };
}

function blankLabel(label: string): string {
  return label === '—' || !label.trim() ? '' : label;
}

/** Dev/staging: czy w surowych rekordach są ustawione FK relacji. */
function summarizeRelationshipData(rows: DpdRecord[], fieldNames: string[]) {
  let filled = 0;
  let empty = 0;
  const byField: Record<string, { filled: number; empty: number }> = {};
  for (const fn of fieldNames) {
    byField[fn] = { filled: 0, empty: 0 };
  }
  for (const row of rows) {
    let rowHas = false;
    for (const fn of fieldNames) {
      const id = extractRelationshipId(row[fn]);
      if (id) {
        byField[fn].filled += 1;
        rowHas = true;
      } else {
        byField[fn].empty += 1;
      }
    }
    if (rowHas) filled += 1;
    else empty += 1;
  }
  return { filled, empty, byField };
}

/** Load B2B vehicles; opcjonalnie uzupełnij etykiety z DPD_POC (po rejestracji). */
export async function loadVehicleCatalog(
  sdk: UiPath,
  pocCosts?: DpdRecord[],
): Promise<VehicleCatalogData> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return mockVehicleCatalog();
  }

  const entities = new Entities(sdk);

  const [vehiclesEntity, areasEntity, companiesEntity, pocEntity] = await Promise.all([
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.b2bVehicles),
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw),
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.b2bCourierCompanies),
    entities.getById(DPD_POC_ENTITY_ID).catch(() => null),
  ]);

  if (!vehiclesEntity) {
    throw new Error(
      'Nie znaleziono encji DPD_B2B_Vehicles (DPDB2BVehicles) w Data Fabric. Sprawdź uprawnienia DataFabric.Data.Read.',
    );
  }

  const pocVehicleFieldNames = findRelationshipFieldNames(
    pocEntity,
    DATA_FABRIC_ENTITY_LOOKUP.b2bVehicles,
  );

  const regField =
    resolveSchemaFieldName(vehiclesEntity, REGISTRATION_FIELDS, /rejestrac|registration|pojazd|vehicle/i) ??
    'CarRegistration';

  const areaMap = areasEntity
    ? buildLookupMap(
        (await fetchAllEntityRecords(sdk, areasEntity.id, { expansionLevel: 1 })).map((r) =>
          normalizeDpdRecord(r),
        ),
        ['Id', 'id'],
        AREA_LABEL_FIELDS,
      )
    : new Map<string, string>();

  const companyRows = companiesEntity
    ? (await fetchAllEntityRecords(sdk, companiesEntity.id, { expansionLevel: 2 })).map((r) =>
        normalizeDpdRecord(r),
      )
    : [];

  const companyMap = companyRows.length
    ? buildLookupMap(companyRows, ['Id', 'id'], COMPANY_LABEL_FIELDS)
    : new Map<string, string>();

  const vehicleRows = (
    await fetchAllEntityRecords(sdk, vehiclesEntity.id, { expansionLevel: 2 })
  ).map((r) => normalizeDpdRecord(r));

  const areaNames = areasEntity
    ? [areasEntity.name, areasEntity.displayName, ...DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw]
    : DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw;
  const companyNames = companiesEntity
    ? [companiesEntity.name, companiesEntity.displayName, ...DATA_FABRIC_ENTITY_LOOKUP.b2bCourierCompanies]
    : DATA_FABRIC_ENTITY_LOOKUP.b2bCourierCompanies;

  const items: VehicleCatalogItem[] = vehicleRows.map((row) => {
    const id = String(row.Id ?? row.id ?? '');
    const registration = pickRecordLabel(row, [regField, ...REGISTRATION_FIELDS]);
    const areaLabel = resolveRelationshipLabel(
      row,
      vehiclesEntity,
      areaNames.filter(Boolean) as string[],
      AREA_LABEL_FIELDS,
      AREA_REF_FIELDS,
      AREA_INLINE_FIELDS,
      areaMap,
    );
    const companyLabel = resolveRelationshipLabel(
      row,
      vehiclesEntity,
      companyNames.filter(Boolean) as string[],
      COMPANY_LABEL_FIELDS,
      COMPANY_REF_FIELDS,
      COMPANY_INLINE_FIELDS,
      companyMap,
    );
    const reg = blankLabel(registration);
    return {
      id: id || reg,
      registration: reg,
      areaLabel: blankLabel(areaLabel),
      companyLabel: blankLabel(companyLabel),
      raw: row,
      compliance: resolveVehicleCompliance(row, reg, vehiclesEntity),
    };
  });

  const withPlate = items.filter((v) => v.registration.trim() !== '');
  const areaOptions = [...new Set(withPlate.map((v) => v.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  const companyOptions = [...new Set(withPlate.map((v) => v.companyLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );

  const schemaPocFields =
    pocVehicleFieldNames.length > 0 ? pocVehicleFieldNames : [...POC_VEHICLE_REF_FIELDS];

  if (import.meta.env.DEV) {
    const areaRelNames = findRelationshipFieldNames(vehiclesEntity, areaNames.filter(Boolean) as string[]);
    const coRelNames = findRelationshipFieldNames(vehiclesEntity, companyNames.filter(Boolean) as string[]);
    const linkStats = summarizeRelationshipData(vehicleRows, [...coRelNames, ...areaRelNames]);
    console.info('[vehicles] diagnostyka powiązań', {
      schema: { area: areaRelNames, company: coRelNames, pocToVehicle: schemaPocFields },
      labelsResolved: {
        withCompany: withPlate.filter((v) => v.companyLabel).length,
        withArea: withPlate.filter((v) => v.areaLabel).length,
        total: withPlate.length,
      },
      rawRelationshipFields: linkStats,
      verdict:
        linkStats.filled === 0
          ? 'Brak FK w encji — pojazdy niepowiązane (dane), nie błąd UI'
          : linkStats.filled > 0 && withPlate.every((v) => !v.companyLabel && !v.areaLabel)
            ? 'FK w danych, brak etykiet w UI — sprawdź deploy / mapowanie'
            : 'Część etykiet OK',
    });
  }

  const base: VehicleCatalogData = {
    vehicles: withPlate,
    areaOptions,
    companyOptions,
    totalVehicles: withPlate.length,
    pocVehicleFieldNames: schemaPocFields,
  };

  if (!pocCosts?.length) return applySyntheticB2BLabels(base);

  return applyPocEnrichment(base, pocCosts, {
    companyRows,
    companiesEntity,
    areasEntity,
    areaMap,
    areaNames: areaNames.filter(Boolean) as string[],
    companyNames: companyNames.filter(Boolean) as string[],
  });
}

export function filterVehicleCatalog(
  catalog: VehicleCatalogItem[],
  filters: { query: string; area: string; company: string },
): VehicleCatalogItem[] {
  const q = filters.query.trim().toLowerCase();
  const compact = q.replace(/\s+/g, '');
  return catalog.filter((v) => {
    if (filters.area && v.areaLabel !== filters.area) return false;
    if (filters.company && v.companyLabel !== filters.company) return false;
    if (!q) return true;
    const plateNorm = normalizeRegistration(v.registration).toLowerCase();
    const plateLoose = v.registration.toLowerCase();
    return (
      (compact.length > 0 && plateNorm.includes(compact)) ||
      plateLoose.includes(q) ||
      v.areaLabel.toLowerCase().includes(q) ||
      v.companyLabel.toLowerCase().includes(q)
    );
  });
}

/** Count POC rows per B2B vehicle Id (relationship), with registration fallback. */
export function buildPocCountByVehicleId(
  costs: DpdRecord[],
  pocVehicleFieldNames: readonly string[],
  vehicleIdsByNormalizedPlate: Map<string, string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of costs) {
    let vehicleId = resolveLinkedVehicleId(
      r,
      null,
      DATA_FABRIC_ENTITY_LOOKUP.b2bVehicles,
      pocVehicleFieldNames,
    );
    if (!vehicleId) {
      const reg = pickRecordLabel(r, ['carRegistration', 'CarRegistration', 'CarRegistraction']);
      if (reg !== '—') {
        vehicleId = vehicleIdsByNormalizedPlate.get(normalizeRegistration(reg)) ?? '';
      }
    }
    if (!vehicleId) continue;
    counts.set(vehicleId, (counts.get(vehicleId) ?? 0) + 1);
  }
  return counts;
}

/** POC cost rows for the selected B2B vehicle (relationship Id, then registration). */
export function matchCostsToVehicle(
  costs: DpdRecord[],
  vehicle: Pick<VehicleCatalogItem, 'id' | 'registration'>,
  pocVehicleFieldNames: readonly string[],
): DpdRecord[] {
  const vid = vehicle.id.trim();
  const reg = vehicle.registration.trim();
  if (!vid && !reg) return [];

  return costs.filter((r) => {
    const linked = resolveLinkedVehicleId(
      r,
      null,
      DATA_FABRIC_ENTITY_LOOKUP.b2bVehicles,
      pocVehicleFieldNames,
    );
    if (vid && linked && linked.toLowerCase() === vid.toLowerCase()) return true;
    if (!reg) return false;
    const plate = pickRecordLabel(r, ['carRegistration', 'CarRegistration', 'CarRegistraction']);
    return registrationsMatch(plate, reg);
  });
}
