import type { CompanyFilterState } from '../utils/companyFilters';
import type { ClaimsFilterState } from '../utils/filterRecords';
import type { VehicleFilterState } from '../utils/vehicleFilters';
import { useI18n } from '../i18n/I18nProvider';

type MainSection = 'claims' | 'vehicles' | 'companies';

interface Props {
  section: MainSection;
  filters: ClaimsFilterState;
  onFiltersChange: (next: ClaimsFilterState) => void;
  vehicleFilters: VehicleFilterState;
  onVehicleFiltersChange: (next: VehicleFilterState) => void;
  companyFilters: CompanyFilterState;
  onCompanyFiltersChange: (next: CompanyFilterState) => void;
  areaOptions: string[];
  companyAreaOptions: string[];
  vehicleCompanyOptions: string[];
  serviceOptions: string[];
  decisionOptions: string[];
  filteredCount: number;
  totalCount: number;
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
  companyFilters,
  onCompanyFiltersChange,
  areaOptions,
  companyAreaOptions,
  vehicleCompanyOptions,
  serviceOptions,
  decisionOptions,
  filteredCount,
  totalCount,
  globalFilterActive = false,
  datasetTotal = null,
  onReset,
}: Props) {
  const { t } = useI18n();
  const patch = (partial: Partial<ClaimsFilterState>) =>
    onFiltersChange({ ...filters, ...partial });
  const patchVehicle = (partial: Partial<VehicleFilterState>) =>
    onVehicleFiltersChange({ ...vehicleFilters, ...partial });
  const patchCompany = (partial: Partial<CompanyFilterState>) =>
    onCompanyFiltersChange({ ...companyFilters, ...partial });

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

  return (
    <div className="global-filter-bar" role="search" aria-label={t('filters.title')}>
      <div className="global-filter-bar-head">
        <span className="global-filter-bar-title">{t('filters.title')}</span>
        {(section === 'claims'
          ? hasActiveClaimsFilters
          : section === 'vehicles'
            ? hasActiveVehicleFilters
            : hasActiveCompanyFilters) && (
          <button type="button" className="btn btn-link-reset" onClick={onReset}>
            {t('filters.clear')}
          </button>
        )}
        <span className="global-filter-count">
          {t('filters.matching')}: <strong>{filteredCount}</strong>
          {globalFilterActive ? (
            <>
              {' '}
              ({t('filters.searchedInDb', { count: totalCount })}
              {datasetTotal != null && datasetTotal !== totalCount ? (
                <> {t('filters.ofInDb', { total: datasetTotal })}</>
              ) : null}
              )
            </>
          ) : section === 'vehicles' ? (
            <> {t('filters.ofVehicles', { total: totalCount })}</>
          ) : section === 'companies' ? (
            <> {t('filters.ofCompanies', { total: totalCount })}</>
          ) : totalCount !== filteredCount ? (
            <> {t('filters.ofInDb', { total: totalCount })} {t('filters.onPage')}</>
          ) : (
            <> {t('filters.onPage')}</>
          )}
        </span>
      </div>

      {section === 'companies' ? (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">{t('filters.searchCompany')}</span>
            <input
              type="search"
              autoComplete="off"
              placeholder={t('filters.companySearchPlaceholder')}
              value={companyFilters.query}
              onChange={(e) => patchCompany({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">{t('common.regionCity')}</span>
            <select
              value={companyFilters.area}
              onChange={(e) => patchCompany({ area: e.target.value })}
            >
              <option value="">{t('common.all')}</option>
              {companyAreaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <p className="filter-hint">{t('filters.companyHint')}</p>
        </div>
      ) : section === 'claims' ? (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">{t('filters.search')}</span>
            <input
              type="search"
              autoComplete="off"
              placeholder={t('filters.searchPlaceholder')}
              value={filters.query}
              onChange={(e) => patch({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">{t('filters.service')}</span>
            <select value={filters.serviceName} onChange={(e) => patch({ serviceName: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">{t('filters.decision')}</span>
            <select value={filters.decision} onChange={(e) => patch({ decision: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {decisionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field filter-narrow">
            <span className="filter-label">{t('filters.amountMin')}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('filters.amountPlaceholderMin')}
              value={filters.amountMin}
              onChange={(e) => patch({ amountMin: e.target.value })}
            />
          </label>

          <label className="filter-field filter-narrow">
            <span className="filter-label">{t('filters.amountMax')}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('filters.amountPlaceholderMax')}
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
            <span>{t('filters.flaggedOnly')}</span>
          </label>
        </div>
      ) : section === 'vehicles' ? (
        <div className="global-filter-controls">
          <label className="filter-field filter-grow">
            <span className="filter-label">{t('filters.searchVehicle')}</span>
            <input
              type="search"
              autoComplete="off"
              placeholder={t('filters.vehicleSearchPlaceholder')}
              value={vehicleFilters.query}
              onChange={(e) => patchVehicle({ query: e.target.value })}
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">{t('common.regionCity')}</span>
            <select
              value={vehicleFilters.area}
              onChange={(e) => patchVehicle({ area: e.target.value })}
            >
              <option value="">{t('common.all')}</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="filter-label">{t('filters.courierCompany')}</span>
            <select
              value={vehicleFilters.company}
              onChange={(e) => patchVehicle({ company: e.target.value })}
            >
              <option value="">{t('common.all')}</option>
              {vehicleCompanyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <p className="filter-hint">{t('filters.vehicleHint')}</p>
        </div>
      ) : null}
    </div>
  );
}
