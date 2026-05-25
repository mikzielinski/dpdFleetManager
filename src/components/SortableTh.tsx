import type { SortDirection, SortState } from '../utils/tableSort';

interface Props<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: Props<K>) {
  const active = sort.key === sortKey;
  const dir: SortDirection | null = active ? sort.direction : null;
  const indicator = !active ? '↕' : dir === 'asc' ? '↑' : '↓';

  return (
    <th className={className ? `${className} th-sortable` : 'th-sortable'}>
      <button
        type="button"
        className="th-sort-btn"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden>
          {indicator}
        </span>
      </button>
    </th>
  );
}
