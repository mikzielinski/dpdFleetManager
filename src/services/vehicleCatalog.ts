import { Entities } from '@uipath/uipath-typescript/entities';
import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { UiPath } from '@uipath/uipath-typescript/core';
import { DATA_FABRIC_ENTITY_LOOKUP } from '../config';
import { buildLookupMap, lookupLabel, pickRecordLabel, resolveSchemaFieldName } from '../utils/entityFields';
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
  return { vehicles, areaOptions, companyOptions, totalVehicles: vehicles.length };
}

/** Load B2B vehicles with area / courier company labels from related Data Fabric entities. */
export async function loadVehicleCatalog(sdk: UiPath): Promise<VehicleCatalogData> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return mockVehicleCatalog();
  }

  const entities = new Entities(sdk);

  const [vehiclesEntity, areasEntity, companiesEntity] = await Promise.all([
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.b2bVehicles),
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw),
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.b2bCourierCompanies),
  ]);

  if (!vehiclesEntity) {
    throw new Error(
      'Nie znaleziono encji DPD_B2B_Vehicles (DPDB2BVehicles) w Data Fabric. Sprawdź uprawnienia DataFabric.Data.Read.',
    );
  }

  const regField =
    resolveSchemaFieldName(vehiclesEntity, REGISTRATION_FIELDS, /rejestrac|registration|pojazd|vehicle/i) ??
    'CarRegistration';

  const areaMap = areasEntity
    ? buildLookupMap(
        (await fetchAllEntityRecords(sdk, areasEntity.id)).map((r) => normalizeDpdRecord(r)),
        ['Id', 'id'],
        AREA_LABEL_FIELDS,
      )
    : new Map<string, string>();

  const companyMap = companiesEntity
    ? buildLookupMap(
        (await fetchAllEntityRecords(sdk, companiesEntity.id)).map((r) => normalizeDpdRecord(r)),
        ['Id', 'id'],
        COMPANY_LABEL_FIELDS,
      )
    : new Map<string, string>();

  const vehicleRows = (await fetchAllEntityRecords(sdk, vehiclesEntity.id)).map((r) =>
    normalizeDpdRecord(r),
  );

  const items: VehicleCatalogItem[] = vehicleRows.map((row) => {
    const id = String(row.Id ?? row.id ?? '');
    const registration = pickRecordLabel(row, [regField, ...REGISTRATION_FIELDS]);
    const areaLabel = lookupLabel(areaMap, row, AREA_REF_FIELDS, AREA_INLINE_FIELDS);
    const companyLabel = lookupLabel(companyMap, row, COMPANY_REF_FIELDS, COMPANY_INLINE_FIELDS);
    return {
      id: id || registration,
      registration: registration === '—' ? '' : registration,
      areaLabel: areaLabel === '—' ? '' : areaLabel,
      companyLabel: companyLabel === '—' ? '' : companyLabel,
      raw: row,
    };
  });

  const withPlate = items.filter((v) => v.registration.trim() !== '');
  const areaOptions = [
    ...new Set(withPlate.map((v) => v.areaLabel).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pl'));
  const companyOptions = [
    ...new Set(withPlate.map((v) => v.companyLabel).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pl'));

  return {
    vehicles: withPlate,
    areaOptions,
    companyOptions,
    totalVehicles: withPlate.length,
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

/** POC cost rows for the same registration as the selected B2B vehicle. */
export function matchCostsToVehicle(
  costs: DpdRecord[],
  registration: string,
): DpdRecord[] {
  if (!registration.trim()) return [];
  return costs.filter((r) => {
    const reg = pickRecordLabel(r, ['carRegistration', 'CarRegistration', 'CarRegistraction']);
    return registrationsMatch(reg, registration);
  });
}
