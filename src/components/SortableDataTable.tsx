import type { ReactNode } from 'react';
import {
  patchColumnFilter,
  sortIndicator,
  toggleSort,
  type ColumnFilters,
  type TableSortState,
} from '../utils/sortableTable';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  filterText?: (row: T) => string;
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort: TableSortState | null;
  onSortChange: (sort: TableSortState | null) => void;
  columnFilters: ColumnFilters;
  onColumnFiltersChange: (filters: ColumnFilters) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  activeRowKey?: string | null;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  leadingHeader?: ReactNode;
  renderLeadingCell?: (row: T) => ReactNode;
}

export function SortableDataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  columnFilters,
  onColumnFiltersChange,
  onRowClick,
  rowClassName,
  activeRowKey,
  loading = false,
  loadingMessage = 'Ładowanie…',
  emptyMessage = 'Brak danych.',
  leadingHeader,
  renderLeadingCell,
}: Props<T>) {
  const colSpan = columns.length + (leadingHeader ? 1 : 0);

  return (
    <table className="sortable-data-table">
      <thead>
        <tr className="sortable-head-row">
          {leadingHeader ? <th className="sortable-head-leading">{leadingHeader}</th> : null}
          {columns.map((col) => {
            const sortable = col.sortable !== false;
            return (
              <th
                key={col.key}
                className={col.align === 'right' ? 'col-numeric sortable-head-cell' : 'sortable-head-cell'}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="sortable-head-btn"
                    onClick={() => onSortChange(toggleSort(sort, col.key))}
                    title="Sortuj kolumnę"
                  >
                    <span>{col.label}</span>
                    <span className="sortable-indicator" aria-hidden>
                      {sortIndicator(sort, col.key)}
                    </span>
                  </button>
                ) : (
                  <span className="sortable-head-label">{col.label}</span>
                )}
              </th>
            );
          })}
        </tr>
        <tr className="sortable-filter-row">
          {leadingHeader ? <th className="sortable-filter-leading" /> : null}
          {columns.map((col) => {
            const filterable = col.filterable !== false;
            return (
              <th
                key={`${col.key}-filter`}
                className={col.align === 'right' ? 'col-numeric' : undefined}
              >
                {filterable ? (
                  <input
                    type="search"
                    className="column-filter-input"
                    placeholder="Filtr…"
                    value={columnFilters[col.key] ?? ''}
                    onChange={(e) =>
                      onColumnFiltersChange(patchColumnFilter(columnFilters, col.key, e.target.value))
                    }
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Filtr: ${col.label}`}
                  />
                ) : null}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={colSpan} className="center">
              {loadingMessage}
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="center">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const key = rowKey(row);
            const active = activeRowKey != null && activeRowKey === key;
            const extraClass = rowClassName?.(row);
            const trClass = [
              active ? 'row-active' : onRowClick ? 'row-clickable' : '',
              extraClass ?? '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr
                key={key}
                className={trClass || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {renderLeadingCell ? (
                  <td onClick={(e) => e.stopPropagation()}>{renderLeadingCell(row)}</td>
                ) : null}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={col.align === 'right' ? 'col-numeric' : undefined}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
