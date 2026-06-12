import type { TableColumn } from '../config';
import { categorizeService } from '../utils/serviceCategories';
import {
  buildDashboardData,
  computeKpiTrends,
  computeUnassignedSummary,
  filterPocForDashboard,
  type DashboardData,
  type MonthTotal,
  type NamedTotal,
} from './dashboardAnalytics';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import { getRecordNumericAmount, isLikelyFlagged } from '../utils/filterRecords';
import type { DpdRecord } from '../utils/record';
import { getRecordDate, normalizeRegistration, pickField } from '../utils/record';
import { statsForFleet } from './fleetStats';
import type { RegionFuelRow } from './regionFuelAnalytics';
import type { CompanyCatalogItem } from './companyCatalog';
import type { VehicleCatalogItem } from './vehicleCatalog';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';

const PENDING_DAYS = 7;
const TREND_MONTHS = 6;

export type InsightRole = 'manager' | 'finance' | 'board';

export interface InsightAlert {
  id: string;
  icon: 'warn' | 'flag' | 'clock' | 'car';
  title: string;
  description: string;
  metric: string;
  roles: InsightRole[];
}

export interface InsightKpi {
  id: string;
  label: string;
  value: string;
  trendPct: number | null;
  budgetPct: number | null;
  budgetLabel?: string;
  subtext?: string;
  roles: InsightRole[];
  highlight?: boolean;
}

export interface MonthCategorySlice {
  month: string;
  label: string;
  categories: { category: string; total: number }[];
  total: number;
}

export interface MonthCount {
  month: string;
  label: string;
  count: number;
}

export interface MonthHealthShare {
  month: string;
  label: string;
  aPct: number;
  bPct: number;
  cPct: number;
  otherPct: number;
}

export interface CompanyInsightRow extends NamedTotal {
  avgPerClaim: number;
}

export interface RegionDualRow {
  name: string;
  total: number;
  vehicleCount: number;
  costPerVehicle: number;
}

export interface VehicleInsightRow extends NamedTotal {
  healthScore: number | null;
  healthGrade: string | null;
}

export interface FuelScatterPoint {
  region: string;
  fuelCost: number;
  vehicleCount: number;
  drivenKm: number;
}

export interface InsightsDistribution {
  byCategory: { category: string; label: string; total: number; count: number; color: string }[];
  regionsDual: RegionDualRow[];
  topCompanies: CompanyInsightRow[];
  topVehicles: VehicleInsightRow[];
  fuelScatter: FuelScatterPoint[];
  settlementStatus: { label: string; count: number }[];
  pendingOlderThanDays: number;
}

export interface InsightsTrends {
  costsByMonth: MonthTotal[];
  costsByMonthCategory: MonthCategorySlice[];
  budgetMonthly: number;
  anomaliesByMonth: MonthCount[];
  healthByMonth: MonthHealthShare[];
}

export interface InsightsData {
  periodRecordCount: number;
  alerts: InsightAlert[];
  kpis: InsightKpi[];
  trends: InsightsTrends;
  distribution: InsightsDistribution;
  dashboardBase: DashboardData;
}

function recordStatus(r: DpdRecord, _tableColumns?: TableColumn[]): string {
  return pickField(r, 'decision', 'Status', 'status');
}

function isApprovedStatus(status: string): boolean {
  return /approv|zatwier/i.test(status);
}

function isPendingStatus(status: string): boolean {
  if (isApprovedStatus(status)) return false;
  return /oczek|pend|clarif|wyjaśn/i.test(status) || status === '—' || status === 'Brak statusu';
}

function isFlaggedStatus(status: string): boolean {
  return /flag|anomal/i.test(status);
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function pocInLastMonths(poc: DpdRecord[], months: number, now = new Date()): DpdRecord[] {
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const fromMs = start.getTime();
  return poc.filter((r) => {
    const d = getRecordDate(r);
    return d && d.getTime() >= fromMs;
  });
}

function aggregateMonths(poc: DpdRecord[], maxMonths = TREND_MONTHS): MonthTotal[] {
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
    .slice(-maxMonths)
    .map(([month, v]) => ({ month, label: v.label, total: v.total, count: v.count }));
}

function aggregateMonthCategories(poc: DpdRecord[]): MonthCategorySlice[] {
  const byMonth = new Map<string, Map<string, number>>();
  const labels = new Map<string, string>();
  for (const r of poc) {
    const d = getRecordDate(r);
    if (!d) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.set(month, d.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' }));
    const svc = pickField(r, 'serviceName', 'ServiceName');
    const st = pickField(r, 'serviceType', 'ServiceType');
    const cat = categorizeService(svc === '—' ? '' : svc, st === '—' ? '' : st);
    const amount = getRecordNumericAmount(r) ?? 0;
    const m = byMonth.get(month) ?? new Map();
    m.set(cat, (m.get(cat) ?? 0) + amount);
    byMonth.set(month, m);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-TREND_MONTHS)
    .map(([month, cats]) => {
      const categories = [...cats.entries()].map(([category, total]) => ({ category, total }));
      const total = categories.reduce((s, c) => s + c.total, 0);
      return { month, label: labels.get(month) ?? month, categories, total };
    });
}

function aggregateAnomaliesByMonth(
  poc: DpdRecord[],
  tableColumns?: TableColumn[],
): MonthCount[] {
  const map = new Map<string, { count: number; label: string }>();
  for (const r of poc) {
    if (!isLikelyFlagged(r, tableColumns) && !isFlaggedStatus(recordStatus(r, tableColumns))) continue;
    const d = getRecordDate(r);
    if (!d) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' });
    const entry = map.get(month) ?? { count: 0, label };
    entry.count += 1;
    map.set(month, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-TREND_MONTHS)
    .map(([month, v]) => ({ month, label: v.label, count: v.count }));
}

function activePlatesInPoc(poc: DpdRecord[]): Set<string> {
  const set = new Set<string>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg !== '—' && reg.trim()) set.add(normalizeRegistration(reg));
  }
  return set;
}

function regionsWithCostPerVehicle(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
): RegionDualRow[] {
  const meta = new Map<string, { area: string }>();
  for (const v of vehicles) {
    if (!v.registration.trim()) continue;
    meta.set(normalizeRegistration(v.registration), {
      area: v.areaLabel?.trim() || 'Nieprzypisany',
    });
  }
  const cost = new Map<string, number>();
  const plates = new Map<string, Set<string>>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const region = plate ? (meta.get(plate)?.area ?? 'Nieprzypisany') : 'Nieprzypisany';
    const amount = getRecordNumericAmount(r) ?? 0;
    cost.set(region, (cost.get(region) ?? 0) + amount);
    const set = plates.get(region) ?? new Set();
    if (plate) set.add(plate);
    plates.set(region, set);
  }
  return [...cost.entries()]
    .map(([name, total]) => {
      const vehicleCount = plates.get(name)?.size ?? 0;
      return {
        name,
        total,
        vehicleCount,
        costPerVehicle: vehicleCount > 0 ? total / vehicleCount : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function companiesWithAvgClaim(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
): CompanyInsightRow[] {
  const meta = new Map<string, string>();
  for (const v of vehicles) {
    if (!v.registration.trim()) continue;
    meta.set(normalizeRegistration(v.registration), v.companyLabel?.trim() || 'Nieprzypisana');
  }
  const map = new Map<string, { total: number; count: number }>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    const plate = reg === '—' ? '' : normalizeRegistration(reg);
    const company = plate ? (meta.get(plate) ?? 'Nieprzypisana') : 'Nieprzypisana';
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = map.get(company) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    map.set(company, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      total: v.total,
      count: v.count,
      avgPerClaim: v.count > 0 ? v.total / v.count : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function vehiclesWithHealth(
  poc: DpdRecord[],
  vehicles: VehicleCatalogItem[],
): VehicleInsightRow[] {
  const cost = new Map<string, { total: number; count: number }>();
  for (const r of poc) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg === '—' || !reg.trim()) continue;
    const plate = normalizeRegistration(reg);
    const amount = getRecordNumericAmount(r) ?? 0;
    const entry = cost.get(plate) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    cost.set(plate, entry);
  }
  const byPlate = new Map(vehicles.map((v) => [normalizeRegistration(v.registration), v]));
  return [...cost.entries()]
    .map(([plate, v]) => {
      const veh = byPlate.get(plate);
      return {
        name: veh?.registration ?? plate,
        total: v.total,
        count: v.count,
        healthScore: veh?.healthScore ?? null,
        healthGrade: veh?.healthGrade ?? null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function healthShareSnapshot(vehicles: VehicleCatalogItem[]): MonthHealthShare {
  const total = vehicles.length || 1;
  let a = 0;
  let b = 0;
  let c = 0;
  for (const v of vehicles) {
    const s = v.healthScore ?? 0;
    if (s >= 80) a += 1;
    else if (s >= 65) b += 1;
    else if (s >= 50) c += 1;
  }
  const other = total - a - b - c;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = now.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' });
  return {
    month,
    label,
    aPct: Math.round((a / total) * 100),
    bPct: Math.round((b / total) * 100),
    cPct: Math.round((c / total) * 100),
    otherPct: Math.round((other / total) * 100),
  };
}

export function buildInsightsData(
  periodPoc: DpdRecord[],
  previousPoc: DpdRecord[],
  allPocForTrends: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  companies: CompanyCatalogItem[],
  regionFuelRows: RegionFuelRow[],
  tableColumns: TableColumn[] | undefined,
  filters: DashboardFilterState,
): InsightsData {
  const dashboardBase = buildDashboardData(
    periodPoc,
    vehicles,
    companies,
    regionFuelRows,
    tableColumns,
    filters,
    previousPoc,
  );

  const stats = statsForFleet(periodPoc, tableColumns);
  const prevStats =
    previousPoc.length > 0 ? statsForFleet(previousPoc, tableColumns) : null;
  const trends = computeKpiTrends(stats, prevStats);
  const unassigned = computeUnassignedSummary(periodPoc, vehicles);

  const trendPoc = pocInLastMonths(allPocForTrends, TREND_MONTHS);
  const months = aggregateMonths(trendPoc);
  const budgetMonthly =
    prevStats && prevStats.totalCost > 0
      ? prevStats.totalCost * 1.05
      : months.length >= 2
        ? months.slice(-3).reduce((s, m) => s + m.total, 0) / Math.min(3, months.length)
        : stats.totalCost;

  const activePlates = activePlatesInPoc(periodPoc);
  const activeVehicleCount = Math.max(activePlates.size, 1);
  const costPerVehicle = stats.totalCost / activeVehicleCount;
  const prevActiveCount = Math.max(activePlatesInPoc(previousPoc).size, 1);
  const prevCostPerVehicle =
    prevStats && prevStats.totalCost > 0 ? prevStats.totalCost / prevActiveCount : 0;

  let totalKm = 0;
  let fuelCostSum = 0;
  for (const row of regionFuelRows) {
    totalKm += row.drivenKm;
    fuelCostSum += row.fuelCost;
  }
  const costPerKm = totalKm > 0 ? stats.totalCost / totalKm : null;

  let approved = 0;
  let pending = 0;
  let pendingOld = 0;
  const now = Date.now();
  for (const r of periodPoc) {
    const st = recordStatus(r, tableColumns);
    if (isApprovedStatus(st)) approved += 1;
    if (isPendingStatus(st)) {
      pending += 1;
      const d = getRecordDate(r);
      if (d && now - d.getTime() > PENDING_DAYS * 86400000) pendingOld += 1;
    }
  }
  const approvalRate = periodPoc.length > 0 ? Math.round((approved / periodPoc.length) * 100) : 0;

  const fleetPlates = new Set(
    vehicles.map((v) => normalizeRegistration(v.registration)).filter(Boolean),
  );
  const inactiveCount = [...fleetPlates].filter((p) => !activePlates.has(p)).length;

  const healthA = vehicles.filter((v) => (v.healthScore ?? 0) >= 80).length;
  const healthAPct = vehicles.length > 0 ? Math.round((healthA / vehicles.length) * 100) : 0;
  const prevFlagged = prevStats?.flaggedCount ?? 0;

  const alerts: InsightAlert[] = [];

  if (unassigned.recordCount > 0) {
    alerts.push({
      id: 'unassigned',
      icon: 'warn',
      title: 'Nieprzypisane rozliczenia',
      description: 'Brak regionu lub firmy — wymaga ręcznego przypisania.',
      metric: `${unassigned.recordCount} szt. · ${unassigned.regionCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`,
      roles: ['manager', 'finance'],
    });
  }

  if (stats.flaggedCount > 0) {
    alerts.push({
      id: 'flags',
      icon: 'flag',
      title: 'Flagi / anomalie',
      description: 'Rozliczenia z podejrzeniem nadużycia lub wysokim kosztem.',
      metric: `${stats.flaggedCount} szt.`,
      roles: ['manager', 'finance'],
    });
  }

  if (pendingOld > 0) {
    alerts.push({
      id: 'pending',
      icon: 'clock',
      title: 'Oczekujące zatwierdzenia',
      description: `Status oczekujący dłużej niż ${PENDING_DAYS} dni.`,
      metric: `${pendingOld} z ${pending} oczekujących`,
      roles: ['finance'],
    });
  }

  if (inactiveCount > 0) {
    alerts.push({
      id: 'inactive',
      icon: 'car',
      title: 'Pojazdy bez aktywności',
      description: 'Brak rozliczeń POC w wybranym okresie.',
      metric: `${inactiveCount} pojazdów`,
      roles: ['manager'],
    });
  }

  const kpis: InsightKpi[] = [
    {
      id: 'total',
      label: 'Suma kosztów',
      value: `${stats.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`,
      trendPct: trends?.totalCostPct ?? null,
      budgetPct: budgetMonthly > 0 ? Math.round((stats.totalCost / budgetMonthly) * 100) : null,
      budgetLabel: `Plan (ref.): ${budgetMonthly.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`,
      roles: ['board', 'finance'],
    },
    {
      id: 'cpv',
      label: 'Koszt / pojazd',
      value: `${costPerVehicle.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN`,
      trendPct: prevStats ? pctDelta(costPerVehicle, prevCostPerVehicle) : null,
      budgetPct: null,
      subtext: `${activeVehicleCount} aktywnych pojazdów w okresie`,
      roles: ['manager', 'board'],
    },
    {
      id: 'cpk',
      label: 'Koszt / km',
      value:
        costPerKm != null
          ? `${costPerKm.toFixed(2)} PLN/km`
          : '—',
      trendPct: null,
      budgetPct: null,
      subtext:
        totalKm > 0
          ? `Na podstawie ${totalKm.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} km (paliwo/przebieg)`
          : 'Brak km w okresie — uzupełnij przebieg na POC',
      roles: ['manager', 'board'],
    },
    {
      id: 'approval',
      label: 'Wskaźnik zatwierdzenia',
      value: `${approvalRate}%`,
      trendPct: null,
      budgetPct: null,
      subtext: `${approved} / ${periodPoc.length} rozliczeń`,
      roles: ['finance'],
    },
    {
      id: 'health',
      label: 'Health A (80–100)',
      value: `${healthAPct}%`,
      trendPct: null,
      budgetPct: null,
      subtext: `${healthA} z ${vehicles.length} pojazdów floty`,
      roles: ['manager', 'board'],
    },
    {
      id: 'anomalies',
      label: 'Liczba anomalii',
      value: String(stats.flaggedCount),
      trendPct: trends?.flaggedDelta != null && prevFlagged > 0
        ? pctDelta(stats.flaggedCount, prevFlagged)
        : trends?.flaggedDelta != null
          ? (stats.flaggedCount > prevFlagged ? 100 : stats.flaggedCount < prevFlagged ? -100 : 0)
          : null,
      budgetPct: null,
      subtext:
        trends?.flaggedDelta != null
          ? `${trends.flaggedDelta >= 0 ? '+' : ''}${trends.flaggedDelta} vs poprz. okres`
          : undefined,
      roles: ['finance', 'board'],
      highlight: stats.flaggedCount > 0,
    },
  ];

  const byCategory = stats.byCategory.map((c) => {
    const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
    return {
      category: c.category,
      label: meta?.label ?? c.category,
      total: c.total,
      count: c.count,
      color: meta?.color ?? '#dc0032',
    };
  });

  const distribution: InsightsDistribution = {
    byCategory,
    regionsDual: regionsWithCostPerVehicle(periodPoc, vehicles).filter(
      (r) => !filters.hideUnassigned || r.name !== 'Nieprzypisany',
    ),
    topCompanies: companiesWithAvgClaim(periodPoc, vehicles),
    topVehicles: vehiclesWithHealth(periodPoc, vehicles),
    fuelScatter: regionFuelRows
      .filter((r) => r.fuelCost > 0 || r.vehicleCount > 0)
      .map((r) => ({
        region: r.region,
        fuelCost: r.fuelCost,
        vehicleCount: r.vehicleCount,
        drivenKm: r.drivenKm,
      })),
    settlementStatus: stats.byDecision,
    pendingOlderThanDays: pendingOld,
  };

  const healthSnap = healthShareSnapshot(vehicles);

  return {
    periodRecordCount: periodPoc.length,
    alerts,
    kpis,
    trends: {
      costsByMonth: months,
      costsByMonthCategory: aggregateMonthCategories(trendPoc),
      budgetMonthly,
      anomaliesByMonth: aggregateAnomaliesByMonth(trendPoc, tableColumns),
      healthByMonth:
        months.length > 0
          ? months.map((m) => ({ ...healthSnap, month: m.month, label: m.label }))
          : [healthSnap],
    },
    distribution,
    dashboardBase,
  };
}

/** POC w okresie slicera, bez filtra kategorii dashboardu. */
export function pocForInsights(
  periodFiltered: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  filters: Pick<DashboardFilterState, 'hideUnassigned' | 'area' | 'company'>,
): DpdRecord[] {
  return filterPocForDashboard(periodFiltered, vehicles, {
    ...filters,
    category: '',
  });
}
