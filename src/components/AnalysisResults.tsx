import type { AnalysisVariables } from '../services/maestro';
import { useI18n } from '../i18n/I18nProvider';
import { riskBg, riskColor } from '../utils/record';

interface Props {
  results: AnalysisVariables | null;
  title?: string;
  showEmpty?: boolean;
  runStatus?: string;
}

export function AnalysisResults({ results, title, showEmpty = true, runStatus }: Props) {
  const { t } = useI18n();
  const panelTitle = title ?? t('analysis.title');

  if (!results) {
    if (!showEmpty) return null;
    return (
      <section className="analysis-panel analysis-panel--empty">
        <h3 className="section-title">{panelTitle}</h3>
        <p className="placeholder">{t('analysis.empty')}</p>
      </section>
    );
  }

  const rl = results.riskLevel;

  return (
    <section className="analysis-panel">
      <div className="analysis-panel-head">
        <h3 className="section-title">{panelTitle}</h3>
        {runStatus && (
          <span className="badge badge-muted analysis-run-badge" title={runStatus}>
            {t('analysis.runStatus', { status: runStatus })}
          </span>
        )}
      </div>

      {results.fleetManagerNote && (
        <div
          className="fraud-note"
          style={{ borderLeftColor: riskColor(rl), background: riskBg(rl) }}
        >
          {results.fleetManagerNote}
        </div>
      )}

      <div className="cards-row">
        <div className="card">
          <div className="card-label">{t('analysis.fraudScore')}</div>
          <div className="card-value score">{results.combinedScore ?? '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">{t('analysis.riskLevel')}</div>
          <div className="card-value" style={{ color: riskColor(rl) }}>
            {rl ?? '—'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">{t('analysis.amount')}</div>
          <div className="card-value">{results.declaredAmount ?? '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">{t('analysis.vehicle')}</div>
          <div className="card-value">{results.vehicleReg ?? '—'}</div>
        </div>
      </div>

      {results.flagType && (
        <>
          <h4 className="section-sub">{t('analysis.anomaly')}</h4>
          <p className="anomaly-flag">{results.flagType}</p>
        </>
      )}

      {results.fraudFlag && (
        <p className="meta-line">
          <strong>{t('analysis.fraudFlag')}</strong> {results.fraudFlag}
        </p>
      )}

      {results.decision && (
        <p className="decision-line">
          <strong>{t('analysis.autoDecision')}</strong> {results.decision}
        </p>
      )}

      {results.validationStatus && (
        <p className="meta-line">
          <strong>{t('analysis.validation')}</strong> {results.validationStatus}
        </p>
      )}

      {results.summary && !results.fleetManagerNote && (
        <p className="meta-line">{results.summary}</p>
      )}
    </section>
  );
}
