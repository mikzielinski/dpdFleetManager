import type { ClaimsFilterState } from '../utils/filterRecords';
import type { VehicleFilterState } from '../utils/vehicleFilters';

type MainSection = 'claims' | 'vehicles';

interface Props {
  section: MainSection;
  filters: ClaimsFilterState;
  onFiltersChange: (next: ClaimsFilterState) => void;
  vehicleFilters: VehicleFilterState;
  onVehicleFiltersChange: (next: VehicleFilterState) => void;
  areaOptions: string[];
  vehicleCompanyOptions: string[];
  serviceOptions: string[];
  decisionOptions: string[];
  filteredCount: number;
  totalCount: number;
  /** When true, filters run on full dataset loaded from API (not one page). */
  globalFilterActive?: boolean;
  datasetTotal?: number | null;
  onReset: () => void;
}

export function GlobalFilterBar({
  section,
  filters,
  onFiltersChange,
  vehicleFilters,
  onVehicleFiltersChange,
  areaOptions,
  vehicleCompanyOptions,
  serviceOptions,
  decisionOptions,
  filteredCount,
  totalCount,
  globalFilterActive = false,
  datasetTotal = null,
  onReset,
}: Props) {
  const patch = (partial: Partial<ClaimsFilterState>) =>
    onFiltersChange({ ...filters, ...partial });
  const patchVehicle = (partial: Partial<VehicleFilterState>) =>
    onVehicleFiltersChange({ ...vehicleFilters, ...partial });

  const hasActiveVehicleFilters =
    vehicleFilters.query.trim() !== '' ||
    vehicleFilters.area !== '' ||
    vehicleFilters.company !== '';

  const hasActiveClaimsFilters =
    filters.query.trim() !== '' ||
    filters.serviceName !== '' ||
    filters.decision !== '' ||
    filters.amountMin.trim() !== '' ||
    filters.amountMax.trim() !== '' ||
    filters.flaggedOnly;

  return (
    <div className="global-filter-bar" role="search" aria-label="Wyszukiwanie i filtry">
      <div className="global-filter-bar-head">
        <span className="global-filter-bar-title">Wyszukiwanie i filtry</span>
        {(section === 'claims' ? hasActiveClaimsFilters : hasActiveVehicleFilters) && (
          <button type="button" className="btn btn-link-reset" onClick={onReset}>
            Wyczyść
          </button>
        )}
        <span className="global-filter-count">
          Pasujące: <strong>{filteredCount}</strong>
          {globalFilterActive ? (
            <>
              {' '}
              (przeszukano <strong>{totalCount}</strong>
              {datasetTotal != null && datasetTotal !== totalCount ? (
                <> z {datasetTotal} w bazie</>
              ) : null}
              )
            </>
          ) : section === 'vehicles' ? (
            <>
              {' '}
              z <strong>{totalCount}</strong> pojazdów B2B
            </>
          ) : totalCount !== filteredCount ? (
            <>
              {' '}
              z <strong>{totalCount}</strong> na stronie
            </>
          ) : (
            <> na stronie</>
          )}
        </span>
      </div>

      {section === 'claims' ? (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">Szukaj</span>
            <input
              type="search"
              autoComplete="off"
              placeholder="Tekst, NIP, pojazd, usługa, identyfikator…"
              value={filters.query}
              onChange={(e) => patch({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">Usługa</span>
            <select value={filters.serviceName} onChange={(e) => patch({ serviceName: e.target.value })}>
              <option value="">Wszystkie</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Decyzja</span>
            <select value={filters.decision} onChange={(e) => patch({ decision: e.target.value })}>
              <option value="">Wszystkie</option>
              {decisionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field filter-narrow">
            <span className="filter-label">Kwota od</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={filters.amountMin}
              onChange={(e) => patch({ amountMin: e.target.value })}
            />
          </label>

          <label className="filter-field filter-narrow">
            <span className="filter-label">Kwota do</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="∞"
              value={filters.amountMax}
              onChange={(e) => patch({ amountMax: e.target.value })}
            />
          </label>

          <label className="filter-field filter-checkbox">
            <input
              type="checkbox"
              checked={filters.flaggedOnly}
              onChange={(e) => patch({ flaggedOnly: e.target.checked })}
            />
            <span>Tylko z oznaczeniem / anomalią</span>
          </label>
        </div>
      ) : (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">Szukaj pojazdu</span>
            <input
              type="search"
              autoComplete="off"
              placeholder="Rejestracja, region, firma…"
              value={vehicleFilters.query}
              onChange={(e) => patchVehicle({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">Region / miasto</span>
            <select
              value={vehicleFilters.area}
              onChange={(e) => patchVehicle({ area: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Firma kurierska</span>
            <select
              value={vehicleFilters.company}
              onChange={(e) => patchVehicle({ company: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {vehicleCompanyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <p className="filter-hint">
            Pojazdy: DPD_B2B_Vehicles. Region i firma kurierska — z kosztów DPD_POC (najczęstsza wartość
            dla rejestracji) oraz słownika DPD_B2B_Courier_Companies / DPD_Areas_Wroclaw, gdy brak relacji
            na encji pojazdu.
          </p>
        </div>
      )}
    </div>
  );
}
