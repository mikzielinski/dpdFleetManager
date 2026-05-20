import type { FleetCostStats } from '../services/fleetStats';
import type { CompanyCatalogData, CompanyCatalogItem } from '../services/companyCatalog';
import { vehiclesForCompany } from '../services/companyCatalog';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import type { VehicleCatalogItem } from '../services/vehicleCatalog';
import { FleetStatsPanel } from './FleetStatsPanel';

interface Props {
  catalog: CompanyCatalogData | null;
  loading: boolean;
  error: string | null;
  filtered: CompanyCatalogItem[];
  fleetVehicles: VehicleCatalogItem[];
  activeCompanyId: string | null;
  activeCompanyStats: FleetCostStats | null;
  activeCompanyHealth: HealthScoreResult | null;
  onSelectCompany: (id: string) => void;
  onRefresh: () => void;
  onOpenVehicle: (registration: string) => void;
  onExportCompanyPdf: () => void;
}

export function CompaniesSection({
  catalog,
  loading,
  error,
  filtered,
  fleetVehicles,
  activeCompanyId,
  activeCompanyStats,
  activeCompanyHealth,
  onSelectCompany,
  onRefresh,
  onOpenVehicle,
  onExportCompanyPdf,
}: Props) {
  const active =
    activeCompanyId && catalog
      ? filtered.find((c) => c.id === activeCompanyId) ??
        catalog.companies.find((c) => c.id === activeCompanyId) ??
        null
      : null;
  const assigned = active ? vehiclesForCompany(fleetVehicles, active.name) : [];

  return (
    <div className="layout master-detail-layout">
      <section className="panel table-panel master-pane">
        <div className="panel-head">
          <h2>Firmy kurierskie (DPD_B2B_Courier_Companies)</h2>
          <button type="button" className="btn btn-ghost" disabled={loading} onClick={onRefresh}>
            Odśwież ({catalog?.totalCompanies ?? '…'})
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Firma</th>
                <th>Region / miasto</th>
                <th className="col-numeric">Health</th>
                <th className="col-numeric">Koszty</th>
                <th className="col-numeric">Pojazdy</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="center">
                    Ładowanie słownika firm…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="center">
                    {catalog ? 'Brak firm spełniających filtry.' : 'Brak danych firm.'}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={activeCompanyId === c.id ? 'row-active' : ''}
                    onClick={() => onSelectCompany(c.id)}
                  >
                    <td>{c.name}</td>
                    <td>{c.areaLabel || '—'}</td>
                    <td className="col-numeric">
                      {c.healthGrade ? (
                        <span className={healthGradeClass(c.healthGrade)}>{c.healthScore}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-numeric">
                      {c.totalCost != null && c.totalCost > 0
                        ? c.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td className="col-numeric">{c.vehicleCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel detail-panel detail-pane">
        {!active ? (
          <p className="placeholder">
            Wybierz firmę z listy, aby zobaczyć statystyki kosztów, health score i pojazdy floty.
          </p>
        ) : (
          <>
            <div className="detail-preview-card">
              <h3 className="section-title">Podgląd firmy</h3>
              <dl className="detail-grid detail-grid-compact">
                <div className="detail-item">
                  <dt>Nazwa</dt>
                  <dd>{active.name}</dd>
                </div>
                <div className="detail-item">
                  <dt>Region / miasto</dt>
                  <dd>{active.areaLabel || '—'}</dd>
                </div>
                <div className="detail-item">
                  <dt>Pojazdy we flocie</dt>
                  <dd>{active.vehicleCount}</dd>
                </div>
              </dl>
            </div>

            {activeCompanyStats && activeCompanyHealth && (
              <FleetStatsPanel
                stats={activeCompanyStats}
                health={activeCompanyHealth}
                title="Statystyki kosztów firmy"
                onExportPdf={onExportCompanyPdf}
              />
            )}

            <h3 className="section-title">Pojazdy B2B</h3>
            <div className="table-wrap table-wrap-nested">
              <table>
                <thead>
                  <tr>
                    <th>Rejestracja</th>
                    <th>Region</th>
                    <th className="col-numeric">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="center">
                        Brak pojazdów przypisanych do tej firmy w katalogu floty.
                      </td>
                    </tr>
                  ) : (
                    assigned.map((v) => (
                      <tr key={v.id} onClick={() => onOpenVehicle(v.registration)}>
                        <td>{v.registration}</td>
                        <td>{v.areaLabel || '—'}</td>
                        <td className="col-numeric">
                          {v.healthGrade ? (
                            <span className={healthGradeClass(v.healthGrade)}>{v.healthScore}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="hint-small">Kliknij rejestrację, aby przejść do zakładki Pojazdy.</p>
          </>
        )}
      </section>
    </div>
  );
}
