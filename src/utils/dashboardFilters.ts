import type { ServiceCategory } from './serviceCategories';

export interface DashboardFilterState {
  area: string;
  company: string;
  category: '' | ServiceCategory;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilterState = {
  area: '',
  company: '',
  category: '',
};

export function isDashboardFilterActive(f: DashboardFilterState): boolean {
  return f.area !== '' || f.company !== '' || f.category !== '';
}
