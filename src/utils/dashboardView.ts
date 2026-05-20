import type { DashboardData } from '../services/dashboardAnalytics';
import type { DashboardFilterState } from './dashboardFilters';
import type { ServiceCategory } from './serviceCategories';

export type ChartKind = 'none' | 'donut' | 'bars' | 'columns' | 'cards';

export function showFuelChart(category: '' | ServiceCategory): boolean {
  return category === '' || category === 'Paliwo';
}

export interface DashboardViewPlan {
  showCategory: boolean;
  categoryKind: ChartKind;
  showServices: boolean;
  servicesKind: ChartKind;
  showMonth: boolean;
  monthKind: ChartKind;
  showRegion: boolean;
  regionKind: ChartKind;
  showCompany: boolean;
  companyKind: ChartKind;
  showVehicles: boolean;
  vehiclesKind: ChartKind;
  showHealth: boolean;
  healthKind: ChartKind;
  showDecision: boolean;
  decisionKind: ChartKind;
  showFuel: boolean;
  fuelKind: ChartKind;
}

function kindForShare(count: number, total: number): ChartKind {
  if (count <= 0 || total <= 0) return 'none';
  if (count === 1) return 'cards';
  if (count <= 6) return 'donut';
  return 'bars';
}

function kindForRank(count: number): ChartKind {
  if (count <= 0) return 'none';
  if (count <= 3) return 'cards';
  return 'bars';
}

function kindForTime(count: number): ChartKind {
  if (count <= 0) return 'none';
  if (count === 1) return 'cards';
  return 'columns';
}

export function planDashboardView(
  filters: DashboardFilterState,
  data: DashboardData,
): DashboardViewPlan {
  const { stats } = data;
  const cat = filters.category;
  const catCount = stats.byCategory.length;
  const catTotal = stats.byCategory.reduce((s, c) => s + c.total, 0);
  const decCount = stats.byDecision.length;
  const decTotal = stats.byDecision.reduce((s, d) => s + d.count, 0);
  const svcCount = stats.byService.length;

  const showCategory = !cat && catCount > 1;
  const showServices =
    svcCount > 0 && (cat !== '' || catCount <= 1);

  const fuelRows = data.fuelRegions.filter((r) => r.fuelCost > 0 || r.fuelCount > 0);

  return {
    showCategory,
    categoryKind: showCategory ? kindForShare(catCount, catTotal) : 'none',
    showServices,
    servicesKind: showServices
      ? svcCount <= 3
        ? 'cards'
        : svcCount <= 6
          ? 'donut'
          : 'bars'
      : 'none',
    showMonth: data.costsByMonth.length > 0,
    monthKind: kindForTime(data.costsByMonth.length),
    showRegion: !filters.area && data.costsByRegion.length > 0,
    regionKind: kindForRank(data.costsByRegion.length),
    showCompany: !filters.company && data.costsByCompany.length > 0,
    companyKind: kindForRank(data.costsByCompany.length),
    showVehicles: data.topVehicles.length > 0 && cat !== 'Ubezpieczenie',
    vehiclesKind: kindForRank(data.topVehicles.length),
    showHealth: !cat,
    healthKind: kindForShare(data.healthBuckets.length, data.healthBuckets.reduce((s, b) => s + b.count, 0)),
    showDecision: decCount > 1 && !cat,
    decisionKind: kindForShare(decCount, decTotal),
    showFuel: showFuelChart(cat) && fuelRows.length > 0,
    fuelKind: fuelRows.length <= 3 ? 'cards' : 'bars',
  };
}
