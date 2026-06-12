export type SortDir = 'asc' | 'desc';

export interface TableSortState {
  key: string;
  direction: SortDir;
}

export type ColumnFilters = Record<string, string>;

export function toggleSort(current: TableSortState | null, key: string): TableSortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

export function sortIndicator(sort: TableSortState | null, key: string): string {
  if (!sort || sort.key !== key) return '↕';
  return sort.direction === 'asc' ? '↑' : '↓';
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesColumnFilter(cellText: string, filter: string): boolean {
  const q = normalizeFilterText(filter);
  if (!q) return true;
  return cellText.toLowerCase().includes(q);
}

export function applyColumnFilters<T>(
  rows: T[],
  filters: ColumnFilters,
  getFilterText: (row: T, key: string) => string,
  keys: readonly string[],
): T[] {
  const activeKeys = keys.filter((k) => normalizeFilterText(filters[k] ?? ''));
  if (!activeKeys.length) return rows;
  return rows.filter((row) =>
    activeKeys.every((k) => matchesColumnFilter(getFilterText(row, k), filters[k] ?? '')),
  );
}

export function compareSortValues(a: unknown, b: unknown): number {
  const empty = (v: unknown) => v == null || v === '' || v === '—';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pl', { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(
  rows: T[],
  sort: TableSortState | null,
  getSortValue: (row: T, key: string) => string | number | null | undefined,
): T[] {
  if (!sort) return rows;
  const mul = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort.key);
    const bv = getSortValue(b, sort.key);
    return mul * compareSortValues(av, bv);
  });
}

export function applyTableView<T>(
  rows: T[],
  sort: TableSortState | null,
  filters: ColumnFilters,
  keys: readonly string[],
  getFilterText: (row: T, key: string) => string,
  getSortValue: (row: T, key: string) => string | number | null | undefined,
): T[] {
  const filtered = applyColumnFilters(rows, filters, getFilterText, keys);
  return sortRows(filtered, sort, getSortValue);
}

export function patchColumnFilter(
  filters: ColumnFilters,
  key: string,
  value: string,
): ColumnFilters {
  if (!value.trim()) {
    const next = { ...filters };
    delete next[key];
    return next;
  }
  return { ...filters, [key]: value };
}

export function hasActiveColumnFilters(filters: ColumnFilters): boolean {
  return Object.values(filters).some((v) => v.trim() !== '');
}
