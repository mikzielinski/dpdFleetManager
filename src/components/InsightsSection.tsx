import type { TableColumn } from '../config';
import { displayField } from '../services/dataFabric';
import type { FleetCostStats } from '../services/fleetStats';
import type { CompanyCatalogItem } from '../services/companyCatalog';
import type { VehicleCatalogItem } from '../services/vehicleCatalog';
import { isLikelyFlagged, getRecordNumericAmount } from '../utils/filterRecords';
import { healthGradeClass } from '../utils/healthScore';
import { pickField, recordId, type DpdRecord } from '../utils/record';

interface Props {
  costs: DpdRecord[];
  vehicles: VehicleCatalogItem[];
  companies: Array<CompanyCatalogItem & { totalCost?: number; healthGrade?: string }>;
  fleetStats: FleetCostStats;
  tableColumns: TableColumn[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenClaim: (id: string) => void;
  onOpenVehicle: (vehicleId: string) => void;
}

export function InsightsSection({
  costs,
  vehicles,
  companies,
  fleetStats,
  tableColumns,
  loading,
  error,
  onRefresh,
  onOpenClaim,
  onOpenVehicle,
}: Props) {
  const flagged = costs.filter((r) => isLikelyFlagged(r, tableColumns));
  const topVehicles = [...vehicles]
    .filter((v) => (v.totalCost ?? 0) > 0)
    .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
    .slice(0, 8);
  const topCompanies = [...companies]
    .filter((c) => (c.totalCost ?? 0) > 0)
    .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
    .slice(0, 8);
  const atRisk = vehicles
    .filter((v) => v.healthGrade === 'D' || v.healthGrade === 'F')
    .sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0))
    .slice(0, 8);

  if (loading) {
    return (
      <section className="panel overview-panel">
        <p className="center">Ładowanie analityki…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel overview-panel">
        <p className="error-text">{error}</p>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  return (
    <section className="panel overview-panel">
      <div className="panel-head">
        <h2>Analizy (Insights)</h2>
        <button type="button" className="btn btn-ghost" onClick={onRefresh}>
          Odśwież
        </button>
      </div>

      <div className="insights-summary-row">
        <div className="insights-chip">
          <span className="insights-chip-label">Oznaczone rozliczenia</span>
          <strong>{flagged.length}</strong>
        </div>
        <div className="insights-chip">
          <span className="insights-chip-label">Pojazdy ryzyka (D/F)</span>
          <strong>{atRisk.length}</strong>
        </div>
        <div className="insights-chip">
          <span className="insights-chip-label">Kategorie kosztów</span>
          <strong>{fleetStats.byCategory.length}</strong>
        </div>
      </div>

      <div className="insights-grid">
        <div className="insights-block">
          <h3 className="section-title">Oznaczenia i anomalie</h3>
          {flagged.length === 0 ? (
            <p className="hint-small">Brak oznaczonych rozliczeń w bieżących danych.</p>
          ) : (
            <div className="table-wrap table-wrap-nested">
              <table>
                <thead>
                  <tr>
                    <th>Pojazd</th>
                    <th>Usługa</th>
                    <th className="col-numeric">Netto</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.slice(0, 12).map((r) => {
                    const id = recordId(r);
                    return (
                      <tr
                        key={id}
                        className="row-clickable"
                        onClick={() => id && onOpenClaim(id)}
                      >
                        <td>{pickField(r, 'carRegistration')}</td>
                        <td>{pickField(r, 'serviceName')}</td>
                        <td className="col-numeric">
                          {(getRecordNumericAmount(r) ?? 0).toFixed(2)}
                        </td>
                        <td>
                          {displayField(
                            r,
                            tableColumns.find((c) => c.key === 'decision') ?? {
                              key: 'decision',
                              fieldName: 'Status',
                              label: 'Decyzja',
                            },
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="insights-block">
          <h3 className="section-title">Top pojazdy (koszt)</h3>
          {topVehicles.length === 0 ? (
            <p className="hint-small">Brak przypisanych kosztów do pojazdów.</p>
          ) : (
            <ul className="insights-rank-list">
              {topVehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="insights-rank-btn"
                    onClick={() => onOpenVehicle(v.id)}
                  >
                    <span className="insights-rank-name">{v.registration}</span>
                    <span className="insights-rank-meta">
                      {(v.totalCost ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
                      {v.healthGrade ? (
                        <span className={healthGradeClass(v.healthGrade)}>{v.healthGrade}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insights-block">
          <h3 className="section-title">Top firmy (koszt)</h3>
          {topCompanies.length === 0 ? (
            <p className="hint-small">Brak danych o firmach.</p>
          ) : (
            <ul className="insights-rank-list">
              {topCompanies.map((c) => (
                <li key={c.id}>
                  <span className="insights-rank-name">{c.name}</span>
                  <span className="insights-rank-meta">
                    {(c.totalCost ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN ·{' '}
                    {c.vehicleCount} poj.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insights-block">
          <h3 className="section-title">Pojazdy wymagające uwagi</h3>
          {atRisk.length === 0 ? (
            <p className="hint-small">Brak pojazdów z oceną D lub F.</p>
          ) : (
            <ul className="insights-rank-list">
              {atRisk.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="insights-rank-btn"
                    onClick={() => onOpenVehicle(v.id)}
                  >
                    <span className="insights-rank-name">{v.registration}</span>
                    <span className="insights-rank-meta">
                      <span className={healthGradeClass(v.healthGrade ?? 'F')}>
                        {v.healthGrade}
                      </span>
                      · {v.healthScore ?? 0}/100
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
