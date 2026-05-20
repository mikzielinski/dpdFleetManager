import type { VehicleCompliance } from '../utils/vehicleCompliance';

interface Props {
  compliance: VehicleCompliance;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'Ważne';
    case 'due_soon':
      return 'Wkrótce wygasa';
    case 'expired':
      return 'Po terminie';
    default:
      return 'Brak danych';
  }
}

function statusClass(status: string): string {
  return `compliance-status compliance-status-${status}`;
}

export function CompliancePanel({ compliance }: Props) {
  const mileageNote =
    compliance.mileageSource === 'estimated'
      ? ' (estymata — uzupełnij pole w DPD_B2B_Vehicles)'
      : compliance.mileageSource === 'fabric'
        ? ''
        : ' (brak w encji)';

  return (
    <div className="compliance-panel">
      <h3 className="section-title">Compliance pojazdu</h3>

      <dl className="detail-grid detail-grid-compact">
        <div className="detail-item">
          <dt>Przebieg</dt>
          <dd>
            {compliance.mileageKm != null
              ? `${compliance.mileageKm.toLocaleString('pl-PL')} km`
              : '—'}
            <span className="hint-inline">{mileageNote}</span>
          </dd>
        </div>
        <div className="detail-item">
          <dt>Badanie techniczne do</dt>
          <dd>
            <span className={statusClass(compliance.inspectionStatus)}>
              {compliance.inspectionValidUntil ?? '—'} — {statusLabel(compliance.inspectionStatus)}
            </span>
          </dd>
        </div>
      </dl>

      <h4 className="stats-subtitle">Ubezpieczenia</h4>
      <div className="table-wrap table-wrap-nested">
        <table>
          <thead>
            <tr>
              <th>Typ polisy</th>
              <th>Ważna do</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {compliance.policies.map((p) => (
              <tr key={p.type}>
                <td>{p.label}</td>
                <td>{p.validUntil ?? '—'}</td>
                <td>
                  <span className={statusClass(p.status)}>{statusLabel(p.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compliance.complianceIssues.length > 0 && (
        <div className="compliance-alerts">
          <strong>Nieprawidłowości biznesowe</strong>
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
