import type { InsightsData } from '../../services/insightsAnalytics';
import type { DashboardFilterState } from '../../utils/dashboardFilters';
import { isPeriodFilterActive, type PeriodFilterState } from '../../utils/periodFilter';
import {
  AnomalyTrendChart,
  CategoryDistribution,
  CompaniesTable,
  CostsTrendChart,
  HealthTrendChart,
  RegionDualChart,
  RoleTags,
  SettlementBlock,
  VehiclesWithHealthChart,
} from './InsightsCharts';
import { GroupedFuelByRegion } from '../DashboardCharts';

interface Props {
  data: InsightsData | null;
  loading: boolean;
  period: PeriodFilterState;
  filters: DashboardFilterState;
  onFiltersChange: (next: DashboardFilterState) => void;
}

const ALERT_ICON: Record<string, string> = {
  warn: '⚠',
  flag: '⚑',
  clock: '⏱',
  car: '▣',
};

export function InsightsSection({ data, loading, period, filters, onFiltersChange }: Props) {
  if (loading) {
    return (
      <section className="panel insights-panel">
        <p className="center">Ładowanie Insights…</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel insights-panel">
        <p className="placeholder">Brak danych POC do analizy Insights.</p>
      </section>
    );
  }

  const periodActive = isPeriodFilterActive(period);

  return (
    <section className="panel insights-panel">
      <div className="panel-head">
        <h2>Insights</h2>
        <span className="badge badge-muted">
          {data.periodRecordCount} rozliczeń w okresie
          {periodActive ? '' : ' (cała historia)'}
        </span>
      </div>

      <p className="filter-hint dash-source-hint">
        Warstwy: alerty → KPI z trendem i planem → trendy 6 mies. → rozkład kosztów. Okres i filtry
        z paska u góry.
      </p>

      <section className="insights-layer">
        <header className="insights-layer-head">
          <h3>Co wymaga uwagi teraz</h3>
          <p>Alerty operacyjne — działanie przed analizą wykresów.</p>
        </header>
        {data.alerts.length === 0 ? (
          <p className="insight-empty">Brak alertów w wybranym okresie.</p>
        ) : (
          <div className="insights-alert-grid">
            {data.alerts.map((a) => (
              <article key={a.id} className={`insight-alert insight-alert-${a.icon}`}>
                <span className="insight-alert-icon" aria-hidden>
                  {ALERT_ICON[a.icon]}
                </span>
                <div className="insight-alert-body">
                  <h4>{a.title}</h4>
                  <p>{a.description}</p>
                  <p className="insight-alert-metric">{a.metric}</p>
                  <RoleTags roles={a.roles} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="insights-layer">
        <header className="insights-layer-head">
          <h3>KPI — okres vs plan i poprzedni okres</h3>
        </header>
        <div className="insights-kpi-grid">
          {data.kpis.map((k) => (
            <article
              key={k.id}
              className={k.highlight ? 'insight-kpi-card insight-kpi-card-warn' : 'insight-kpi-card'}
            >
              <span className="dash-kpi-label">{k.label}</span>
              <span className="dash-kpi-value">{k.value}</span>
              {k.trendPct != null && (
                <span
                  className={
                    k.trendPct > 0
                      ? 'dash-kpi-trend dash-trend-up'
                      : k.trendPct < 0
                        ? 'dash-kpi-trend dash-trend-down'
                        : 'dash-kpi-trend dash-trend-flat'
                  }
                >
                  {k.trendPct > 0 ? '↑' : k.trendPct < 0 ? '↓' : '→'} {Math.abs(k.trendPct)}% vs
                  poprz. okres
                </span>
              )}
              {k.budgetPct != null && (
                <div className="insight-budget-progress">
                  <div
                    className="insight-budget-progress-fill"
                    style={{ width: `${Math.min(100, k.budgetPct)}%` }}
                  />
                  <span className="insight-budget-progress-label">
                    {k.budgetPct}% planu ({k.budgetLabel})
                  </span>
                </div>
              )}
              {k.subtext && <p className="insight-kpi-sub">{k.subtext}</p>}
              <RoleTags roles={k.roles} />
            </article>
          ))}
        </div>
      </section>

      <section className="insights-layer">
        <header className="insights-layer-head">
          <h3>Trendy (6 miesięcy)</h3>
          <p>Czy koszty i anomalie idą w dobrym kierunku?</p>
        </header>
        <div className="dashboard-grid dashboard-grid-overview">
          <CostsTrendChart
            months={data.trends.costsByMonth}
            budgetMonthly={data.trends.budgetMonthly}
            byMonthCategory={data.trends.costsByMonthCategory}
          />
          <AnomalyTrendChart rows={data.trends.anomaliesByMonth} />
          <HealthTrendChart rows={data.trends.healthByMonth} />
        </div>
      </section>

      <section className="insights-layer">
        <header className="insights-layer-head">
          <h3>Rozkład — gdzie idą pieniądze</h3>
        </header>
        <div className="dashboard-grid dashboard-grid-overview">
          <CategoryDistribution items={data.distribution.byCategory} />
          <RegionDualChart rows={data.distribution.regionsDual} />
          <CompaniesTable rows={data.distribution.topCompanies} />
          <VehiclesWithHealthChart
            rows={data.distribution.topVehicles}
            fleetAverage={data.dashboardBase.fleetAvgVehicleCost}
          />
          {data.dashboardBase.fuelRegions.length > 0 && (
            <GroupedFuelByRegion rows={data.dashboardBase.fuelRegions} />
          )}
          <SettlementBlock
            items={data.distribution.settlementStatus}
            pendingOld={data.distribution.pendingOlderThanDays}
          />
        </div>
      </section>

      <label className="filter-field filter-checkbox insights-toggle">
        <input
          type="checkbox"
          checked={filters.hideUnassigned}
          onChange={(e) => onFiltersChange({ ...filters, hideUnassigned: e.target.checked })}
        />
        <span>Ukryj nieprzypisane w rankingach Insights</span>
      </label>
    </section>
  );
}
