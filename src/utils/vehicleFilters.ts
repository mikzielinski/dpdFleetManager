export interface VehicleFilterState {
  query: string;
  area: string;
  company: string;
}

export const DEFAULT_VEHICLE_FILTERS: VehicleFilterState = {
  query: '',
  area: '',
  company: '',
};

export function hasActiveVehicleFilters(filters: VehicleFilterState): boolean {
  return filters.query.trim() !== '' || filters.area !== '' || filters.company !== '';
}
