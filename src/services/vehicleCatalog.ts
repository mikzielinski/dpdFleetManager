import { Entities } from '@uipath/uipath-typescript/entities';
import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { UiPath } from '@uipath/uipath-typescript/core';
import { DATA_FABRIC_ENTITY_LOOKUP, DPD_POC_ENTITY_ID } from '../config';
import {
  buildLookupMap,
  extractRelationshipId,
  findRelationshipFieldNames,
  pickRecordLabel,
  resolveLinkedVehicleId,
  resolveRelationshipLabel,
  resolveSchemaFieldName,
} from '../utils/entityFields';
import { normalizeDpdRecord, normalizeRegistration, registrationsMatch, type DpdRecord } from '../utils/record';
import { BYPASS_AUTH } from './demoData';
import { fetchAllEntityRecords } from './dataFabric';

export interface VehicleCatalogItem {
  id: string;
  registration: string;
  areaLabel: string;
  companyLabel: string;
  raw: DpdRecord;
}

export interface VehicleCatalogData {
  vehicles: VehicleCatalogItem[];
  areaOptions: string[];
  companyOptions: string[];
  totalVehicles: number;
  /** Schema-derived POC → B2B vehicle relationship field names (for cost matching). */
  pocVehicleFieldNames: string[];
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
  const vehicles: VehicleCatalogItem[] = [
    {
      id: 'v1',
      registration: 'WR145DPD',
      areaLabel: 'Wrocław — centrum',
      companyLabel: 'BP Polska',
      raw: { Id: 'v1', CarRegistration: 'WR145DPD' },
    },
    {
      id: 'v2',
      registration: 'WA 12345',
      areaLabel: 'Warszawa — Mokotów',
      companyLabel: 'DPD Express',
      raw: { Id: 'v2', CarRegistration: 'WA 12345' },
    },
    {
      id: 'v3',
      registration: 'KR 98765',
      areaLabel: 'Kraków — Północ',
      companyLabel: 'Orlen Fleet',
      raw: { Id: 'v3', CarRegistration: 'KR 98765' },
    },
  ];
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

/** Load B2B vehicles with area / courier company labels via Data Fabric relationships. */
export async function loadVehicleCatalog(sdk: UiPath): Promise<VehicleCatalogData> {
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

  const companyMap = companiesEntity
    ? buildLookupMap(
        (await fetchAllEntityRecords(sdk, companiesEntity.id, { expansionLevel: 1 })).map((r) =>
          normalizeDpdRecord(r),
        ),
        ['Id', 'id'],
        COMPANY_LABEL_FIELDS,
      )
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
    return {
      id: id || registration,
      registration: blankLabel(registration),
      areaLabel: blankLabel(areaLabel),
      companyLabel: blankLabel(companyLabel),
      raw: row,
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

  return {
    vehicles: withPlate,
    areaOptions,
    companyOptions,
    totalVehicles: withPlate.length,
    pocVehicleFieldNames: schemaPocFields,
  };
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
