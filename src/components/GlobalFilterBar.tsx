import type { CompanyFilterState } from '../utils/companyFilters';
import type { DashboardFilterState } from '../utils/dashboardFilters';
import type { ClaimsFilterState } from '../utils/filterRecords';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import type { VehicleFilterState } from '../utils/vehicleFilters';
import { PeriodFilterRow } from './PeriodFilterRow';
import { isPeriodFilterActive, type PeriodFilterState } from '../utils/periodFilter';

type MainSection = 'claims' | 'vehicles' | 'companies' | 'dashboard' | 'insights';

interface Props {
  section: MainSection;
  filters: ClaimsFilterState;
  onFiltersChange: (next: ClaimsFilterState) => void;
  vehicleFilters: VehicleFilterState;
  onVehicleFiltersChange: (next: VehicleFilterState) => void;
  companyFilters: CompanyFilterState;
  onCompanyFiltersChange: (next: CompanyFilterState) => void;
  dashboardFilters?: DashboardFilterState;
  onDashboardFiltersChange?: (next: DashboardFilterState) => void;
  areaOptions: string[];
  companyAreaOptions: string[];
  vehicleCompanyOptions: string[];
  serviceOptions: string[];
  decisionOptions: string[];
  filteredCount: number;
  totalCount: number;
  /** When true, filters run on full dataset loaded from API (not one page). */
  globalFilterActive?: boolean;
  datasetTotal?: number | null;
  period: PeriodFilterState;
  onPeriodChange: (next: PeriodFilterState) => void;
  pocInPeriodCount?: number;
  pocTotalCount?: number;
  onReset: () => void;
}

export function GlobalFilterBar({
  section,
  filters,
  onFiltersChange,
  vehicleFilters,
  onVehicleFiltersChange,
  companyFilters,
  onCompanyFiltersChange,
  dashboardFilters,
  onDashboardFiltersChange,
  areaOptions,
  companyAreaOptions,
  vehicleCompanyOptions,
  serviceOptions,
  decisionOptions,
  filteredCount,
  totalCount,
  globalFilterActive = false,
  datasetTotal = null,
  period,
  onPeriodChange,
  pocInPeriodCount,
  pocTotalCount,
  onReset,
}: Props) {
  const patch = (partial: Partial<ClaimsFilterState>) =>
    onFiltersChange({ ...filters, ...partial });
  const patchVehicle = (partial: Partial<VehicleFilterState>) =>
    onVehicleFiltersChange({ ...vehicleFilters, ...partial });
  const patchCompany = (partial: Partial<CompanyFilterState>) =>
    onCompanyFiltersChange({ ...companyFilters, ...partial });
  const patchDashboard = (partial: Partial<DashboardFilterState>) => {
    if (dashboardFilters && onDashboardFiltersChange) {
      onDashboardFiltersChange({ ...dashboardFilters, ...partial });
    }
  };

  const hasActiveCompanyFilters =
    companyFilters.query.trim() !== '' || companyFilters.area !== '';

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

  const hasActivePeriod = isPeriodFilterActive(period);

  const hasActiveDashboardFilters =
    dashboardFilters != null &&
    (dashboardFilters.area !== '' ||
      dashboardFilters.company !== '' ||
      dashboardFilters.category !== '' ||
      !dashboardFilters.hideUnassigned);

  return (
    <div className="global-filter-bar" role="search" aria-label="Wyszukiwanie i filtry">
      <PeriodFilterRow
        period={period}
        onPeriodChange={onPeriodChange}
        recordsInPeriod={pocInPeriodCount}
        recordsTotal={pocTotalCount}
      />

      <div className="global-filter-bar-head">
        <span className="global-filter-bar-title">Wyszukiwanie i filtry</span>
        {(hasActivePeriod ||
          (section === 'claims'
            ? hasActiveClaimsFilters
            : section === 'vehicles'
              ? hasActiveVehicleFilters
              : section === 'dashboard'
                ? hasActiveDashboardFilters
                : hasActiveCompanyFilters)) && (
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
          ) : section === 'dashboard' || section === 'insights' ? (
            <>
              {' '}
              · <strong>{filteredCount}</strong> rozliczeń w okresie
            </>
          ) : section === 'companies' ? (
            <>
              {' '}
              z <strong>{totalCount}</strong> firm B2B
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

      {(section === 'dashboard' || section === 'insights') &&
      dashboardFilters &&
      onDashboardFiltersChange ? (
        <div className="global-filter-controls">
          <label className="filter-field">
            <span className="filter-label">Region</span>
            <select
              value={dashboardFilters.area}
              onChange={(e) => patchDashboard({ area: e.target.value })}
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
              value={dashboardFilters.company}
              onChange={(e) => patchDashboard({ company: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {vehicleCompanyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">Kategoria usługi</span>
            <select
              value={dashboardFilters.category}
              onChange={(e) =>
                patchDashboard({
                  category: e.target.value as DashboardFilterState['category'],
                })
              }
            >
              <option value="">Wszystkie</option>
              {SERVICE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field filter-checkbox">
            <input
              type="checkbox"
              checked={dashboardFilters.hideUnassigned}
              onChange={(e) => patchDashboard({ hideUnassigned: e.target.checked })}
            />
            <span>Ukryj nieprzypisane w wykresach</span>
          </label>

          <p className="filter-hint">
            {section === 'insights'
              ? 'Insights: alerty, KPI z trendem, trendy 6 mies. i rozkład kosztów.'
              : 'Dashboard zbiorczy: paski z PLN na końcu. „Nieprzypisany” domyślnie poza rankingiem.'}
          </p>
        </div>
      ) : section === 'companies' ? (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">Szukaj firmy</span>
            <input
              type="search"
              autoComplete="off"
              placeholder="Nazwa firmy, region…"
              value={companyFilters.query}
              onChange={(e) => patchCompany({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">Region / miasto</span>
            <select
              value={companyFilters.area}
              onChange={(e) => patchCompany({ area: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {companyAreaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <p className="filter-hint">
            Słownik DPD_B2B_Courier_Companies. Kolumna „Pojazdy” — liczba pojazdów floty przypisanych do
            firmy w katalogu B2B.
          </p>
        </div>
      ) : section === 'claims' ? (
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
      ) : section === 'vehicles' ? (
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
            Pojazdy: DPD_B2B_Vehicles. Firma i region — ze słowników Data Fabric i kosztów POC; gdy brak
            powiązania, przypisany jest fikcyjny partner B2B DPD (nie nazwa ze stacji paliw / faktury).
          </p>
        </div>
      ) : null}
    </div>
  );
}
