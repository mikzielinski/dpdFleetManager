import type { MonthTotal } from '../../services/dashboardAnalytics';
import type {
  InsightRole,
  MonthCategorySlice,
  MonthCount,
  MonthHealthShare,
  RegionDualRow,
} from '../../services/insightsAnalytics';
import { SERVICE_CATEGORIES, type ServiceCategory } from '../../utils/serviceCategories';
import { CategoryShareBars, StackedStatusBar, TopVehiclesWithAvg } from '../DashboardCharts';
import type { VehicleInsightRow } from '../../services/insightsAnalytics';

const ROLE_LABEL: Record<InsightRole, string> = {
  manager: 'Manager',
  finance: 'Księgowość',
  board: 'Zarząd',
};

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
  if (!months.length) return null;
  const max = Math.max(...months.map((m) => m.total), budgetMonthly, 1);

  return (
    <div className="dash-chart-card dash-chart-wide">
      <h4 className="dash-chart-title">Koszty w czasie (6 mies.)</h4>
      <p className="dash-chart-desc">
        Słupki: suma miesięczna · przerywana linia: plan referencyjny (
        {budgetMonthly.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} PLN)
      </p>
      <div className="insight-trend-columns">
        {months.map((m) => {
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
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">Trend anomalii</h4>
      <div className="dash-column-chart">
        {rows.map((r) => {
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
  if (!rows.length) return null;
  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">Health score w czasie</h4>
      <p className="dash-chart-desc">
        Udział pojazdów A/B/C (snapshot bieżącej floty — brak historii health w Fabric).
      </p>
      <div className="insight-health-trend">
        {rows.map((r) => (
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
  if (!rows.length) return null;
  const maxCost = Math.max(...rows.map((r) => r.total), 1);
  const maxCpv = Math.max(...rows.map((r) => r.costPerVehicle), 1);

  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">Koszty wg regionu</h4>
      <p className="dash-chart-desc">Ciemny pasek: suma PLN · jasny: koszt / pojazd w regionie</p>
      <ul className="dash-labeled-bars">
        {rows.slice(0, 8).map((r) => (
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

export function CompaniesTable({ rows }: { rows: { name: string; total: number; count: number; avgPerClaim: number }[] }) {
  if (!rows.length) return null;
  return (
    <div className="dash-chart-card">
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
            {rows.map((r) => (
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

export function VehiclesWithHealthChart({
  rows,
  fleetAverage,
}: {
  rows: VehicleInsightRow[];
  fleetAverage: number;
}) {
  const rankRows = rows.map((r) => ({ name: r.name, total: r.total, count: r.count }));
  return (
    <div className="dash-chart-card insights-vehicle-card">
      <div className="insights-vehicle-split">
        <TopVehiclesWithAvg rows={rankRows} fleetAverage={fleetAverage} embedded />
        <aside className="insights-vehicle-health-aside" aria-label="Health score pojazdów">
          <h5 className="insights-vehicle-health-title">Health score</h5>
          <ul className="insights-vehicle-health-compact">
            {rows.slice(0, 10).map((r) => (
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
        </aside>
      </div>
    </div>
  );
}

export function CategoryDistribution({
  items,
}: {
  items: { category: string; label: string; total: number; count: number }[];
}) {
  return (
    <CategoryShareBars
      title="Koszty wg kategorii"
      items={items.map((c) => ({
        category: c.category as ServiceCategory,
        count: c.count,
        total: c.total,
      }))}
    />
  );
}

export function SettlementBlock({
  items,
  pendingOld,
}: {
  items: { label: string; count: number }[];
  pendingOld: number;
}) {
  return (
    <div className="dash-chart-card">
      <StackedStatusBar title="Status rozliczeń" items={items} />
      {pendingOld > 0 && (
        <p className="insight-pending-age">
          <strong>{pendingOld}</strong> oczekujących starszych niż 7 dni — wymaga działania księgowości.
        </p>
      )}
    </div>
  );
}
