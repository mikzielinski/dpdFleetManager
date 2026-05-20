import {
  formatPeriodRangeLabel,
  isPeriodFilterActive,
  PERIOD_PRESET_OPTIONS,
  type PeriodFilterState,
  type PeriodPreset,
} from '../utils/periodFilter';

interface Props {
  period: PeriodFilterState;
  onPeriodChange: (next: PeriodFilterState) => void;
  recordsInPeriod?: number;
  recordsTotal?: number;
}

export function PeriodFilterRow({
  period,
  onPeriodChange,
  recordsInPeriod,
  recordsTotal,
}: Props) {
  const patch = (partial: Partial<PeriodFilterState>) =>
    onPeriodChange({ ...period, ...partial });

  const setPreset = (preset: PeriodPreset) => {
    if (preset === 'custom' && !period.customFrom) {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      onPeriodChange({
        preset,
        customFrom: from.toISOString().slice(0, 10),
        customTo: to.toISOString().slice(0, 10),
      });
      return;
    }
    patch({ preset });
  };

  return (
    <div className="period-filter-row">
      <div className="period-filter-head">
        <span className="filter-label">Okres</span>
        <span className="period-range-label">{formatPeriodRangeLabel(period)}</span>
        {recordsInPeriod != null && recordsTotal != null && isPeriodFilterActive(period) && (
          <span className="period-count-hint">
            Rozliczenia w okresie: <strong>{recordsInPeriod}</strong> / {recordsTotal}
          </span>
        )}
      </div>

      <div className="period-preset-chips" role="group" aria-label="Preset okresu">
        {PERIOD_PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={
              period.preset === opt.id ? 'period-chip period-chip-active' : 'period-chip'
            }
            onClick={() => setPreset(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {period.preset === 'custom' && (
        <div className="period-custom-dates">
          <label className="filter-field">
            <span className="filter-label">Od</span>
            <input
              type="date"
              value={period.customFrom}
              onChange={(e) => patch({ customFrom: e.target.value, preset: 'custom' })}
            />
          </label>
          <label className="filter-field">
            <span className="filter-label">Do</span>
            <input
              type="date"
              value={period.customTo}
              onChange={(e) => patch({ customTo: e.target.value, preset: 'custom' })}
            />
          </label>
        </div>
      )}

      <p className="filter-hint period-hint">
        Koszty i paliwo z DPD_POC w wybranym okresie (data usługi lub CreateTime). Przebieg w okresie
        liczony z odczytów licznika na rozliczeniach POC / polu Przebieg w B2B.
      </p>
    </div>
  );
}
