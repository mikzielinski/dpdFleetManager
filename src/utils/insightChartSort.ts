export const HEALTH_GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'] as const;
export type HealthGradeFilter = 'all' | (typeof HEALTH_GRADE_OPTIONS)[number] | 'none';

export function gradeRank(grade: string | null | undefined): number {
  const g = (grade ?? '').toUpperCase();
  const order: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  return order[g] ?? 0;
}

export function filterByHealthGrade<T extends { healthGrade?: string | null }>(
  rows: T[],
  grade: HealthGradeFilter,
): T[] {
  if (grade === 'all') return rows;
  if (grade === 'none') return rows.filter((r) => !r.healthGrade?.trim());
  return rows.filter((r) => (r.healthGrade ?? '').toUpperCase() === grade);
}

export function availableHealthGrades<T extends { healthGrade?: string | null }>(rows: T[]): string[] {
  const set = new Set<string>();
  let hasNone = false;
  for (const r of rows) {
    const g = (r.healthGrade ?? '').toUpperCase().trim();
    if (g) set.add(g);
    else hasNone = true;
  }
  const grades = HEALTH_GRADE_OPTIONS.filter((g) => set.has(g));
  if (hasNone) grades.push('none' as never);
  return grades;
}

export function sortByName<T extends { name: string }>(rows: T[], dir: 'asc' | 'desc'): T[] {
  const out = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return dir === 'desc' ? out.reverse() : out;
}

export function sortByLabel<T extends { label: string }>(rows: T[], dir: 'asc' | 'desc'): T[] {
  const out = [...rows].sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  return dir === 'desc' ? out.reverse() : out;
}

export function sortByMonth<T extends { month: string }>(rows: T[], dir: 'asc' | 'desc'): T[] {
  const out = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  return dir === 'desc' ? out.reverse() : out;
}

export function sortByNumeric<T>(
  rows: T[],
  pick: (row: T) => number,
  dir: 'asc' | 'desc',
): T[] {
  const out = [...rows].sort((a, b) => pick(a) - pick(b));
  return dir === 'desc' ? out.reverse() : out;
}

export type ChartLimitPreset = '5' | '10' | '20' | '50' | 'all' | 'custom';

export const DEFAULT_CHART_LIMIT_PRESET: ChartLimitPreset = '10';
export const DEFAULT_CHART_CUSTOM_LIMIT = 10;

export function applyChartLimit<T>(
  rows: T[],
  preset: ChartLimitPreset,
  customLimit: number,
): T[] {
  if (preset === 'all') return rows;
  const n = preset === 'custom' ? customLimit : Number(preset);
  if (!Number.isFinite(n) || n < 1) return rows.slice(0, DEFAULT_CHART_CUSTOM_LIMIT);
  return rows.slice(0, Math.min(Math.floor(n), rows.length));
}

export function chartLimitCount(
  preset: ChartLimitPreset,
  customLimit: number,
  available: number,
): number {
  if (preset === 'all') return available;
  const n = preset === 'custom' ? customLimit : Number(preset);
  if (!Number.isFinite(n) || n < 1) return Math.min(DEFAULT_CHART_CUSTOM_LIMIT, available);
  return Math.min(Math.floor(n), available);
}

export const COMMON_SORTS = {
  valueDesc: { id: 'total-desc', label: 'Wartość malejąco' },
  valueAsc: { id: 'total-asc', label: 'Wartość rosnąco' },
  nameAsc: { id: 'name-asc', label: 'Nazwa A→Z' },
  nameDesc: { id: 'name-desc', label: 'Nazwa Z→A' },
  chronoAsc: { id: 'chrono-asc', label: 'Chronologia' },
  chronoDesc: { id: 'chrono-desc', label: 'Chronologia odwrotna' },
  countDesc: { id: 'count-desc', label: 'Liczba malejąco' },
  countAsc: { id: 'count-asc', label: 'Liczba rosnąco' },
} as const;
