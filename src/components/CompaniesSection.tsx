import { useMemo, useState } from 'react';
import type { FleetCostStats } from '../services/fleetStats';
import type { CompanyCatalogData, CompanyCatalogItem } from '../services/companyCatalog';
import { vehiclesForCompany } from '../services/companyCatalog';
import type { HealthScoreResult } from '../utils/healthScore';
import { healthGradeClass } from '../utils/healthScore';
import type { VehicleCatalogItem } from '../services/vehicleCatalog';
import { FleetStatsPanel } from './FleetStatsPanel';
import { SortableDataTable, type DataTableColumn } from './SortableDataTable';
import {
  applyTableView,
  type ColumnFilters,
  type TableSortState,
} from '../utils/sortableTable';

interface Props {
  catalog: CompanyCatalogData | null;
  loading: boolean;
  error: string | null;
  rows: CompanyCatalogItem[];
  columns: DataTableColumn<CompanyCatalogItem>[];
  sort: TableSortState | null;
  onSortChange: (sort: TableSortState | null) => void;
  columnFilters: ColumnFilters;
  onColumnFiltersChange: (filters: ColumnFilters) => void;
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
  rows,
  columns,
  sort,
  onSortChange,
  columnFilters,
  onColumnFiltersChange,
  fleetVehicles,
  activeCompanyId,
  activeCompanyStats,
  activeCompanyHealth,
  onSelectCompany,
  onRefresh,
  onOpenVehicle,
  onExportCompanyPdf,
}: Props) {
  const [assignedSort, setAssignedSort] = useState<TableSortState | null>(null);
  const [assignedFilters, setAssignedFilters] = useState<ColumnFilters>({});

  const active =
    activeCompanyId && catalog
      ? rows.find((c) => c.id === activeCompanyId) ??
        catalog.companies.find((c) => c.id === activeCompanyId) ??
        null
      : null;
  const assigned = active ? vehiclesForCompany(fleetVehicles, active.name) : [];

  const assignedColumns = useMemo((): DataTableColumn<VehicleCatalogItem>[] => [
    {
      key: 'registration',
      label: 'Rejestracja',
      render: (v) => v.registration,
      sortValue: (v) => v.registration,
      filterText: (v) => v.registration,
    },
    {
      key: 'areaLabel',
      label: 'Region',
      render: (v) => v.areaLabel || '—',
      sortValue: (v) => v.areaLabel,
      filterText: (v) => v.areaLabel,
    },
    {
      key: 'rate',
      label: 'Rate',
      align: 'right',
      render: (v) =>
        v.healthGrade ? (
          <span className={healthGradeClass(v.healthGrade)}>{v.healthGrade}</span>
        ) : (
          '—'
        ),
      sortValue: (v) => v.healthGrade ?? '',
      filterText: (v) => v.healthGrade ?? '',
    },
    {
      key: 'healthScore',
      label: 'Health',
      align: 'right',
      render: (v) =>
        v.healthGrade ? (
          <span className={healthGradeClass(v.healthGrade)}>{v.healthScore}</span>
        ) : (
          '—'
        ),
      sortValue: (v) => v.healthScore ?? null,
      filterText: (v) => (v.healthScore != null ? String(v.healthScore) : ''),
    },
  ], []);

  const assignedColumnKeys = useMemo(
    () => assignedColumns.map((c) => c.key),
    [assignedColumns],
  );

  const displayAssigned = useMemo(
    () =>
      applyTableView(
        assigned,
        assignedSort,
        assignedFilters,
        assignedColumnKeys,
        (v, key) => assignedColumns.find((c) => c.key === key)?.filterText?.(v) ?? '',
        (v, key) => assignedColumns.find((c) => c.key === key)?.sortValue?.(v) ?? '',
      ),
    [assigned, assignedSort, assignedFilters, assignedColumnKeys, assignedColumns],
  );

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
          <SortableDataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            sort={sort}
            onSortChange={onSortChange}
            columnFilters={columnFilters}
            onColumnFiltersChange={onColumnFiltersChange}
            onRowClick={(c) => onSelectCompany(c.id)}
            activeRowKey={activeCompanyId}
            loading={loading}
            loadingMessage="Ładowanie słownika firm…"
            emptyMessage={catalog ? 'Brak firm spełniających filtry.' : 'Brak danych firm.'}
          />
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
              <SortableDataTable
                columns={assignedColumns}
                rows={displayAssigned}
                rowKey={(v) => v.id}
                sort={assignedSort}
                onSortChange={setAssignedSort}
                columnFilters={assignedFilters}
                onColumnFiltersChange={setAssignedFilters}
                onRowClick={(v) => onOpenVehicle(v.registration)}
                emptyMessage="Brak pojazdów przypisanych do tej firmy w katalogu floty."
              />
            </div>
            <p className="hint-small">Kliknij rejestrację, aby przejść do zakładki Pojazdy.</p>
          </>
        )}
      </section>
    </div>
  );
}
