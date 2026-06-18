import type { FleetCostStats } from '../services/fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import { useI18n } from '../i18n/I18nProvider';
import {
  formatLocale,
  localizedHealthFactorDetail,
  localizedHealthFactorLabel,
  localizedHealthSummary,
  localizedServiceCategory,
} from '../i18n/uiLabels';

interface Props {
  stats: FleetCostStats;
  health: HealthScoreResult;
  title?: string;
  onExportPdf?: () => void;
}

export function FleetStatsPanel({ stats, health, title, onExportPdf }: Props) {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);
  const panelTitle = title ?? t('vehicles.stats');
  const maxCat = Math.max(...stats.byCategory.map((c) => c.total), 1);

  return (
    <div className="fleet-stats-panel">
      <div className="fleet-stats-head">
        <h3 className="section-title">{panelTitle}</h3>
        {onExportPdf && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExportPdf}>
            {t('stats.downloadPdf')}
          </button>
        )}
      </div>

      <div className="health-score-card">
        <div className="health-score-main">
          <span className={healthGradeClass(health.grade)}>{health.grade}</span>
          <div>
            <span className="health-score-value">{health.score}</span>
            <span className="health-score-max">/100</span>
            <p className="health-score-summary">{localizedHealthSummary(health, t)}</p>
          </div>
        </div>
        {health.factors.length > 0 && (
          <ul className="health-factors">
            {health.factors.map((f) => (
              <li key={f.key}>
                <span className="health-factor-label">{localizedHealthFactorLabel(f, t)}</span>
                <span className="health-factor-impact">{f.impact}</span>
                <span className="health-factor-detail">{localizedHealthFactorDetail(f, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stats-kpi-row">
        <div className="stats-kpi">
          <span className="stats-kpi-label">{t('stats.totalCost')}</span>
          <span className="stats-kpi-value">
            {stats.totalCost.toLocaleString(fmt, { minimumFractionDigits: 2 })} PLN
          </span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">{t('stats.claims')}</span>
          <span className="stats-kpi-value">{stats.claimCount}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-label">{t('stats.avgCost')}</span>
          <span className="stats-kpi-value">
            {stats.avgCost.toLocaleString(fmt, { minimumFractionDigits: 2 })} PLN
          </span>
        </div>
        <div className="stats-kpi stats-kpi-warn">
          <span className="stats-kpi-label">{t('stats.fraudFlags')}</span>
          <span className="stats-kpi-value">{stats.flaggedCount}</span>
        </div>
      </div>

      {stats.byCategory.length > 0 && (
        <div className="stats-category-block">
          <h4 className="stats-subtitle">{t('stats.costsByCategory')}</h4>
          <ul className="category-bars">
            {stats.byCategory.map((c) => {
              const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
              const pct = Math.round((c.total / maxCat) * 100);
              return (
                <li key={c.category} className="category-bar-row">
                  <span className="category-bar-label" title={c.category}>
                    {localizedServiceCategory(c.category, t)}
                  </span>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${pct}%`, backgroundColor: meta?.color ?? '#e87722' }}
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
          <h4 className="stats-subtitle">{t('stats.topServices')}</h4>
          <div className="table-wrap table-wrap-nested">
            <table>
              <thead>
                <tr>
                  <th>{t('stats.service')}</th>
                  <th>{t('stats.category')}</th>
                  <th className="col-numeric">{t('stats.count')}</th>
                  <th className="col-numeric">{t('stats.sum')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.byService.slice(0, 8).map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{localizedServiceCategory(s.category, t)}</td>
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
