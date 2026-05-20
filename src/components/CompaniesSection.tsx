import { useMemo, useState } from 'react';
import type { FleetCostStats } from '../services/fleetStats';
import type { CompanyCatalogData, CompanyCatalogItem } from '../services/companyCatalog';
import { vehiclesForCompany } from '../services/companyCatalog';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import type { VehicleCatalogItem } from '../services/vehicleCatalog';
import { FleetStatsPanel } from './FleetStatsPanel';
import { SortableTh } from './SortableTh';
import { sortArray, toggleSort, type SortState } from '../utils/tableSort';

type CompanySortKey = 'name' | 'area' | 'health' | 'cost' | 'vehicles';

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
  const [companySort, setCompanySort] = useState<SortState<CompanySortKey>>({ key: null, direction: 'asc' });

  const sortedFiltered = useMemo(
    () =>
      sortArray(filtered, companySort, (c) => {
        switch (companySort.key) {
          case 'name':
            return c.name;
          case 'area':
            return c.areaLabel || null;
          case 'health':
            return c.healthScore ?? null;
          case 'cost':
            return c.totalCost ?? null;
          case 'vehicles':
            return c.vehicleCount;
          default:
            return c.name;
        }
      }),
    [filtered, companySort],
  );

  const active =
    activeCompanyId && catalog
      ? sortedFiltered.find((c) => c.id === activeCompanyId) ??
        filtered.find((c) => c.id === activeCompanyId) ??
        catalog.companies.find((c) => c.id === activeCompanyId) ??
        null
      : null;
  const assigned = active ? vehiclesForCompany(fleetVehicles, active.name) : [];

  const onSort = (key: CompanySortKey) => setCompanySort((s) => toggleSort(s, key));

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
          <table className="fleet-table">
            <thead>
              <tr>
                <SortableTh label="Firma" sortKey="name" sort={companySort} onSort={onSort} />
                <SortableTh label="Region / miasto" sortKey="area" sort={companySort} onSort={onSort} />
                <SortableTh
                  label="Health"
                  sortKey="health"
                  sort={companySort}
                  onSort={onSort}
                  className="col-numeric"
                />
                <SortableTh
                  label="Koszty"
                  sortKey="cost"
                  sort={companySort}
                  onSort={onSort}
                  className="col-numeric"
                />
                <SortableTh
                  label="Pojazdy"
                  sortKey="vehicles"
                  sort={companySort}
                  onSort={onSort}
                  className="col-numeric"
                />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="center">
                    Ładowanie słownika firm…
                  </td>
                </tr>
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="center">
                    {catalog ? 'Brak firm spełniających filtry.' : 'Brak danych firm.'}
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((c) => (
                  <tr
                    key={c.id}
                    className={activeCompanyId === c.id ? 'row-active' : ''}
                    onClick={() => onSelectCompany(c.id)}
                  >
                    <td className="col-text-wrap">{c.name}</td>
                    <td className="col-text-wrap">{c.areaLabel || '—'}</td>
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
              <table className="fleet-table">
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
