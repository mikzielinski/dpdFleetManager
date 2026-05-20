import type { ClaimsFilterState } from '../utils/filterRecords';

type MainSection = 'claims' | 'vehicles';

interface Props {
  section: MainSection;
  filters: ClaimsFilterState;
  onFiltersChange: (next: ClaimsFilterState) => void;
  vehicleSearch: string;
  onVehicleSearchChange: (v: string) => void;
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
  vehicleSearch,
  onVehicleSearchChange,
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
        {(section === 'claims' ? hasActiveClaimsFilters : vehicleSearch.trim() !== '') && (
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
              placeholder="Numer rejestracyjny…"
              value={vehicleSearch}
              onChange={(e) => onVehicleSearchChange(e.target.value)}
            />
          </label>
          <p className="filter-hint">
            Lista pojazdów jest budowana z rekordów widocznych na bieżącej stronie zgłoszeń (po odświeżeniu
            zmień stronę, aby zobaczyć kolejne pojazdy).
          </p>
        </div>
      )}
    </div>
  );
}
