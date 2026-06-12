import type { HealthGradeFilter } from '../../utils/insightChartSort';

export interface ChartSortOption {
  id: string;
  label: string;
}

interface Props {
  sortOptions: ChartSortOption[];
  sort: string;
  onSortChange: (id: string) => void;
  gradeFilter?: HealthGradeFilter;
  onGradeFilterChange?: (grade: HealthGradeFilter) => void;
  showGradeFilter?: boolean;
  resultCount?: number;
  totalCount?: number;
}

const GRADE_LABELS: Record<string, string> = {
  all: 'Wszystkie',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  F: 'F',
  none: 'Brak oceny',
};

export function ChartViewControls({
  sortOptions,
  sort,
  onSortChange,
  gradeFilter,
  onGradeFilterChange,
  showGradeFilter = false,
  resultCount,
  totalCount,
}: Props) {
  return (
    <div className="insights-chart-controls">
      <label className="insights-chart-sort">
        <span className="insights-chart-sort-label">Sortowanie</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value)}>
          {sortOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {showGradeFilter && gradeFilter != null && onGradeFilterChange ? (
        <div className="insights-grade-filters" role="group" aria-label="Filtr oceny health">
          <span className="insights-chart-sort-label">Ocena</span>
          <div className="insights-grade-chips">
            {(['all', 'A', 'B', 'C', 'D', 'F', 'none'] as HealthGradeFilter[]).map((g) => (
              <button
                key={g}
                type="button"
                className={
                  gradeFilter === g ? 'insights-grade-chip insights-grade-chip-active' : 'insights-grade-chip'
                }
                onClick={() => onGradeFilterChange(g)}
              >
                {GRADE_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {resultCount != null && totalCount != null && resultCount !== totalCount ? (
        <span className="insights-chart-count-hint">
          Pokazano <strong>{resultCount}</strong> z {totalCount}
        </span>
      ) : null}
    </div>
  );
}
