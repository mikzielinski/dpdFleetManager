import type { AnalysisVariables } from '../services/maestro';
import { riskBg, riskColor } from '../utils/record';

interface Props {
  results: AnalysisVariables | null;
  title?: string;
  /** Shown when there is no persisted/session AI result yet (e.g. Flagged without VehicleFlags row). */
  pendingHint?: string | null;
}

export function AnalysisResults({
  results,
  title = 'Wynik analizy AI',
  pendingHint,
}: Props) {
  if (!results) {
    if (!pendingHint) return null;
    return (
      <section className="analysis-panel analysis-panel-pending">
        <h3 className="section-title">{title}</h3>
        <p className="hint-small">{pendingHint}</p>
      </section>
    );
  }
  const rl = results.riskLevel;

  return (
    <section className="analysis-panel">
      <h3 className="section-title">{title}</h3>

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
          <div className="card-label">Wynik fraud</div>
          <div className="card-value score">{results.combinedScore ?? '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">Poziom ryzyka</div>
          <div className="card-value" style={{ color: riskColor(rl) }}>
            {rl ?? '—'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Kwota</div>
          <div className="card-value">{results.declaredAmount ?? '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">Pojazd</div>
          <div className="card-value">{results.vehicleReg ?? '—'}</div>
        </div>
      </div>

      {results.flagType && (
        <>
          <h4 className="section-sub">Wykryta anomalia</h4>
          <p className="anomaly-flag">{results.flagType}</p>
        </>
      )}

      {results.decision && (
        <p className="decision-line">
          <strong>Decyzja automatyczna:</strong> {results.decision}
        </p>
      )}

      {results.validationStatus && (
        <p className="meta-line">
          <strong>Walidacja faktury:</strong> {results.validationStatus}
        </p>
      )}

      {results.summary && !results.fleetManagerNote && (
        <p className="meta-line">{results.summary}</p>
      )}
    </section>
  );
}


