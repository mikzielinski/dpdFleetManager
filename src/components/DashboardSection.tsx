import type { DashboardData } from '../services/dashboardAnalytics';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import { isPeriodFilterActive, type PeriodFilterState } from '../utils/periodFilter';

interface Props {
  data: DashboardData | null;
  loading: boolean;
  period: PeriodFilterState;
  vehicleCount: number;
  companyCount: number;
}

function BarChart({
  title,
  rows,
  valueKey = 'total',
  formatValue,
}: {
  title: string;
  rows: { name: string; total: number; count: number }[];
  valueKey?: 'total' | 'count';
  formatValue?: (n: number) => string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  const fmt = formatValue ?? ((n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }));

  return (
    <div className="dash-chart-card">
      <h4 className="stats-subtitle">{title}</h4>
      <ul className="category-bars dash-bars">
        {rows.map((r) => {
          const val = r[valueKey];
          const pct = Math.round((val / max) * 100);
          return (
            <li key={r.name} className="category-bar-row">
              <span className="category-bar-label" title={r.name}>
                {r.name}
              </span>
              <div className="category-bar-track">
                <div className="category-bar-fill dash-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="category-bar-meta">
                {r.count} · {fmt(val)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DashboardSection({
  data,
  loading,
  period,
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

  const { stats } = data;
  const maxHealth = Math.max(...data.healthBuckets.map((b) => b.count), 1);

  return (
    <section className="panel dashboard-panel">
      <div className="panel-head">
        <h2>Dashboard floty</h2>
        <span className="badge badge-muted">
          Okres: {periodLabel} · {data.recordCount} rozliczeń
        </span>
      </div>

      <p className="filter-hint dash-source-hint">
        Wykresy na podstawie DPD_POC w wybranym okresie (slicer u góry) oraz katalogu B2B (
        {vehicleCount} pojazdów, {companyCount} firm). Uzupełnienie staging może wpływać na koszty i
        compliance.
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
        {stats.byCategory.length > 0 && (
          <div className="dash-chart-card dash-chart-wide">
            <h4 className="stats-subtitle">Koszty wg kategorii</h4>
            <ul className="category-bars">
              {stats.byCategory.map((c) => {
                const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
                const maxCat = Math.max(...stats.byCategory.map((x) => x.total), 1);
                const pct = Math.round((c.total / maxCat) * 100);
                return (
                  <li key={c.category} className="category-bar-row">
                    <span className="category-bar-label">{meta?.label ?? c.category}</span>
                    <div className="category-bar-track">
                      <div
                        className="category-bar-fill"
                        style={{ width: `${pct}%`, backgroundColor: meta?.color ?? '#dc0032' }}
                      />
                    </div>
                    <span className="category-bar-meta">
                      {c.count} · {c.total.toFixed(0)} PLN
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {data.costsByMonth.length > 0 && (
          <div className="dash-chart-card">
            <h4 className="stats-subtitle">Koszty w czasie (miesiące)</h4>
            <div className="dash-column-chart" role="img" aria-label="Wykres słupkowy kosztów miesięcznych">
              {data.costsByMonth.map((m) => {
                const maxM = Math.max(...data.costsByMonth.map((x) => x.total), 1);
                const h = Math.max(4, Math.round((m.total / maxM) * 100));
                return (
                  <div key={m.month} className="dash-column" title={`${m.label}: ${m.total.toFixed(0)} PLN`}>
                    <div className="dash-column-bar" style={{ height: `${h}%` }} />
                    <span className="dash-column-label">{m.label}</span>
                    <span className="dash-column-value">{m.total.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <BarChart title="Koszty wg regionu" rows={data.costsByRegion} />
        <BarChart title="Top firmy kurierskie" rows={data.costsByCompany} />
        <BarChart title="Top pojazdy (koszt)" rows={data.topVehicles} />

        {data.healthBuckets.length > 0 && (
          <div className="dash-chart-card">
            <h4 className="stats-subtitle">Rozkład health score (pojazdy)</h4>
            <ul className="category-bars">
              {data.healthBuckets.map((b) => {
                const pct = Math.round((b.count / maxHealth) * 100);
                return (
                  <li key={b.label} className="category-bar-row">
                    <span className="category-bar-label">{b.label}</span>
                    <div className="category-bar-track">
                      <div className="category-bar-fill dash-bar-health" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="category-bar-meta">{b.count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {stats.byDecision.length > 0 && (
          <div className="dash-chart-card">
            <h4 className="stats-subtitle">Status rozliczeń</h4>
            <ul className="category-bars">
              {stats.byDecision.map((d) => {
                const maxD = Math.max(...stats.byDecision.map((x) => x.count), 1);
                const pct = Math.round((d.count / maxD) * 100);
                return (
                  <li key={d.label} className="category-bar-row">
                    <span className="category-bar-label">{d.label}</span>
                    <div className="category-bar-track">
                      <div className="category-bar-fill dash-bar-status" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="category-bar-meta">{d.count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {data.fuelRegions.length > 0 && (
          <div className="dash-chart-card dash-chart-wide">
            <h4 className="stats-subtitle">Paliwo wg regionu (PLN)</h4>
            <ul className="category-bars">
              {data.fuelRegions.map((r) => {
                const maxF = Math.max(...data.fuelRegions.map((x) => x.fuelCost), 1);
                const pct = Math.round((r.fuelCost / maxF) * 100);
                return (
                  <li key={r.region} className="category-bar-row">
                    <span className="category-bar-label">{r.region}</span>
                    <div className="category-bar-track">
                      <div
                        className="category-bar-fill"
                        style={{ width: `${pct}%`, backgroundColor: '#e85d04' }}
                      />
                    </div>
                    <span className="category-bar-meta">
                      {r.fuelCount} tank. · {r.fuelCost.toFixed(0)} PLN
                      {r.fuelLitersPer100Km != null
                        ? ` · ${r.fuelLitersPer100Km.toFixed(1)} L/100km`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
