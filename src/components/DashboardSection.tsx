import type { DashboardData } from '../services/dashboardAnalytics';
import type { RegionFuelRow } from '../services/regionFuelAnalytics';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import { planDashboardView, showFuelChart } from '../utils/dashboardView';
import { isPeriodFilterActive, type PeriodFilterState } from '../utils/periodFilter';
import {
  categorySegments,
  ColumnChart,
  decisionSegments,
  DonutChart,
  healthSegments,
  RankBarChart,
  StatCards,
} from './DashboardCharts';

interface Props {
  data: DashboardData | null;
  loading: boolean;
  period: PeriodFilterState;
  filters: DashboardFilterState;
  vehicleCount: number;
  companyCount: number;
}

function fuelAsRankRows(rows: RegionFuelRow[]) {
  return rows.map((r) => ({
    name: r.region,
    total: r.fuelCost,
    count: r.fuelCount,
  }));
}

function fuelStatCards(rows: RegionFuelRow[]) {
  return (
    <div className="dash-chart-card dash-chart-wide">
      <h4 className="stats-subtitle">Paliwo wg regionu</h4>
      <div className="dash-stat-cards">
        {rows.map((r) => (
          <div key={r.region} className="dash-stat-card dash-stat-card-fuel">
            <span className="dash-stat-card-name">{r.region}</span>
            <span className="dash-stat-card-value">{r.fuelCost.toFixed(0)} PLN</span>
            <span className="dash-stat-card-meta">
              {r.fuelCount} tank.
              {r.fuelLitersPer100Km != null ? ` · ${r.fuelLitersPer100Km.toFixed(1)} L/100 km` : ''}
              {r.drivenKm > 0 ? ` · ${r.drivenKm.toFixed(0)} km` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSection({
  data,
  loading,
  period,
  filters,
  vehicleCount,
  companyCount,
}: Props) {
  const periodPresetLabels: Record<string, string> = {
    day: '1 dzień',
    week: 'tydzień',
    month: 'miesiąc',
    quarter: 'kwartał',
    halfYear: 'pół roku',
    year: 'rok',
    custom: 'zakres',
  };
  const periodLabel = isPeriodFilterActive(period)
    ? period.preset === 'custom'
      ? `${period.customFrom || '…'} – ${period.customTo || '…'}`
      : (periodPresetLabels[period.preset] ?? period.preset)
    : 'cała historia';

  if (loading) {
    return (
      <section className="panel dashboard-panel">
        <p className="center">Ładowanie danych do dashboardu…</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel dashboard-panel">
        <p className="placeholder">Brak danych POC i katalogu pojazdów do wizualizacji.</p>
      </section>
    );
  }

  const plan = planDashboardView(filters, data);
  const fuelVisible = showFuelChart(filters.category) && data.fuelRegions.length > 0;
  const categoryScoped = filters.category !== '';
  const { stats } = data;
  const serviceRows = stats.byService.slice(0, 8).map((s) => ({
    name: s.name,
    total: s.total,
    count: s.count,
  }));
  const monthRows = data.costsByMonth.map((m) => ({
    label: m.label,
    total: m.total,
    count: m.count,
  }));
  const categoryFilterLabel = filters.category ? ` · kategoria: ${filters.category}` : '';

  return (
    <section className="panel dashboard-panel">
      <div className="panel-head">
        <h2>Dashboard floty</h2>
        <span className="badge badge-muted">
          Okres: {periodLabel}
          {categoryFilterLabel} · {data.recordCount} rozliczeń
        </span>
      </div>

      <p className="filter-hint dash-source-hint">
        Wykresy z DPD_POC w wybranym okresie i filtrach ({vehicleCount} pojazdów, {companyCount}{' '}
        firm). Sekcja paliwa tylko przy „Wszystkie kategorie” lub filtrze Paliwo.
      </p>

      <div className="stats-kpi-row dash-kpi-row">
        <div className="stats-kpi">
          <span className="stats-kpi-label">Suma kosztów</span>
          <span className="stats-kpi-value">
            {stats.totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 0 })} PLN
          </span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">Rozliczenia</span>
          <span className="stats-kpi-value">{stats.claimCount}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">Średni koszt</span>
          <span className="stats-kpi-value">
            {stats.avgCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN
          </span>
        </div>
        <div className="stats-kpi stats-kpi-warn">
          <span className="stats-kpi-label">Flagi / anomalie</span>
          <span className="stats-kpi-value">{stats.flaggedCount}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {!categoryScoped && plan.showCategory && plan.categoryKind === 'donut' && (
          <div className="dash-chart-wide">
            <DonutChart
              title="Udział kosztów wg kategorii"
              segments={categorySegments(stats.byCategory)}
              valueSuffix="PLN"
            />
          </div>
        )}
        {!categoryScoped && plan.showCategory && plan.categoryKind === 'bars' && (
          <RankBarChart
            title="Koszty wg kategorii"
            rows={stats.byCategory.map((c) => ({
              name: c.category,
              total: c.total,
              count: c.count,
            }))}
            barClass="dash-bar-fill"
          />
        )}

        {filters.category && stats.byCategory.length === 1 && (
          <div className="dash-chart-card dash-chart-highlight">
            <h4 className="stats-subtitle">Wybrana kategoria</h4>
            <p className="dash-single-cat">
              {stats.byCategory[0]!.category}:{' '}
              <strong>{stats.byCategory[0]!.total.toFixed(0)} PLN</strong> (
              {stats.byCategory[0]!.count} rozliczeń)
            </p>
          </div>
        )}

        {plan.showServices && plan.servicesKind === 'donut' && (
          <DonutChart
            title={filters.category ? 'Usługi w kategorii' : 'Top usługi'}
            segments={serviceRows.map((s, i) => ({
              label: s.name,
              value: s.total,
              color: ['#dc0032', '#e85d04', '#0077b6', '#2a9d8f', '#7b2cbf', '#6c757d'][i % 6]!,
              meta: `${s.count} · ${s.total.toFixed(0)} PLN`,
            }))}
            valueSuffix="PLN"
          />
        )}
        {plan.showServices && plan.servicesKind === 'bars' && (
          <RankBarChart title={filters.category ? 'Usługi w kategorii' : 'Top usługi'} rows={serviceRows} />
        )}
        {plan.showServices && plan.servicesKind === 'cards' && (
          <StatCards title={filters.category ? 'Usługi w kategorii' : 'Top usługi'} rows={serviceRows} />
        )}

        {plan.showMonth && plan.monthKind === 'columns' && (
          <ColumnChart title="Koszty w czasie (miesiące)" rows={monthRows} />
        )}
        {plan.showMonth && plan.monthKind === 'cards' && (
          <StatCards title="Koszty w okresie" rows={monthRows.map((m) => ({ name: m.label, ...m }))} />
        )}

        {plan.showRegion && plan.regionKind === 'cards' && (
          <StatCards title="Koszty wg regionu" rows={data.costsByRegion} />
        )}
        {plan.showRegion && plan.regionKind === 'bars' && (
          <RankBarChart title="Koszty wg regionu" rows={data.costsByRegion} />
        )}

        {plan.showCompany && plan.companyKind === 'cards' && (
          <StatCards title="Top firmy kurierskie" rows={data.costsByCompany} />
        )}
        {plan.showCompany && plan.companyKind === 'bars' && (
          <RankBarChart title="Top firmy kurierskie" rows={data.costsByCompany} />
        )}

        {plan.showVehicles && plan.vehiclesKind === 'cards' && (
          <StatCards title="Top pojazdy" rows={data.topVehicles} />
        )}
        {plan.showVehicles && plan.vehiclesKind === 'bars' && (
          <RankBarChart title="Top pojazdy (koszt)" rows={data.topVehicles} />
        )}

        {!categoryScoped && plan.showHealth && plan.healthKind === 'donut' && (
          <DonutChart
            title="Health score floty"
            segments={healthSegments(data.healthBuckets)}
            valueSuffix="pojazdów"
          />
        )}
        {!categoryScoped && plan.showHealth && plan.healthKind === 'bars' && (
          <RankBarChart
            title="Rozkład health score"
            rows={data.healthBuckets.map((b) => ({ name: b.label, total: b.count, count: b.count }))}
            barClass="dash-bar-health"
            formatValue={(n) => String(n)}
          />
        )}

        {!categoryScoped && plan.showDecision && plan.decisionKind === 'donut' && (
          <DonutChart
            title="Status rozliczeń"
            segments={decisionSegments(stats.byDecision)}
            valueSuffix="szt."
          />
        )}
        {!categoryScoped && plan.showDecision && plan.decisionKind === 'bars' && (
          <RankBarChart
            title="Status rozliczeń"
            rows={stats.byDecision.map((d) => ({ name: d.label, total: d.count, count: d.count }))}
            barClass="dash-bar-status"
            formatValue={(n) => String(n)}
          />
        )}

        {fuelVisible && plan.fuelKind === 'cards' && fuelStatCards(data.fuelRegions)}
        {fuelVisible && plan.fuelKind === 'bars' && (
          <RankBarChart
            title="Paliwo wg regionu (PLN)"
            rows={fuelAsRankRows(data.fuelRegions)}
            barClass="dash-bar-fuel"
          />
        )}
      </div>
    </section>
  );
}
