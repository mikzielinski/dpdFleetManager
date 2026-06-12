import type { ChartLimitPreset, HealthGradeFilter } from '../../utils/insightChartSort';

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
  showLimitControl?: boolean;
  limitPreset?: ChartLimitPreset;
  onLimitPresetChange?: (preset: ChartLimitPreset) => void;
  customLimit?: number;
  onCustomLimitChange?: (n: number) => void;
  displayedCount?: number;
  filteredCount?: number;
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
  showLimitControl = false,
  limitPreset,
  onLimitPresetChange,
  customLimit,
  onCustomLimitChange,
  displayedCount,
  filteredCount,
  totalCount,
}: Props) {
  const showCountHint =
    displayedCount != null &&
    totalCount != null &&
    (displayedCount !== totalCount || (filteredCount != null && filteredCount !== totalCount));

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

      {showLimitControl &&
      limitPreset != null &&
      onLimitPresetChange &&
      customLimit != null &&
      onCustomLimitChange ? (
        <div className="insights-limit-control">
          <label className="insights-chart-sort">
            <span className="insights-chart-sort-label">Pokaż</span>
            <select
              value={limitPreset}
              onChange={(e) => onLimitPresetChange(e.target.value as ChartLimitPreset)}
            >
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="all">Wszystko</option>
              <option value="custom">Własna liczba</option>
            </select>
          </label>
          {limitPreset === 'custom' ? (
            <label className="insights-chart-sort insights-limit-custom">
              <span className="insights-chart-sort-label">Liczba</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, filteredCount ?? totalCount ?? 999)}
                value={customLimit}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  onCustomLimitChange(Number.isFinite(n) && n > 0 ? n : 1);
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

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

      {showCountHint ? (
        <span className="insights-chart-count-hint">
          Pokazano <strong>{displayedCount}</strong>
          {filteredCount != null && filteredCount !== totalCount ? (
            <>
              {' '}
              z <strong>{filteredCount}</strong> po filtrze
            </>
          ) : null}
          {totalCount != null ? (
            <>
              {' '}
              (łącznie <strong>{totalCount}</strong>)
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
