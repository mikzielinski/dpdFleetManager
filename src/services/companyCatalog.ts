import { Entities } from '@uipath/uipath-typescript/entities';
import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { UiPath } from '@uipath/uipath-typescript/core';
import { DATA_FABRIC_ENTITY_LOOKUP } from '../config';
import { SYNTHETIC_B2B_PARTNERS } from '../data/syntheticB2BVendors';
import {
  buildLookupMap,
  pickRecordLabel,
  resolveRelationshipLabel,
  resolveSchemaFieldName,
} from '../utils/entityFields';
import { normalizeDpdRecord, type DpdRecord } from '../utils/record';
import { BYPASS_AUTH } from './demoData';
import { fetchAllEntityRecords } from './dataFabric';
import type { VehicleCatalogItem } from './vehicleCatalog';

export interface CompanyCatalogItem {
  id: string;
  name: string;
  areaLabel: string;
  vehicleCount: number;
  raw: DpdRecord;
}

export interface CompanyCatalogData {
  companies: CompanyCatalogItem[];
  areaOptions: string[];
  totalCompanies: number;
}

const AREA_REF_FIELDS = [
  'Area',
  'Region',
  'DPDArea',
  'AreaId',
  'DPDAreasWroclaw',
] as const;

const AREA_INLINE_FIELDS = ['AreaName', 'City', 'Region', 'RegionName', 'CityName'] as const;

const AREA_LABEL_FIELDS = [
  'Name',
  'AreaName',
  'City',
  'Region',
  'RegionName',
  'DisplayName',
] as const;

const COMPANY_LABEL_FIELDS = [
  'Name',
  'CompanyName',
  'CourierCompanyName',
  'DisplayName',
  'LegalName',
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

function blank(label: string): string {
  return label === '—' || !label.trim() ? '' : label;
}

function vehicleCountByCompany(vehicles: VehicleCatalogItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of vehicles) {
    if (!v.companyLabel) continue;
    counts.set(v.companyLabel, (counts.get(v.companyLabel) ?? 0) + 1);
  }
  return counts;
}

function mockCompanyCatalog(vehicles: VehicleCatalogItem[]): CompanyCatalogData {
  const counts = vehicleCountByCompany(vehicles);
  const companies: CompanyCatalogItem[] = SYNTHETIC_B2B_PARTNERS.map((p, i) => ({
    id: `co-mock-${i}`,
    name: p.company,
    areaLabel: p.area,
    vehicleCount: counts.get(p.company) ?? 0,
    raw: { Id: `co-mock-${i}`, Name: p.company },
  }));
  const areaOptions = [...new Set(companies.map((c) => c.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );
  return { companies, areaOptions, totalCompanies: companies.length };
}

/** Słownik firm kurierskich B2B + liczba pojazdów z katalogu floty. */
export async function loadCompanyCatalog(
  sdk: UiPath,
  fleetVehicles: VehicleCatalogItem[] = [],
): Promise<CompanyCatalogData> {
  if (BYPASS_AUTH) {
    await Promise.resolve();
    return mockCompanyCatalog(fleetVehicles);
  }

  const entities = new Entities(sdk);
  const [companiesEntity, areasEntity] = await Promise.all([
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.b2bCourierCompanies),
    resolveEntityByNames(entities, DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw),
  ]);

  const areaMap = areasEntity
    ? buildLookupMap(
        (await fetchAllEntityRecords(sdk, areasEntity.id, { expansionLevel: 1 })).map((r) =>
          normalizeDpdRecord(r),
        ),
        ['Id', 'id'],
        AREA_LABEL_FIELDS,
      )
    : new Map<string, string>();

  const areaNames = areasEntity
    ? [areasEntity.name, areasEntity.displayName, ...DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw]
    : [...DATA_FABRIC_ENTITY_LOOKUP.areasWroclaw];

  const counts = vehicleCountByCompany(fleetVehicles);
  const byName = new Map<string, CompanyCatalogItem>();

  if (companiesEntity) {
    const rows = (await fetchAllEntityRecords(sdk, companiesEntity.id, { expansionLevel: 2 })).map(
      (r) => normalizeDpdRecord(r),
    );
    const nameField =
      resolveSchemaFieldName(companiesEntity, COMPANY_LABEL_FIELDS, /firm|company|kurier/i) ??
      'Name';

    for (const row of rows) {
      const id = String(row.Id ?? row.id ?? '');
      const name = blank(pickRecordLabel(row, [nameField, ...COMPANY_LABEL_FIELDS]));
      if (!name) continue;
      const areaLabel = blank(
        resolveRelationshipLabel(
          row,
          companiesEntity,
          areaNames.filter(Boolean) as string[],
          AREA_LABEL_FIELDS,
          AREA_REF_FIELDS,
          AREA_INLINE_FIELDS,
          areaMap,
        ),
      );
      byName.set(name, {
        id: id || name,
        name,
        areaLabel,
        vehicleCount: counts.get(name) ?? 0,
        raw: row,
      });
    }
  }

  for (const [name, n] of counts) {
    if (byName.has(name)) {
      const existing = byName.get(name)!;
      existing.vehicleCount = n;
      continue;
    }
    const partner = SYNTHETIC_B2B_PARTNERS.find((p) => p.company === name);
    byName.set(name, {
      id: `fleet-${name}`,
      name,
      areaLabel: partner?.area ?? '',
      vehicleCount: n,
      raw: { Id: `fleet-${name}`, Name: name },
    });
  }

  const companies = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const areaOptions = [...new Set(companies.map((c) => c.areaLabel).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pl'),
  );

  return {
    companies,
    areaOptions,
    totalCompanies: companies.length,
  };
}

export function filterCompanyCatalog(
  catalog: CompanyCatalogItem[],
  filters: { query: string; area: string },
): CompanyCatalogItem[] {
  const q = filters.query.trim().toLowerCase();
  return catalog.filter((c) => {
    if (filters.area && c.areaLabel !== filters.area) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.areaLabel.toLowerCase().includes(q)
    );
  });
}

export function vehiclesForCompany(
  fleet: VehicleCatalogItem[],
  companyName: string,
): VehicleCatalogItem[] {
  if (!companyName.trim()) return [];
  return fleet.filter((v) => v.companyLabel === companyName);
}
