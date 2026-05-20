import type { FleetCostStats } from '../services/fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';

interface Props {
  stats: FleetCostStats;
  health: HealthScoreResult;
  title?: string;
  onExportPdf?: () => void;
}

export function FleetStatsPanel({ stats, health, title = 'Statystyki', onExportPdf }: Props) {
  const maxCat = Math.max(...stats.byCategory.map((c) => c.total), 1);

  return (
    <div className="fleet-stats-panel">
      <div className="fleet-stats-head">
        <h3 className="section-title">{title}</h3>
        {onExportPdf && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExportPdf}>
            Pobierz PDF
          </button>
        )}
      </div>

      <div className="health-score-card">
        <div className="health-score-main">
          <span className={healthGradeClass(health.grade)}>{health.grade}</span>
          <div>
            <span className="health-score-value">{health.score}</span>
            <span className="health-score-max">/100</span>
            <p className="health-score-summary">{health.summary}</p>
          </div>
        </div>
        {health.factors.length > 0 && (
          <ul className="health-factors">
            {health.factors.map((f) => (
              <li key={f.label}>
                <span className="health-factor-label">{f.label}</span>
                <span className="health-factor-impact">{f.impact}</span>
                <span className="health-factor-detail">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stats-kpi-row">
        <div className="stats-kpi">
          <span className="stats-kpi-label">Suma kosztów</span>
          <span className="stats-kpi-value">
            {stats.totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
          </span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">Rozliczenia</span>
          <span className="stats-kpi-value">{stats.claimCount}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">Średni koszt</span>
          <span className="stats-kpi-value">
            {stats.avgCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
          </span>
        </div>
        <div className="stats-kpi stats-kpi-warn">
          <span className="stats-kpi-label">Fraud / flagi</span>
          <span className="stats-kpi-value">{stats.flaggedCount}</span>
        </div>
      </div>

      {stats.byCategory.length > 0 && (
        <div className="stats-category-block">
          <h4 className="stats-subtitle">Koszty wg kategorii</h4>
          <ul className="category-bars">
            {stats.byCategory.map((c) => {
              const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
              const pct = Math.round((c.total / maxCat) * 100);
              return (
                <li key={c.category} className="category-bar-row">
                  <span className="category-bar-label" title={c.category}>
                    {meta?.label ?? c.category}
                  </span>
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

      {stats.byService.length > 0 && (
        <div className="stats-table-block">
          <h4 className="stats-subtitle">Top usługi</h4>
          <div className="table-wrap table-wrap-nested">
            <table>
              <thead>
                <tr>
                  <th>Usługa</th>
                  <th>Kategoria</th>
                  <th className="col-numeric">Liczba</th>
                  <th className="col-numeric">Suma</th>
                </tr>
              </thead>
              <tbody>
                {stats.byService.slice(0, 8).map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.category}</td>
                    <td className="col-numeric">{s.count}</td>
                    <td className="col-numeric">{s.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
