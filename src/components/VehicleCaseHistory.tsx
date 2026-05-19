import type { VehicleFlagHistoryItem } from '../services/dataFabric';

interface Props {
  items: VehicleFlagHistoryItem[];
  loading: boolean;
  error: string | null;
  carRegistration: string;
}

export function VehicleCaseHistory({ items, loading, error, carRegistration }: Props) {
  return (
    <section className="case-history">
      <h3 className="section-title">Historia zgłoszeń pojazdu</h3>
      {loading && <p className="hint-small">Ładowanie historii z DPD_VehicleFlags…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="hint-small">
          Brak historii dla rejestracji <strong>{carRegistration}</strong> w encji{' '}
          <a
            href="https://staging.uipath.com/mzpocevylrxu/DefaultTenant/datafabric_/entities/8d83c3fe-c34a-f111-8ef3-000d3a261acd"
            target="_blank"
            rel="noreferrer"
          >
            DPD_VehicleFlags
          </a>
          . Pole <em>Vehicle ID</em> musi odpowiadać numerowi rejestracyjnemu (np. WA 622 AV).
        </p>
      )}
      {!loading && items.length > 0 && (
        <ul className="case-history-list">
          {items.map((item) => (
            <li key={item.id} className="case-history-card">
              <div className="case-history-head">
                <span className="case-history-date">{item.flaggedAt}</span>
                {item.aiConfidenceScore !== '—' && (
                  <span className="case-history-score">AI: {item.aiConfidenceScore}</span>
                )}
              </div>
              <p className="case-history-desc">{item.description}</p>
              {item.requiresAction !== '—' && (
                <p className="case-history-action">
                  <span className="meta-label">Wymagane:</span> {item.requiresAction}
                </p>
              )}
              {item.relatedCostRecordId !== '—' && (
                <p className="hint-small">Powiązany koszt: {item.relatedCostRecordId}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
