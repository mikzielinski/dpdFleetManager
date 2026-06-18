import { useMemo, useState } from 'react';
import { AnalysisResults } from './AnalysisResults';
import { useI18n } from '../i18n/I18nProvider';
import { formatLocale } from '../i18n/uiLabels';
import {
  buildVehicleRiskRows,
  filterInsights,
  insightsSummary,
  type EnrichedInsight,
  type InsightFilter,
  type InsightSignal,
  type InsightSignalKey,
} from '../utils/insightsEngine';
import { pickField, recordId, riskBg, riskColor } from '../utils/record';

interface Props {
  items: EnrichedInsight[];
  fleetMedian: number;
  loading?: boolean;
  error?: string | null;
  maestroReady: boolean;
  onOpenClaim: (id: string) => void;
  onAnalyzeSelected: () => void;
  onSelectVehicle?: (registration: string) => void;
}

const SIGNAL_ORDER: InsightSignalKey[] = [
  'fraud_flag',
  'flagged',
  'high_risk',
  'ai_score',
  'high_cost',
  'anomaly',
  'pending_review',
  'repeat_vehicle',
];

function signalClass(severity: InsightSignal['severity']): string {
  if (severity === 'high') return 'insights-signal--high';
  if (severity === 'medium') return 'insights-signal--medium';
  return 'insights-signal--low';
}

function riskScoreClass(score: number): string {
  if (score >= 55) return 'insights-score--high';
  if (score >= 30) return 'insights-score--medium';
  return 'insights-score--low';
}

export function InsightsSection({
  items,
  fleetMedian,
  loading,
  error,
  maestroReady,
  onOpenClaim,
  onAnalyzeSelected,
  onSelectVehicle,
}: Props) {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InsightFilter>('all');
  const [vehicleQuery, setVehicleQuery] = useState('');

  const vehicleRows = useMemo(() => buildVehicleRiskRows(items), [items]);
  const summary = useMemo(() => insightsSummary(items, vehicleRows), [items, vehicleRows]);

  const filtered = useMemo(() => {
    let list = filterInsights(items, filter);
    const q = vehicleQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => i.vehicleReg.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, vehicleQuery]);

  const signalBreakdown = useMemo(() => {
    const counts = new Map<InsightSignalKey, number>();
    for (const item of items) {
      for (const s of item.signals) {
        counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
      }
    }
    return SIGNAL_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 })).filter(
      (x) => x.count > 0,
    );
  }, [items]);

  const serviceBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; totalRisk: number }>();
    for (const item of items) {
      const svc = item.serviceName !== '—' ? item.serviceName : t('insights.unknownService');
      const row = map.get(svc) ?? { count: 0, totalRisk: 0 };
      row.count += 1;
      row.totalRisk += item.riskScore;
      map.set(svc, row);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, avgRisk: Math.round(v.totalRisk / v.count) }))
      .sort((a, b) => b.avgRisk - a.avgRisk || b.count - a.count)
      .slice(0, 8);
  }, [items, t]);

  const selected = useMemo(
    () => filtered.find((i) => i.id === selectedId) ?? items.find((i) => i.id === selectedId) ?? null,
    [filtered, items, selectedId],
  );

  const filters: { key: InsightFilter; label: string }[] = [
    { key: 'all', label: t('insights.filterAll') },
    { key: 'high', label: t('insights.filterHigh') },
    { key: 'medium', label: t('insights.filterMedium') },
    { key: 'flagged', label: t('insights.filterFlagged') },
    { key: 'high_cost', label: t('insights.filterHighCost') },
  ];

  const formatPln = (n: number) =>
    n.toLocaleString(fmt, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <section className="panel insights-panel">
      <div className="panel-head">
        <div>
          <h2>{t('insights.title')}</h2>
          <p className="panel-sub">{t('insights.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!maestroReady}
          onClick={onAnalyzeSelected}
          title={!maestroReady ? t('header.maestroMissing') : undefined}
        >
          {t('insights.runMaestro')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="placeholder">{t('insights.loading')}</p>}

      {!loading && (
        <>
          <div className="insights-kpi-row insights-kpi-row--wide">
            <div className="insights-kpi">
              <span className="insights-kpi-label">{t('insights.kpiFlagged')}</span>
              <span className="insights-kpi-value">{summary.total}</span>
            </div>
            <div className="insights-kpi">
              <span className="insights-kpi-label">{t('insights.kpiVehicles')}</span>
              <span className="insights-kpi-value">{summary.vehicles}</span>
            </div>
            <div className="insights-kpi insights-kpi-warn">
              <span className="insights-kpi-label">{t('insights.kpiHighRisk')}</span>
              <span className="insights-kpi-value">{summary.highRisk}</span>
            </div>
            <div className="insights-kpi">
              <span className="insights-kpi-label">{t('insights.kpiWithAnalysis')}</span>
              <span className="insights-kpi-value">{summary.withAi}</span>
            </div>
            <div className="insights-kpi">
              <span className="insights-kpi-label">{t('insights.kpiPending')}</span>
              <span className="insights-kpi-value">{summary.pending}</span>
            </div>
            <div className="insights-kpi insights-kpi-danger">
              <span className="insights-kpi-label">{t('insights.kpiAmountAtRisk')}</span>
              <span className="insights-kpi-value insights-kpi-value--sm">
                {formatPln(summary.amountAtRisk)} PLN
              </span>
            </div>
          </div>

          {fleetMedian > 0 && (
            <p className="insights-median-hint">
              {t('insights.medianHint', { median: formatPln(fleetMedian) })}
            </p>
          )}

          {items.length === 0 ? (
            <p className="placeholder">{t('insights.empty')}</p>
          ) : (
            <>
              <div className="insights-analytics-row">
                <div className="insights-analytics-card">
                  <h3 className="section-title">{t('insights.vehicleLeaderboard')}</h3>
                  <div className="insights-vehicle-table-wrap">
                    <table className="insights-mini-table">
                      <thead>
                        <tr>
                          <th>{t('table.vehicle')}</th>
                          <th>{t('insights.colClaims')}</th>
                          <th>{t('insights.colFlagged')}</th>
                          <th>{t('insights.colRisk')}</th>
                          <th>{t('stats.sum')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicleRows.map((row) => (
                          <tr key={row.registration}>
                            <td>
                              <button
                                type="button"
                                className="insights-vehicle-link"
                                onClick={() => {
                                  setVehicleQuery(row.registration);
                                  setFilter('all');
                                  onSelectVehicle?.(row.registration);
                                }}
                              >
                                {row.registration}
                              </button>
                            </td>
                            <td>{row.claimCount}</td>
                            <td>{row.flaggedCount}</td>
                            <td>
                              <span className={`insights-score-pill ${riskScoreClass(row.maxRiskScore)}`}>
                                {row.maxRiskScore}
                              </span>
                            </td>
                            <td>{formatPln(row.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="insights-analytics-card">
                  <h3 className="section-title">{t('insights.signalBreakdown')}</h3>
                  <ul className="insights-bar-list">
                    {signalBreakdown.map(({ key, count }) => {
                      const pct = Math.round((count / Math.max(items.length, 1)) * 100);
                      return (
                        <li key={key} className="insights-bar-item">
                          <div className="insights-bar-label-row">
                            <span>{t(`insights.signals.${key}`)}</span>
                            <span className="insights-bar-count">{count}</span>
                          </div>
                          <div className="insights-bar-track">
                            <div className="insights-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="insights-analytics-card">
                  <h3 className="section-title">{t('insights.topSuspiciousServices')}</h3>
                  <ul className="insights-service-list">
                    {serviceBreakdown.map((svc) => (
                      <li key={svc.name} className="insights-service-item">
                        <span className="insights-service-name">{svc.name}</span>
                        <span className="insights-service-meta">
                          {svc.count} · {t('insights.avgRisk')} {svc.avgRisk}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="insights-toolbar">
                <div className="insights-filter-tabs" role="tablist">
                  {filters.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.key}
                      className={`insights-filter-tab${filter === f.key ? ' insights-filter-tab--active' : ''}`}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  className="insights-vehicle-search"
                  placeholder={t('insights.vehicleSearch')}
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                />
              </div>

              <div className="insights-layout">
                <div className="insights-list-pane">
                  <h3 className="section-title">
                    {t('insights.listTitle')} ({filtered.length})
                  </h3>
                  {filtered.length === 0 ? (
                    <p className="placeholder">{t('insights.noFilterMatch')}</p>
                  ) : (
                    <ul className="insights-risk-list">
                      {filtered.map((item) => {
                        const { record, analysis, riskScore, signals, amount } = item;
                        const id = recordId(record);
                        const active = selectedId === id;
                        const rl = analysis?.riskLevel;
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className={`insights-risk-card${active ? ' insights-risk-card--active' : ''}`}
                              onClick={() => setSelectedId(id)}
                            >
                              <div className="insights-risk-card-top">
                                <span className="insights-risk-reg">{item.vehicleReg}</span>
                                <span className={`insights-score-pill ${riskScoreClass(riskScore)}`}>
                                  {riskScore}
                                </span>
                              </div>
                              <span className="insights-risk-service">{item.serviceName}</span>
                              <div className="insights-signal-row">
                                {signals.slice(0, 4).map((s) => (
                                  <span
                                    key={s.key}
                                    className={`insights-signal ${signalClass(s.severity)}`}
                                    title={s.detail}
                                  >
                                    {t(`insights.signals.${s.key}`)}
                                    {s.detail ? `: ${s.detail}` : ''}
                                  </span>
                                ))}
                              </div>
                              <div className="insights-risk-meta">
                                {amount != null && (
                                  <span>
                                    {formatPln(amount)} PLN
                                    {fleetMedian > 0 && amount > fleetMedian && (
                                      <span className="insights-over-median">
                                        {' '}
                                        ({Math.round((amount / fleetMedian) * 100)}% med.)
                                      </span>
                                    )}
                                  </span>
                                )}
                                {rl && (
                                  <span
                                    className="insights-risk-badge"
                                    style={{ color: riskColor(rl), background: riskBg(rl) }}
                                  >
                                    {rl}
                                  </span>
                                )}
                                {analysis?.combinedScore != null && (
                                  <span>
                                    {t('analysis.fraudScore')}: <strong>{analysis.combinedScore}</strong>
                                  </span>
                                )}
                                <span>{item.decision}</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <aside className="insights-detail-pane">
                  {!selected ? (
                    <div className="insights-detail-empty">
                      <p className="placeholder">{t('insights.selectHint')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="insights-detail-head">
                        <div>
                          <h3 className="section-title">{t('insights.detailTitle')}</h3>
                          <span className={`insights-score-pill ${riskScoreClass(selected.riskScore)}`}>
                            {t('insights.riskScore')}: {selected.riskScore}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onOpenClaim(selected.id)}
                        >
                          {t('insights.openClaim')}
                        </button>
                      </div>

                      {selected.signals.length > 0 && (
                        <div className="insights-detail-signals">
                          <h4 className="section-sub">{t('insights.whyFlagged')}</h4>
                          <ul className="insights-signal-detail-list">
                            {selected.signals.map((s) => (
                              <li key={s.key} className={`insights-signal ${signalClass(s.severity)}`}>
                                <strong>{t(`insights.signals.${s.key}`)}</strong>
                                {s.detail ? ` — ${s.detail}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <dl className="detail-grid detail-grid-compact insights-detail-grid">
                        <div className="detail-item">
                          <dt>{t('table.vehicle')}</dt>
                          <dd>{pickField(selected.record, 'carRegistration', 'CarRegistration')}</dd>
                        </div>
                        <div className="detail-item">
                          <dt>{t('table.service')}</dt>
                          <dd>{pickField(selected.record, 'serviceName', 'ServiceName')}</dd>
                        </div>
                        <div className="detail-item">
                          <dt>{t('common.status')}</dt>
                          <dd>{pickField(selected.record, 'decision', 'Decision')}</dd>
                        </div>
                        <div className="detail-item">
                          <dt>{t('table.net')}</dt>
                          <dd>
                            {pickField(selected.record, 'netPrice', 'NetPrice')}
                            {selected.amount != null && fleetMedian > 0 && (
                              <span className="insights-over-median">
                                {' '}
                                ({Math.round((selected.amount / fleetMedian) * 100)}%{' '}
                                {t('insights.ofMedian')})
                              </span>
                            )}
                          </dd>
                        </div>
                        <div className="detail-item">
                          <dt>{t('insights.fleetMedian')}</dt>
                          <dd>{formatPln(fleetMedian)} PLN</dd>
                        </div>
                      </dl>

                      <AnalysisResults
                        results={selected.analysis}
                        title={t('analysis.title')}
                        showEmpty
                      />
                    </>
                  )}
                </aside>
              </div>
            </>
          )}

          <p className="hint-small insights-hint">
            {t('insights.hint', { count: items.length.toLocaleString(fmt) })}
          </p>
        </>
      )}
    </section>
  );
}
