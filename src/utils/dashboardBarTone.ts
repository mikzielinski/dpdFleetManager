import { isUnassignedLabel } from './dashboardFilters';

export type BarTone = 'normal' | 'warning' | 'alert';

export function barToneForValue(name: string, value: number, average: number): BarTone {
  if (isUnassignedLabel(name)) return 'warning';
  if (average > 0 && value > average * 1.12) return 'alert';
  return 'normal';
}
