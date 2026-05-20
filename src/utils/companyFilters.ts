export interface CompanyFilterState {
  query: string;
  area: string;
}

export const DEFAULT_COMPANY_FILTERS: CompanyFilterState = {
  query: '',
  area: '',
};

export function hasActiveCompanyFilters(filters: CompanyFilterState): boolean {
  return filters.query.trim() !== '' || filters.area !== '';
}
