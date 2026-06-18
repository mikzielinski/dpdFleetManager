import type { VehicleCompliance } from '../utils/vehicleCompliance';
import { useI18n } from '../i18n/I18nProvider';
import { formatLocale } from '../i18n/uiLabels';

interface Props {
  compliance: VehicleCompliance;
}

export function CompliancePanel({ compliance }: Props) {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);

  const statusLabel = (status: string): string => {
    const key = `compliance.status.${status}`;
    const label = t(key);
    return label === key ? t('compliance.status.unknown') : label;
  };

  const mileageNote =
    compliance.mileageSource === 'estimated'
      ? t('compliance.mileageEstimated')
      : compliance.mileageSource === 'fabric'
        ? ''
        : t('compliance.mileageMissing');

  return (
    <div className="compliance-panel">
      <h3 className="section-title">{t('compliance.title')}</h3>

      <dl className="detail-grid detail-grid-compact">
        <div className="detail-item">
          <dt>{t('compliance.mileage')}</dt>
          <dd>
            {compliance.mileageKm != null
              ? `${compliance.mileageKm.toLocaleString(fmt)} km`
              : '—'}
            <span className="hint-inline">{mileageNote}</span>
          </dd>
        </div>
        <div className="detail-item">
          <dt>{t('compliance.inspectionUntil')}</dt>
          <dd>
            <span className={`compliance-status compliance-status-${compliance.inspectionStatus}`}>
              {compliance.inspectionValidUntil ?? '—'} — {statusLabel(compliance.inspectionStatus)}
            </span>
          </dd>
        </div>
      </dl>

      <h4 className="stats-subtitle">{t('compliance.policies')}</h4>
      <div className="table-wrap table-wrap-nested">
        <table>
          <thead>
            <tr>
              <th>{t('compliance.policyType')}</th>
              <th>{t('compliance.validUntil')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {compliance.policies.map((p) => (
              <tr key={p.type}>
                <td>{p.label}</td>
                <td>{p.validUntil ?? '—'}</td>
                <td>
                  <span className={`compliance-status compliance-status-${p.status}`}>
                    {statusLabel(p.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compliance.complianceIssues.length > 0 && (
        <div className="compliance-alerts">
          <strong>{t('compliance.issues')}</strong>
          <ul>
            {compliance.complianceIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
