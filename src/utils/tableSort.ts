export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K | null;
  direction: SortDirection;
}

export const EMPTY_SORT: SortState = { key: null, direction: 'asc' };

export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return { key: null, direction: 'asc' };
}

export function sortCompare(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDirection,
): number {
  const mul = dir === 'asc' ? 1 : -1;
  const na = a == null || a === '' || a === '—';
  const nb = b == null || b === '' || b === '—';
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return 0;
    return (a - b) * mul;
  }
  return String(a).localeCompare(String(b), 'pl', { numeric: true }) * mul;
}

export function sortArray<T>(
  items: readonly T[],
  state: SortState,
  getValue: (item: T) => string | number | null | undefined,
): T[] {
  if (!state.key) return [...items];
  return [...items].sort((x, y) => sortCompare(getValue(x), getValue(y), state.direction));
}
