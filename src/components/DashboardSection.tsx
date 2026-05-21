import type { DashboardData } from '../services/dashboardAnalytics';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import { planDashboardView, showFuelChart } from '../utils/dashboardView';
import { isPeriodFilterActive, type PeriodFilterState } from '../utils/periodFilter';
import { ColumnChart, RankBarChart, StatCards } from './DashboardCharts';
import { DashboardOverview } from './DashboardOverview';

interface Props {
  data: DashboardData | null;
  loading: boolean;
  period: PeriodFilterState;
  filters: DashboardFilterState;
  onFiltersChange: (next: DashboardFilterState) => void;
  vehicleCount: number;
  companyCount: number;
}

export function DashboardSection({
  data,
  loading,
  period,
  filters,
  onFiltersChange,
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

  const categoryScoped = filters.category !== '';
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
        {categoryScoped
          ? `Widok kategorii „${filters.category}” — bez wykresów floty (health, statusy, paliwo innych kategorii).`
          : `Przegląd zbiorczy (${vehicleCount} pojazdów, ${companyCount} firm). Paski z wartością PLN na końcu; kolory: szary = norma, pomarańcz = nieprzypisane, czerwony = powyżej średniej.`}
      </p>

      {!categoryScoped ? (
        <DashboardOverview
          data={data}
          filters={filters}
          onHideUnassignedChange={(hide) => onFiltersChange({ ...filters, hideUnassigned: hide })}
        />
      ) : (
        <CategoryScopedDashboard data={data} filters={filters} />
      )}
    </section>
  );
}

function CategoryScopedDashboard({
  data,
  filters,
}: {
  data: DashboardData;
  filters: DashboardFilterState;
}) {
  const plan = planDashboardView(filters, data);
  const fuelVisible = showFuelChart(filters.category) && data.fuelRegions.length > 0;
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

  return (
    <>
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
        {stats.byCategory.length === 1 && (
          <div className="dash-chart-card dash-chart-highlight dash-chart-wide">
            <h4 className="dash-chart-title">Wybrana kategoria</h4>
            <p className="dash-single-cat">
              {stats.byCategory[0]!.category}:{' '}
              <strong>{stats.byCategory[0]!.total.toFixed(0)} PLN</strong> (
              {stats.byCategory[0]!.count} rozliczeń)
            </p>
          </div>
        )}

        {plan.showServices && plan.servicesKind === 'bars' && (
          <RankBarChart title="Usługi w kategorii" rows={serviceRows} />
        )}
        {plan.showServices && plan.servicesKind === 'cards' && (
          <StatCards title="Usługi w kategorii" rows={serviceRows} />
        )}

        {plan.showMonth && plan.monthKind === 'columns' && (
          <ColumnChart title="Koszty w czasie (miesiące)" rows={monthRows} />
        )}

        {plan.showRegion && <RankBarChart title="Koszty wg regionu" rows={data.costsByRegion} />}
        {plan.showCompany && <RankBarChart title="Top firmy kurierskie" rows={data.costsByCompany} />}
        {plan.showVehicles && <RankBarChart title="Top pojazdy (koszt)" rows={data.topVehicles} />}

        {fuelVisible && (
          <RankBarChart
            title="Paliwo wg regionu (PLN)"
            rows={data.fuelRegions.map((r) => ({
              name: r.region,
              total: r.fuelCost,
              count: r.fuelCount,
            }))}
            barClass="dash-bar-fuel"
          />
        )}
      </div>
    </>
  );
}
