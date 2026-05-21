import type { ServiceCategory } from './serviceCategories';

export interface DashboardFilterState {
  area: string;
  company: string;
  category: '' | ServiceCategory;
  /** Ukrywa „Nieprzypisany” w rankingach (główny dashboard). */
  hideUnassigned: boolean;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilterState = {
  area: '',
  company: '',
  category: '',
  hideUnassigned: true,
};

export const UNASSIGNED_REGION = 'Nieprzypisany';
export const UNASSIGNED_COMPANY = 'Nieprzypisana';

export function isUnassignedLabel(name: string): boolean {
  return name === UNASSIGNED_REGION || name === UNASSIGNED_COMPANY;
}

export function isDashboardFilterActive(f: DashboardFilterState): boolean {
  return f.area !== '' || f.company !== '' || f.category !== '' || f.hideUnassigned;
}
