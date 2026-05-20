import { SERVICE_CATEGORIES, type ServiceCategory } from '../utils/serviceCategories';

export interface ChartSegment {
  label: string;
  value: number;
  color: string;
  meta?: string;
}

export interface RankRow {
  name: string;
  total: number;
  count: number;
}

function formatPln(n: number): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

export function DonutChart({
  title,
  segments,
  valueSuffix = '',
}: {
  title: string;
  segments: ChartSegment[];
  valueSuffix?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  let acc = 0;
  const stops: string[] = [];
  for (const s of segments) {
    const pct = (s.value / total) * 100;
    if (pct <= 0) continue;
    const start = acc;
    acc += pct;
    stops.push(`${s.color} ${start}% ${acc}%`);
  }
  const gradient = stops.length ? `conic-gradient(${stops.join(', ')})` : '#e8e8e6';

  return (
    <div className="dash-chart-card dash-chart-donut-wrap">
      <h4 className="stats-subtitle">{title}</h4>
      <div className="dash-donut-layout">
        <div
          className="dash-donut"
          style={{ background: gradient }}
          role="img"
          aria-label={title}
        >
          <div className="dash-donut-hole">
            <span className="dash-donut-total">{formatPln(total)}</span>
            <span className="dash-donut-total-label">{valueSuffix || 'łącznie'}</span>
          </div>
        </div>
        <ul className="dash-donut-legend">
          {segments.map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <li key={s.label}>
                <span className="dash-legend-swatch" style={{ backgroundColor: s.color }} />
                <span className="dash-legend-label" title={s.label}>
                  {s.label}
                </span>
                <span className="dash-legend-meta">
                  {pct}% · {s.meta ?? formatPln(s.value)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function ColumnChart({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; total: number; count: number }[];
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="dash-chart-card">
      <h4 className="stats-subtitle">{title}</h4>
      <div className="dash-column-chart" role="img" aria-label={title}>
        {rows.map((m) => {
          const barPx = Math.max(8, Math.round((m.total / max) * 120));
          return (
            <div
              key={m.label}
              className="dash-column"
              title={`${m.label}: ${formatPln(m.total)} PLN (${m.count})`}
            >
              <div className="dash-column-bar-wrap">
                <div className="dash-column-bar" style={{ height: `${barPx}px` }} />
              </div>
              <span className="dash-column-label">{m.label}</span>
              <span className="dash-column-value">{formatPln(m.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RankBarChart({
  title,
  rows,
  barClass = 'dash-bar-fill',
  formatValue = formatPln,
}: {
  title: string;
  rows: RankRow[];
  barClass?: string;
  formatValue?: (n: number) => string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="dash-chart-card">
      <h4 className="stats-subtitle">{title}</h4>
      <ul className="category-bars dash-bars">
        {rows.map((r) => {
          const pct = Math.round((r.total / max) * 100);
          return (
            <li key={r.name} className="category-bar-row">
              <span className="category-bar-label" title={r.name}>
                {r.name}
              </span>
              <div className="category-bar-track">
                <div className={`category-bar-fill ${barClass}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="category-bar-meta">
                {r.count} · {formatValue(r.total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StatCards({
  title,
  rows,
  valueLabel = 'PLN',
}: {
  title: string;
  rows: RankRow[];
  valueLabel?: string;
}) {
  if (!rows.length) return null;

  return (
    <div className="dash-chart-card">
      <h4 className="stats-subtitle">{title}</h4>
      <div className="dash-stat-cards">
        {rows.map((r) => (
          <div key={r.name} className="dash-stat-card">
            <span className="dash-stat-card-name" title={r.name}>
              {r.name}
            </span>
            <span className="dash-stat-card-value">
              {formatPln(r.total)} {valueLabel}
            </span>
            <span className="dash-stat-card-meta">{r.count} poz.</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function categorySegments(
  items: { category: ServiceCategory; count: number; total: number }[],
): ChartSegment[] {
  return items.map((c) => {
    const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
    return {
      label: meta?.label ?? c.category,
      value: c.total,
      color: meta?.color ?? '#dc0032',
      meta: `${c.count} · ${formatPln(c.total)} PLN`,
    };
  });
}

export function decisionSegments(
  items: { label: string; count: number }[],
): ChartSegment[] {
  const palette = ['#2a9d8f', '#dc0032', '#e9c46a', '#6c757d', '#0077b6', '#7b2cbf'];
  return items.map((d, i) => ({
    label: d.label,
    value: d.count,
    color: palette[i % palette.length]!,
    meta: `${d.count} szt.`,
  }));
}

export function healthSegments(
  items: { label: string; count: number }[],
): ChartSegment[] {
  const colors: Record<string, string> = {
    'A (80–100)': '#2a9d8f',
    'B (65–79)': '#52b788',
    'C (50–64)': '#e9c46a',
    'D (35–49)': '#f4a261',
    'F (<35)': '#dc0032',
    'Brak oceny': '#adb5bd',
  };
  return items.map((b) => ({
    label: b.label,
    value: b.count,
    color: colors[b.label] ?? '#6c757d',
    meta: `${b.count} poj.`,
  }));
}
