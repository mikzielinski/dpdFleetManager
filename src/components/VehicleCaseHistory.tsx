import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  items: VehicleFlagHistoryItem[];
  loading: boolean;
  error: string | null;
  carRegistration: string;
}

export function VehicleCaseHistory({ items, loading, error, carRegistration }: Props) {
  const { t } = useI18n();

  return (
    <section className="case-history">
      <h3 className="section-title">{t('history.title')}</h3>
      {loading && <p className="hint-small">{t('history.loading')}</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="hint-small">{t('history.empty', { registration: carRegistration })}</p>
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
                  <span className="meta-label">{t('history.required')}:</span> {item.requiresAction}
                </p>
              )}
              {item.relatedCostRecordId !== '—' && (
                <p className="hint-small">
                  {t('history.relatedCost')}: {item.relatedCostRecordId}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
