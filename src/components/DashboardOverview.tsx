import type { DashboardData } from '../services/dashboardAnalytics';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import { UNASSIGNED_REGION } from '../utils/dashboardFilters';
import {
  CategoryShareBars,
  ColumnChart,
  DashboardKpiRow,
  GroupedFuelByRegion,
  HealthGaugePanel,
  RankBarChartToned,
  StackedStatusBar,
  TopVehiclesWithAvg,
} from './DashboardCharts';

interface Props {
  data: DashboardData;
  filters: DashboardFilterState;
  onHideUnassignedChange: (hide: boolean) => void;
}

export function DashboardOverview({ data, filters, onHideUnassignedChange }: Props) {
  const { stats } = data;
  const regionAvg =
    data.costsByRegion.length > 0
      ? data.costsByRegion.reduce((s, r) => s + r.total, 0) / data.costsByRegion.length
      : 0;
  const companyAvg =
    data.costsByCompany.length > 0
      ? data.costsByCompany.reduce((s, r) => s + r.total, 0) / data.costsByCompany.length
      : 0;

  const unassigned = data.unassigned;
  const showUnassignedBanner =
    unassigned.recordCount > 0 &&
    filters.hideUnassigned &&
    unassigned.regionCost > stats.totalCost * 0.2;

  const monthRows = data.costsByMonth.map((m) => ({
    label: m.label,
    total: m.total,
    count: m.count,
  }));

  return (
    <>
      {showUnassignedBanner && (
        <div className="dash-unassigned-banner" role="status">
          <div className="dash-unassigned-banner-text">
            <strong>Nieprzypisane</strong> — {unassigned.recordCount} rozliczeń (
            {unassigned.regionCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN), ok.
            {Math.round((unassigned.regionCost / (stats.totalCost || 1)) * 100)}% sumy. Domyślnie
            ukryte w wykresach, żeby nie zaburzać skali.
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onHideUnassignedChange(false)}
          >
            Pokaż w rankingach
          </button>
        </div>
      )}

      <DashboardKpiRow stats={stats} trends={data.trends} />

      <div className="dashboard-grid dashboard-grid-overview">
        <CategoryShareBars title="Koszty wg kategorii" items={stats.byCategory} />

        {data.costsByMonth.length > 1 ? (
          <ColumnChart title="Koszty w czasie (miesiące)" rows={monthRows} />
        ) : (
          monthRows.length === 1 && (
            <div className="dash-chart-card">
              <h4 className="dash-chart-title">Koszty w okresie</h4>
              <p className="dash-kpi-value-inline">
                {monthRows[0]!.label}: {monthRows[0]!.total.toFixed(0)} PLN ({monthRows[0]!.count}{' '}
                rozliczeń)
              </p>
            </div>
          )
        )}

        {data.costsByRegion.length > 0 && (
          <RankBarChartToned
            title="Koszty wg regionu"
            rows={data.costsByRegion}
            average={regionAvg}
          />
        )}

        {data.costsByCompany.length > 0 && (
          <RankBarChartToned
            title="Top firmy kurierskie"
            rows={data.costsByCompany}
            average={companyAvg}
          />
        )}

        <HealthGaugePanel buckets={data.healthBuckets} fleetAvgScore={data.fleetAvgHealthScore} />

        {stats.byDecision.length > 0 && (
          <StackedStatusBar title="Status rozliczeń" items={stats.byDecision} />
        )}

        {data.topVehicles.length > 0 && (
          <TopVehiclesWithAvg rows={data.topVehicles} fleetAverage={data.fleetAvgVehicleCost} />
        )}

        {data.fuelRegions.length > 0 && (
          <GroupedFuelByRegion rows={data.fuelRegions} />
        )}
      </div>

      {!filters.hideUnassigned && unassigned.recordCount > 0 && (
        <p className="filter-hint">
          W rankingach widoczny region „{UNASSIGNED_REGION}”. Włącz „Ukryj nieprzypisane”, aby
          skupić wykresy na przypisanej flocie.
        </p>
      )}
    </>
  );
}
