import { useMemo, useState } from 'react';
import type { MonthTotal } from '../../services/dashboardAnalytics';
import type {
  InsightRole,
  MonthCategorySlice,
  MonthCount,
  MonthHealthShare,
  RegionDualRow,
  VehicleInsightRow,
} from '../../services/insightsAnalytics';
import type { RegionFuelRow } from '../../services/regionFuelAnalytics';
import { SERVICE_CATEGORIES, type ServiceCategory } from '../../utils/serviceCategories';
import {
  COMMON_SORTS,
  filterByHealthGrade,
  sortByLabel,
  sortByMonth,
  sortByName,
  sortByNumeric,
  type HealthGradeFilter,
} from '../../utils/insightChartSort';
import { CategoryShareBars, GroupedFuelByRegion, StackedStatusBar, TopVehiclesWithAvg } from '../DashboardCharts';
import { ChartViewControls } from './ChartViewControls';

const ROLE_LABEL: Record<InsightRole, string> = {
  manager: 'Manager',
  finance: 'Księgowość',
  board: 'Zarząd',
};

const HEALTH_SORTS = [
  { id: 'score-desc', label: 'Od najlepszego (score)' },
  { id: 'score-asc', label: 'Od najgorszego (score)' },
  { id: 'total-desc', label: 'Koszt malejąco' },
  { id: 'total-asc', label: 'Koszt rosnąco' },
  COMMON_SORTS.nameAsc,
  COMMON_SORTS.nameDesc,
];

const VEHICLE_COST_SORTS = [
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
  COMMON_SORTS.nameAsc,
  COMMON_SORTS.nameDesc,
];

const COMPANY_SORTS = [
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
  COMMON_SORTS.countDesc,
  COMMON_SORTS.countAsc,
  { id: 'avg-desc', label: 'Śr. / rozliczenie malejąco' },
  { id: 'avg-asc', label: 'Śr. / rozliczenie rosnąco' },
  COMMON_SORTS.nameAsc,
];

const REGION_SORTS = [
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
  { id: 'cpv-desc', label: 'Koszt / pojazd malejąco' },
  { id: 'cpv-asc', label: 'Koszt / pojazd rosnąco' },
  COMMON_SORTS.nameAsc,
];

const CATEGORY_SORTS = [
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
  COMMON_SORTS.countDesc,
  COMMON_SORTS.countAsc,
  { id: 'label-asc', label: 'Kategoria A→Z' },
  { id: 'label-desc', label: 'Kategoria Z→A' },
];

const MONTH_VALUE_SORTS = [
  COMMON_SORTS.chronoAsc,
  COMMON_SORTS.chronoDesc,
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
];

const MONTH_COUNT_SORTS = [
  COMMON_SORTS.chronoAsc,
  COMMON_SORTS.chronoDesc,
  COMMON_SORTS.countDesc,
  COMMON_SORTS.countAsc,
];

const HEALTH_TREND_SORTS = [
  COMMON_SORTS.chronoAsc,
  COMMON_SORTS.chronoDesc,
  { id: 'a-desc', label: 'Udział A malejąco' },
  { id: 'a-asc', label: 'Udział A rosnąco' },
];

const FUEL_SORTS = [
  COMMON_SORTS.valueDesc,
  COMMON_SORTS.valueAsc,
  COMMON_SORTS.countDesc,
  COMMON_SORTS.countAsc,
  { id: 'cpv-desc', label: 'PLN / pojazd malejąco' },
  { id: 'cpv-asc', label: 'PLN / pojazd rosnąco' },
  COMMON_SORTS.nameAsc,
];

const SETTLEMENT_SORTS = [
  COMMON_SORTS.countDesc,
  COMMON_SORTS.countAsc,
  { id: 'label-asc', label: 'Status A→Z' },
  { id: 'label-desc', label: 'Status Z→A' },
];

function sortVehicles(rows: VehicleInsightRow[], sort: string): VehicleInsightRow[] {
  switch (sort) {
    case 'score-desc':
      return sortByNumeric(rows, (r) => r.healthScore ?? -1, 'desc');
    case 'score-asc':
      return sortByNumeric(rows, (r) => r.healthScore ?? 999, 'asc');
    case 'total-asc':
      return sortByNumeric(rows, (r) => r.total, 'asc');
    case 'name-desc':
      return sortByName(rows, 'desc');
    case 'name-asc':
      return sortByName(rows, 'asc');
    default:
      return sortByNumeric(rows, (r) => r.total, 'desc');
  }
}

function sortCompanies(
  rows: { name: string; total: number; count: number; avgPerClaim: number }[],
  sort: string,
) {
  switch (sort) {
    case 'total-asc':
      return sortByNumeric(rows, (r) => r.total, 'asc');
    case 'count-desc':
      return sortByNumeric(rows, (r) => r.count, 'desc');
    case 'count-asc':
      return sortByNumeric(rows, (r) => r.count, 'asc');
    case 'avg-desc':
      return sortByNumeric(rows, (r) => r.avgPerClaim, 'desc');
    case 'avg-asc':
      return sortByNumeric(rows, (r) => r.avgPerClaim, 'asc');
    case 'name-asc':
      return sortByName(rows, 'asc');
    default:
      return sortByNumeric(rows, (r) => r.total, 'desc');
  }
}

function sortRegions(rows: RegionDualRow[], sort: string) {
  switch (sort) {
    case 'total-asc':
      return sortByNumeric(rows, (r) => r.total, 'asc');
    case 'cpv-desc':
      return sortByNumeric(rows, (r) => r.costPerVehicle, 'desc');
    case 'cpv-asc':
      return sortByNumeric(rows, (r) => r.costPerVehicle, 'asc');
    case 'name-asc':
      return sortByName(rows, 'asc');
    default:
      return sortByNumeric(rows, (r) => r.total, 'desc');
  }
}

function sortCategories(
  items: { category: string; label: string; total: number; count: number }[],
  sort: string,
) {
  switch (sort) {
    case 'total-asc':
      return sortByNumeric(items, (c) => c.total, 'asc');
    case 'count-desc':
      return sortByNumeric(items, (c) => c.count, 'desc');
    case 'count-asc':
      return sortByNumeric(items, (c) => c.count, 'asc');
    case 'label-asc':
      return [...items].sort((a, b) => a.label.localeCompare(b.label, 'pl'));
    case 'label-desc':
      return [...items].sort((a, b) => b.label.localeCompare(a.label, 'pl'));
    default:
      return sortByNumeric(items, (c) => c.total, 'desc');
  }
}

function sortFuelRegions(rows: RegionFuelRow[], sort: string) {
  switch (sort) {
    case 'total-asc':
      return sortByNumeric(rows, (r) => r.fuelCost, 'asc');
    case 'count-desc':
      return sortByNumeric(rows, (r) => r.fuelCount, 'desc');
    case 'count-asc':
      return sortByNumeric(rows, (r) => r.fuelCount, 'asc');
    case 'cpv-desc':
      return sortByNumeric(rows, (r) => r.avgFuelCostPerVehicle, 'desc');
    case 'cpv-asc':
      return sortByNumeric(rows, (r) => r.avgFuelCostPerVehicle, 'asc');
    case 'name-asc':
      return [...rows].sort((a, b) => a.region.localeCompare(b.region, 'pl'));
    default:
      return sortByNumeric(rows, (r) => r.fuelCost, 'desc');
  }
}

export function RoleTags({ roles }: { roles: InsightRole[] }) {
  return (
    <div className="insight-role-tags">
      {roles.map((r) => (
        <span key={r} className={`insight-role insight-role-${r}`}>
          {ROLE_LABEL[r]}
        </span>
      ))}
    </div>
  );
}

export function CostsTrendChart({
  months,
  budgetMonthly,
  byMonthCategory,
}: {
  months: MonthTotal[];
  budgetMonthly: number;
  byMonthCategory: MonthCategorySlice[];
}) {
  const [sort, setSort] = useState('chrono-asc');
  const sorted = useMemo(() => {
    if (sort === 'chrono-desc') return sortByMonth(months, 'desc');
    if (sort === 'total-desc') return sortByNumeric(months, (m) => m.total, 'desc');
    if (sort === 'total-asc') return sortByNumeric(months, (m) => m.total, 'asc');
    return sortByMonth(months, 'asc');
  }, [months, sort]);

  if (!sorted.length) return null;
  const max = Math.max(...sorted.map((m) => m.total), budgetMonthly, 1);

  return (
    <div className="dash-chart-card dash-chart-wide">
      <ChartViewControls sortOptions={MONTH_VALUE_SORTS} sort={sort} onSortChange={setSort} />
      <h4 className="dash-chart-title">Koszty w czasie (6 mies.)</h4>
      <p className="dash-chart-desc">
        Słupki: suma miesięczna · przerywana linia: plan referencyjny (
        {budgetMonthly.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN)
      </p>
      <div className="insight-trend-columns">
        {sorted.map((m) => {
          const h = Math.max(8, Math.round((m.total / max) * 120));
          const budgetH = Math.round((budgetMonthly / max) * 120);
          const slice = byMonthCategory.find((x) => x.month === m.month);
          return (
            <div key={m.month} className="insight-trend-col">
              <div className="insight-trend-col-bars" style={{ height: 128 }}>
                <div className="insight-budget-line" style={{ bottom: `${budgetH}px` }} title="Plan" />
                <div className="insight-trend-stack" style={{ height: `${h}px` }}>
                  {slice?.categories.map((c) => {
                    const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
                    const pct = m.total > 0 ? (c.total / m.total) * 100 : 0;
                    return (
                      <div
                        key={c.category}
                        className="insight-trend-stack-seg"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: meta?.color ?? '#888',
                        }}
                        title={`${meta?.label ?? c.category}: ${c.total.toFixed(0)} PLN`}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="dash-column-label">{m.label}</span>
              <span className="dash-column-value">{m.total.toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnomalyTrendChart({ rows }: { rows: MonthCount[] }) {
  const [sort, setSort] = useState('chrono-asc');
  const sorted = useMemo(() => {
    if (sort === 'chrono-desc') return sortByMonth(rows, 'desc');
    if (sort === 'count-desc') return sortByNumeric(rows, (r) => r.count, 'desc');
    if (sort === 'count-asc') return sortByNumeric(rows, (r) => r.count, 'asc');
    return sortByMonth(rows, 'asc');
  }, [rows, sort]);

  if (!sorted.length) return null;
  const max = Math.max(...sorted.map((r) => r.count), 1);

  return (
    <div className="dash-chart-card">
      <ChartViewControls sortOptions={MONTH_COUNT_SORTS} sort={sort} onSortChange={setSort} />
      <h4 className="dash-chart-title">Trend anomalii</h4>
      <div className="dash-column-chart">
        {sorted.map((r) => {
          const h = Math.max(8, Math.round((r.count / max) * 100));
          return (
            <div key={r.month} className="dash-column" title={`${r.label}: ${r.count}`}>
              <div className="dash-column-bar-wrap">
                <div className="dash-column-bar dash-bar-alert" style={{ height: `${h}px` }} />
              </div>
              <span className="dash-column-label">{r.label}</span>
              <span className="dash-column-value">{r.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HealthTrendChart({ rows }: { rows: MonthHealthShare[] }) {
  const [sort, setSort] = useState('chrono-asc');
  const sorted = useMemo(() => {
    if (sort === 'chrono-desc') return sortByMonth(rows, 'desc');
    if (sort === 'a-desc') return sortByNumeric(rows, (r) => r.aPct, 'desc');
    if (sort === 'a-asc') return sortByNumeric(rows, (r) => r.aPct, 'asc');
    return sortByMonth(rows, 'asc');
  }, [rows, sort]);

  if (!sorted.length) return null;

  return (
    <div className="dash-chart-card">
      <ChartViewControls sortOptions={HEALTH_TREND_SORTS} sort={sort} onSortChange={setSort} />
      <h4 className="dash-chart-title">Health score w czasie</h4>
      <p className="dash-chart-desc">
        Udział pojazdów A/B/C (snapshot bieżącej floty — brak historii health w Fabric).
      </p>
      <div className="insight-health-trend">
        {sorted.map((r) => (
          <div key={r.month} className="insight-health-col">
            <div className="insight-health-stack" title={`${r.label}`}>
              <div className="insight-health-a" style={{ height: `${r.aPct}%` }} />
              <div className="insight-health-b" style={{ height: `${r.bPct}%` }} />
              <div className="insight-health-c" style={{ height: `${r.cPct}%` }} />
            </div>
            <span className="dash-column-label">{r.label}</span>
            <span className="dash-column-value">{r.aPct}% A</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RegionDualChart({ rows }: { rows: RegionDualRow[] }) {
  const [sort, setSort] = useState('total-desc');
  const sorted = useMemo(() => sortRegions(rows, sort), [rows, sort]);

  if (!sorted.length) return null;
  const maxCost = Math.max(...sorted.map((r) => r.total), 1);
  const maxCpv = Math.max(...sorted.map((r) => r.costPerVehicle), 1);

  return (
    <div className="dash-chart-card">
      <ChartViewControls sortOptions={REGION_SORTS} sort={sort} onSortChange={setSort} />
      <h4 className="dash-chart-title">Koszty wg regionu</h4>
      <p className="dash-chart-desc">Ciemny pasek: suma PLN · jasny: koszt / pojazd w regionie</p>
      <ul className="dash-labeled-bars">
        {sorted.map((r) => (
          <li key={r.name} className="dash-labeled-bar-row insight-dual-row">
            <span className="dash-labeled-bar-label">{r.name}</span>
            <div className="insight-dual-tracks">
              <div className="dash-labeled-bar-track">
                <div
                  className="dash-labeled-bar-fill dash-bar-neutral"
                  style={{ width: `${Math.round((r.total / maxCost) * 100)}%` }}
                />
              </div>
              <div className="dash-labeled-bar-track insight-dual-secondary">
                <div
                  className="dash-labeled-bar-fill dash-bar-fill"
                  style={{ width: `${Math.round((r.costPerVehicle / maxCpv) * 100)}%` }}
                />
              </div>
            </div>
            <span className="dash-labeled-bar-end">
              {r.total.toFixed(0)} PLN · {r.costPerVehicle.toFixed(0)}/poj.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompaniesTable({
  rows,
}: {
  rows: { name: string; total: number; count: number; avgPerClaim: number }[];
}) {
  const [sort, setSort] = useState('total-desc');
  const sorted = useMemo(() => sortCompanies(rows, sort), [rows, sort]);

  if (!sorted.length) return null;

  return (
    <div className="dash-chart-card">
      <ChartViewControls sortOptions={COMPANY_SORTS} sort={sort} onSortChange={setSort} />
      <h4 className="dash-chart-title">Top firmy kurierskie</h4>
      <div className="table-wrap table-wrap-nested">
        <table className="fleet-table">
          <thead>
            <tr>
              <th>Firma</th>
              <th className="col-numeric">Suma</th>
              <th className="col-numeric">Liczba</th>
              <th className="col-numeric">Śr. / rozliczenie</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.name}>
                <td className="col-text-wrap">{r.name}</td>
                <td className="col-numeric">{r.total.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}</td>
                <td className="col-numeric">{r.count}</td>
                <td className="col-numeric">
                  <strong>{r.avgPerClaim.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}</strong> PLN
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopVehiclesCostChart({
  rows,
  fleetAverage,
}: {
  rows: VehicleInsightRow[];
  fleetAverage: number;
}) {
  const [sort, setSort] = useState('total-desc');
  const [gradeFilter, setGradeFilter] = useState<HealthGradeFilter>('all');

  const filtered = useMemo(() => filterByHealthGrade(rows, gradeFilter), [rows, gradeFilter]);
  const sorted = useMemo(() => sortVehicles(filtered, sort), [filtered, sort]);
  const rankRows = sorted.map((r) => ({ name: r.name, total: r.total, count: r.count }));

  if (!rows.length) return null;

  return (
    <div className="dash-chart-card">
      <ChartViewControls
        sortOptions={VEHICLE_COST_SORTS}
        sort={sort}
        onSortChange={setSort}
        gradeFilter={gradeFilter}
        onGradeFilterChange={setGradeFilter}
        showGradeFilter
        resultCount={sorted.length}
        totalCount={rows.length}
      />
      <TopVehiclesWithAvg rows={rankRows} fleetAverage={fleetAverage} embedded />
    </div>
  );
}

export function VehicleHealthScorePanel({ rows }: { rows: VehicleInsightRow[] }) {
  const [sort, setSort] = useState('score-desc');
  const [gradeFilter, setGradeFilter] = useState<HealthGradeFilter>('all');

  const filtered = useMemo(() => filterByHealthGrade(rows, gradeFilter), [rows, gradeFilter]);
  const sorted = useMemo(() => sortVehicles(filtered, sort), [filtered, sort]);

  if (!rows.length) return null;

  return (
    <div className="dash-chart-card">
      <ChartViewControls
        sortOptions={HEALTH_SORTS}
        sort={sort}
        onSortChange={setSort}
        gradeFilter={gradeFilter}
        onGradeFilterChange={setGradeFilter}
        showGradeFilter
        resultCount={sorted.length}
        totalCount={rows.length}
      />
      <h4 className="dash-chart-title">Health score pojazdów</h4>
      <p className="dash-chart-desc">Ocena kondycji floty — sortuj i filtruj po literze (A–F).</p>
      {sorted.length === 0 ? (
        <p className="insight-empty">Brak pojazdów dla wybranej oceny.</p>
      ) : (
        <ul className="insights-vehicle-health-compact">
          {sorted.map((r) => (
            <li key={r.name}>
              <span className="insights-vehicle-health-plate">{r.name}</span>
              {r.healthGrade ? (
                <span className={`health-grade health-grade-${r.healthGrade.toLowerCase()}`}>
                  {r.healthScore}
                </span>
              ) : (
                <span className="insight-muted">—</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CategoryDistribution({
  items,
}: {
  items: { category: string; label: string; total: number; count: number }[];
}) {
  const [sort, setSort] = useState('total-desc');
  const sorted = useMemo(() => sortCategories(items, sort), [items, sort]);

  if (!sorted.length) return null;

  return (
    <div className="dash-chart-card dash-chart-wide">
      <ChartViewControls sortOptions={CATEGORY_SORTS} sort={sort} onSortChange={setSort} />
      <CategoryShareBars
        title="Koszty wg kategorii"
        items={sorted.map((c) => ({
          category: c.category as ServiceCategory,
          count: c.count,
          total: c.total,
        }))}
        embedded
      />
    </div>
  );
}

export function FuelByRegionChart({ rows }: { rows: RegionFuelRow[] }) {
  const [sort, setSort] = useState('total-desc');
  const sorted = useMemo(() => sortFuelRegions(rows, sort), [rows, sort]);

  if (!sorted.length) return null;

  return (
    <div className="dash-chart-card dash-chart-wide">
      <ChartViewControls sortOptions={FUEL_SORTS} sort={sort} onSortChange={setSort} />
      <GroupedFuelByRegion rows={sorted} embedded />
    </div>
  );
}

export function SettlementBlock({
  items,
  pendingOld,
}: {
  items: { label: string; count: number }[];
  pendingOld: number;
}) {
  const [sort, setSort] = useState('count-desc');
  const sorted = useMemo(() => {
    if (sort === 'count-asc') return sortByNumeric(items, (i) => i.count, 'asc');
    if (sort === 'label-asc') return sortByLabel(items, 'asc');
    if (sort === 'label-desc') return sortByLabel(items, 'desc');
    return sortByNumeric(items, (i) => i.count, 'desc');
  }, [items, sort]);

  if (!sorted.length) return null;

  return (
    <div className="dash-chart-card">
      <ChartViewControls sortOptions={SETTLEMENT_SORTS} sort={sort} onSortChange={setSort} />
      <StackedStatusBar title="Status rozliczeń" items={sorted} embedded />
      {pendingOld > 0 && (
        <p className="insight-pending-age">
          <strong>{pendingOld}</strong> oczekujących starszych niż 7 dni — wymaga działania księgowości.
        </p>
      )}
    </div>
  );
}
