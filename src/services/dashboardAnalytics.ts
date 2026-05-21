import type { TableColumn } from '../config';
import { categorizeService } from '../utils/serviceCategories';
import {
  isUnassignedLabel,
  UNASSIGNED_REGION,
  type DashboardFilterState,
} from '../utils/dashboardFilters';
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

export interface UnassignedSummary {
  regionCost: number;
  regionCount: number;
  companyCost: number;
  companyCount: number;
  recordCount: number;
}

export interface DashboardKpiTrends {
  totalCostPct: number | null;
  claimCountPct: number | null;
  avgCostPct: number | null;
  flaggedDelta: number | null;
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
  fleetAvgVehicleCost: number;
  fleetAvgHealthScore: number | null;
  unassigned: UnassignedSummary;
  trends: DashboardKpiTrends | null;
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

function excludeUnassignedPoc(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
): DpdRecord[] {
  const meta = plateMeta(vehicles);
  return poc.filter((r) => {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const area = plate ? (meta.get(plate)?.area ?? UNASSIGNED_REGION) : UNASSIGNED_REGION;
    return area !== UNASSIGNED_REGION;
  });
}

function filterNamedRows(rows: NamedTotal[], hideUnassigned: boolean): NamedTotal[] {
  if (!hideUnassigned) return rows;
  return rows.filter((r) => !isUnassignedLabel(r.name));
}

function computeUnassignedSummary(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
): UnassignedSummary {
  const regions = aggregateByRegion(poc, vehicles);
  const companies = companiesFromFilteredPoc(vehicles, poc);
  const reg = regions.find((r) => r.name === UNASSIGNED_REGION);
  const comp = companies.find((c) => isUnassignedLabel(c.name));
  const meta = plateMeta(vehicles);
  let recordCount = 0;
  for (const r of poc) {
    const regField = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = regField === '—' ? '' : normalizeRegistration(regField);
    const area = plate ? (meta.get(plate)?.area ?? UNASSIGNED_REGION) : UNASSIGNED_REGION;
    if (area === UNASSIGNED_REGION) recordCount += 1;
  }
  return {
    regionCost: reg?.total ?? 0,
    regionCount: reg?.count ?? 0,
    companyCost: comp?.total ?? 0,
    companyCount: comp?.count ?? 0,
    recordCount,
  };
}

function fleetAvgHealth(vehicles: VehicleCatalogItem[]): number | null {
  const scored = vehicles.filter((v) => v.healthScore != null);
  if (!scored.length) return null;
  return scored.reduce((s, v) => s + (v.healthScore ?? 0), 0) / scored.length;
}

export function computeKpiTrends(
  current: FleetCostStats,
  previous: FleetCostStats | null,
): DashboardKpiTrends | null {
  if (!previous || previous.claimCount === 0) return null;
  const pct = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 1000) / 10;
  return {
    totalCostPct: pct(current.totalCost, previous.totalCost),
    claimCountPct: pct(current.claimCount, previous.claimCount),
    avgCostPct: pct(current.avgCost, previous.avgCost),
    flaggedDelta: current.flaggedCount - previous.flaggedCount,
  };
}

export function filterPocForDashboard(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  filters: DashboardFilterState,
): DpdRecord[] {
  let scoped = filters.hideUnassigned ? excludeUnassignedPoc(poc, vehicles) : poc;
  if (!filters.area && !filters.company && !filters.category) return scoped;
  const meta = plateMeta(vehicles);
  return scoped.filter((r) => {
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

/** Sumy firm z przefiltrowanego POC (spójne z slicerem i kategorią). */
function companiesFromFilteredPoc(
  vehicles: VehicleCatalogItem[],
  poc: DpdRecord[],
): NamedTotal[] {
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
  _companies: CompanyCatalogItem[],
  regionFuelRows: RegionFuelRow[],
  tableColumns: TableColumn[] | undefined,
  filters: DashboardFilterState,
  previousPoc?: DpdRecord[],
): DashboardData {
  const unassigned = computeUnassignedSummary(poc, vehicles);
  const showFuel = !filters.category || filters.category === 'Paliwo';
  let fuelRegions = showFuel
    ? regionFuelRows.filter((r) => {
        if (filters.area && r.region !== filters.area) return false;
        if (filters.hideUnassigned && isUnassignedLabel(r.region)) return false;
        return r.fuelCost > 0 || r.fuelCount > 0;
      })
    : [];

  const stats = statsForFleet(poc, tableColumns);
  const allVehicles = aggregateTopVehicles(poc, 200);
  const fleetAvgVehicleCost =
    allVehicles.length > 0
      ? allVehicles.reduce((s, v) => s + v.total, 0) / allVehicles.length
      : 0;

  const prevStats =
    previousPoc && previousPoc.length > 0 ? statsForFleet(previousPoc, tableColumns) : null;

  return {
    stats,
    costsByRegion: filterNamedRows(aggregateByRegion(poc, vehicles), filters.hideUnassigned),
    costsByCompany: filterNamedRows(
      companiesFromFilteredPoc(vehicles, poc),
      filters.hideUnassigned,
    ),
    costsByMonth: aggregateByMonth(poc),
    topVehicles: aggregateTopVehicles(poc),
    healthBuckets: healthDistribution(vehicles),
    fuelRegions,
    recordCount: poc.length,
    fleetAvgVehicleCost,
    fleetAvgHealthScore: fleetAvgHealth(vehicles),
    unassigned,
    trends: computeKpiTrends(stats, prevStats),
  };
}
