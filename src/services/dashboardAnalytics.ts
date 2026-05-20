import type { TableColumn } from '../config';
import { categorizeService } from '../utils/serviceCategories';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import { getRecordNumericAmount } from '../utils/filterRecords';
import type { DpdRecord } from '../utils/record';
import { getRecordDate, normalizeRegistration, pickField } from '../utils/record';
import type { RegionFuelRow } from './regionFuelAnalytics';
import { statsForFleet, type FleetCostStats } from './fleetStats';
import type { CompanyCatalogItem } from './companyCatalog';
import type { VehicleCatalogItem } from './vehicleCatalog';

export interface NamedTotal {
  name: string;
  total: number;
  count: number;
}

export interface MonthTotal {
  month: string;
  label: string;
  total: number;
  count: number;
}

export interface HealthBucket {
  label: string;
  count: number;
}

export interface DashboardData {
  stats: FleetCostStats;
  costsByRegion: NamedTotal[];
  costsByCompany: NamedTotal[];
  costsByMonth: MonthTotal[];
  topVehicles: NamedTotal[];
  healthBuckets: HealthBucket[];
  fuelRegions: RegionFuelRow[];
  recordCount: number;
}

function plateMeta(
  vehicles: VehicleCatalogItem[],
): Map<string, { area: string; company: string }> {
  const map = new Map<string, { area: string; company: string }>();
  for (const v of vehicles) {
    if (!v.registration.trim()) continue;
    map.set(normalizeRegistration(v.registration), {
      area: v.areaLabel?.trim() || 'Nieprzypisany',
      company: v.companyLabel?.trim() || 'Nieprzypisana',
    });
  }
  return map;
}

export function filterPocForDashboard(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  filters: DashboardFilterState,
): DpdRecord[] {
  if (!filters.area && !filters.company && !filters.category) return poc;
  const meta = plateMeta(vehicles);
  return poc.filter((r) => {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const m = plate ? meta.get(plate) : undefined;
    const area = m?.area ?? 'Nieprzypisany';
    const company = m?.company ?? 'Nieprzypisana';
    if (filters.area && area !== filters.area) return false;
    if (filters.company && company !== filters.company) return false;
    if (filters.category) {
      const svc = pickField(r, 'serviceName', 'ServiceName');
      const st = pickField(r, 'serviceType', 'ServiceType');
      const cat = categorizeService(svc === '—' ? '' : svc, st === '—' ? '' : st);
      if (cat !== filters.category) return false;
    }
    return true;
  });
}

function aggregateByMonth(poc: DpdRecord[]): MonthTotal[] {
  const map = new Map<string, { total: number; count: number; label: string }>();
  for (const r of poc) {
    const d = getRecordDate(r);
    if (!d) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' });
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = map.get(month) ?? { total: 0, count: 0, label };
    entry.total += amount;
    entry.count += 1;
    map.set(month, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, label: v.label, total: v.total, count: v.count }));
}

function aggregateByRegion(poc: DpdRecord[], vehicles: VehicleCatalogItem[]): NamedTotal[] {
  const meta = plateMeta(vehicles);
  const map = new Map<string, { total: number; count: number }>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const region = plate ? (meta.get(plate)?.area ?? 'Nieprzypisany') : 'Nieprzypisany';
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = map.get(region) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    map.set(region, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);
}

function aggregateTopVehicles(poc: DpdRecord[], limit = 8): NamedTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg === '—' || !reg.trim()) continue;
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = map.get(reg) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    map.set(reg, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function healthDistribution(vehicles: VehicleCatalogItem[]): HealthBucket[] {
  const buckets: HealthBucket[] = [
    { label: 'A (80–100)', count: 0 },
    { label: 'B (65–79)', count: 0 },
    { label: 'C (50–64)', count: 0 },
    { label: 'D (35–49)', count: 0 },
    { label: 'F (<35)', count: 0 },
    { label: 'Brak oceny', count: 0 },
  ];
  for (const v of vehicles) {
    const s = v.healthScore;
    if (s == null || !v.healthGrade) {
      buckets[5]!.count += 1;
      continue;
    }
    if (s >= 80) buckets[0]!.count += 1;
    else if (s >= 65) buckets[1]!.count += 1;
    else if (s >= 50) buckets[2]!.count += 1;
    else if (s >= 35) buckets[3]!.count += 1;
    else buckets[4]!.count += 1;
  }
  return buckets.filter((b) => b.count > 0);
}

function companiesFromFleet(
  companies: CompanyCatalogItem[],
  vehicles: VehicleCatalogItem[],
  poc: DpdRecord[],
): NamedTotal[] {
  if (companies.length) {
    return companies
      .filter((c) => c.totalCost != null && c.totalCost > 0)
      .map((c) => ({
        name: c.name,
        total: c.totalCost ?? 0,
        count: c.vehicleCount,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }
  const map = new Map<string, { total: number; count: number }>();
  const meta = plateMeta(vehicles);
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const company = plate ? (meta.get(plate)?.company ?? 'Nieprzypisana') : 'Nieprzypisana';
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = map.get(company) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    map.set(company, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

export function buildDashboardData(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  companies: CompanyCatalogItem[],
  regionFuelRows: RegionFuelRow[],
  tableColumns: TableColumn[] | undefined,
): DashboardData {
  return {
    stats: statsForFleet(poc, tableColumns),
    costsByRegion: aggregateByRegion(poc, vehicles),
    costsByCompany: companiesFromFleet(companies, vehicles, poc),
    costsByMonth: aggregateByMonth(poc),
    topVehicles: aggregateTopVehicles(poc),
    healthBuckets: healthDistribution(vehicles),
    fuelRegions: regionFuelRows,
    recordCount: poc.length,
  };
}
