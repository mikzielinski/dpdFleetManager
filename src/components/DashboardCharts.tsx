import type { CSSProperties } from 'react';
import type { CategoryBreakdown } from '../services/fleetStats';
import type { DashboardKpiTrends } from '../services/dashboardAnalytics';
import type { RegionFuelRow } from '../services/regionFuelAnalytics';
import type { HealthBucket } from '../services/dashboardAnalytics';
import { barToneForValue, type BarTone } from '../utils/dashboardBarTone';
import { isUnassignedLabel } from '../utils/dashboardFilters';
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

function toneClass(tone: BarTone): string {
  if (tone === 'warning') return 'dash-bar-warn';
  if (tone === 'alert') return 'dash-bar-alert';
  return 'dash-bar-neutral';
}

function decisionColor(label: string): string {
  const l = label.toLowerCase();
  if (/zatwier|approv/i.test(l)) return '#2a9d8f';
  if (/flag|anomal/i.test(l)) return '#dc0032';
  if (/oczek|pend/i.test(l)) return '#e9c46a';
  return '#9ca3af';
}

export function DashboardKpiRow({
  stats,
  trends,
}: {
  stats: { totalCost: number; claimCount: number; avgCost: number; flaggedCount: number };
  trends: DashboardKpiTrends | null;
}) {
  const trendEl = (pct: number | null, delta?: number | null) => {
    if (pct != null) {
      const up = pct > 0;
      const cls = up ? 'dash-trend-up' : pct < 0 ? 'dash-trend-down' : 'dash-trend-flat';
      return (
        <span className={`dash-kpi-trend ${cls}`}>
          {up ? '↑' : pct < 0 ? '↓' : '→'} {Math.abs(pct)}% vs poprz. okres
        </span>
      );
    }
    if (delta != null && delta !== 0) {
      return (
        <span className={delta > 0 ? 'dash-kpi-trend dash-trend-up' : 'dash-kpi-trend dash-trend-down'}>
          {delta > 0 ? '+' : ''}
          {delta} vs poprz. okres
        </span>
      );
    }
    return <span className="dash-kpi-trend dash-trend-muted">brak poprz. okresu</span>;
  };

  return (
    <div className="dash-kpi-row">
      <div className="dash-kpi-card">
        <span className="dash-kpi-label">Suma kosztów</span>
        <span className="dash-kpi-value">
          {stats.totalCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
          <span className="dash-kpi-unit"> PLN</span>
        </span>
        {trendEl(trends?.totalCostPct ?? null)}
      </div>
      <div className="dash-kpi-card">
        <span className="dash-kpi-label">Rozliczenia</span>
        <span className="dash-kpi-value">{stats.claimCount}</span>
        {trendEl(trends?.claimCountPct ?? null)}
      </div>
      <div className="dash-kpi-card">
        <span className="dash-kpi-label">Średni koszt</span>
        <span className="dash-kpi-value">
          {stats.avgCost.toLocaleString('pl-PL', { maximumFractionDigits: 0 })}
          <span className="dash-kpi-unit"> PLN</span>
        </span>
        {trendEl(trends?.avgCostPct ?? null)}
      </div>
      <div className="dash-kpi-card dash-kpi-card-alert">
        <span className="dash-kpi-label">Flagi / anomalie</span>
        <span className="dash-kpi-value">{stats.flaggedCount}</span>
        {trendEl(null, trends?.flaggedDelta ?? null)}
      </div>
    </div>
  );
}

export function CategoryShareBars({
  title,
  items,
}: {
  title: string;
  items: CategoryBreakdown[];
}) {
  if (!items.length) return null;
  const total = items.reduce((s, c) => s + c.total, 0) || 1;
  const max = Math.max(...items.map((c) => c.total), 1);

  return (
    <div className="dash-chart-card dash-chart-wide">
      <h4 className="dash-chart-title">{title}</h4>
      <ul className="dash-labeled-bars">
        {items.map((c) => {
          const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
          const label = meta?.label ?? c.category;
          const pctShare = Math.round((c.total / total) * 100);
          const pctBar = Math.round((c.total / max) * 100);
          return (
            <li key={c.category} className="dash-labeled-bar-row">
              <span className="dash-labeled-bar-label">{label}</span>
              <div className="dash-labeled-bar-track">
                <div
                  className="dash-labeled-bar-fill"
                  style={{
                    width: `${pctBar}%`,
                    backgroundColor: meta?.color ?? '#dc0032',
                  }}
                />
              </div>
              <span className="dash-labeled-bar-end">
                {pctShare}% · {formatPln(c.total)} PLN
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RankBarChartToned({
  title,
  rows,
  average,
  formatValue = formatPln,
}: {
  title: string;
  rows: RankRow[];
  average: number;
  formatValue?: (n: number) => string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">{title}</h4>
      <ul className="dash-labeled-bars">
        {rows.map((r) => {
          const pct = Math.round((r.total / max) * 100);
          const tone = barToneForValue(r.name, r.total, average);
          return (
            <li key={r.name} className="dash-labeled-bar-row">
              <span className="dash-labeled-bar-label" title={r.name}>
                {r.name}
              </span>
              <div className="dash-labeled-bar-track">
                <div
                  className={`dash-labeled-bar-fill ${toneClass(tone)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="dash-labeled-bar-end">
                {r.count} · {formatValue(r.total)} PLN
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StackedStatusBar({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  const total = items.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return null;

  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">{title}</h4>
      <div
        className="dash-stacked-bar"
        role="img"
        aria-label={title}
      >
        {items.map((d) => {
          const pct = (d.count / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={d.label}
              className="dash-stacked-segment"
              style={{ width: `${pct}%`, backgroundColor: decisionColor(d.label) }}
              title={`${d.label}: ${d.count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <ul className="dash-stacked-legend">
        {items.map((d) => (
          <li key={d.label}>
            <span className="dash-legend-swatch" style={{ backgroundColor: decisionColor(d.label) }} />
            <span>{d.label}</span>
            <span className="dash-legend-meta">
              {d.count} ({Math.round((d.count / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HealthGaugePanel({
  buckets,
  fleetAvgScore,
}: {
  buckets: HealthBucket[];
  fleetAvgScore: number | null;
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0) || 1;
  const score = fleetAvgScore ?? 0;
  const pct = Math.min(100, Math.max(0, score));
  const grade =
    score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
  const gradeClass =
    score >= 80 ? 'gauge-a' : score >= 65 ? 'gauge-b' : score >= 50 ? 'gauge-c' : 'gauge-d';

  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">Health score floty</h4>
      <div className="dash-gauge-layout">
        <div className={`dash-gauge ${gradeClass}`} role="img" aria-label={`Średni health ${score}`}>
          <div className="dash-gauge-meter">
            <div className="dash-gauge-meter-fill" style={{ width: `${pct}%` } as CSSProperties} />
          </div>
          <div className="dash-gauge-center">
            <span className="dash-gauge-score">{Math.round(score)}</span>
            <span className="dash-gauge-grade">klasa {grade}</span>
          </div>
        </div>
        <ul className="dash-health-list">
          {buckets.map((b) => (
            <li key={b.label}>
              <span className="dash-health-grade">{b.label.split(' ')[0]}</span>
              <span className="dash-health-count">
                {b.count} poj. ({Math.round((b.count / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="dash-chart-desc">Progi: ≥80 zielony · 65–79 żółty · &lt;65 czerwony</p>
    </div>
  );
}

export function TopVehiclesWithAvg({
  rows,
  fleetAverage,
  embedded = false,
}: {
  rows: RankRow[];
  fleetAverage: number;
  /** Bez zewnętrznej karty — do osadzenia w szerszym panelu Insights. */
  embedded?: boolean;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.total), fleetAverage, 1);
  const avgPct = Math.round((fleetAverage / max) * 100);

  const body = (
    <>
      <h4 className="dash-chart-title">Top pojazdy (koszt)</h4>
      <div className="dash-avg-legend">
        <span className="dash-avg-line-swatch" />
        Średnia floty: {formatPln(fleetAverage)} PLN
      </div>
      <ul className="dash-labeled-bars dash-bars-with-avg">
        <li className="dash-avg-line-row" aria-hidden>
          <div className="dash-labeled-bar-track">
            <div className="dash-avg-reference" style={{ left: `${avgPct}%` }} />
          </div>
        </li>
        {rows.map((r) => {
          const pct = Math.round((r.total / max) * 100);
          const tone = barToneForValue(r.name, r.total, fleetAverage);
          return (
            <li key={r.name} className="dash-labeled-bar-row">
              <span className="dash-labeled-bar-label">{r.name}</span>
              <div className="dash-labeled-bar-track">
                <div
                  className={`dash-labeled-bar-fill ${toneClass(tone)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="dash-labeled-bar-end">{formatPln(r.total)} PLN</span>
            </li>
          );
        })}
      </ul>
    </>
  );

  if (embedded) return <div className="dash-vehicle-bars-embedded">{body}</div>;
  return <div className="dash-chart-card">{body}</div>;
}

function FuelRegionRows({ rows, maxCost, maxCount }: { rows: RegionFuelRow[]; maxCost: number; maxCount: number }) {
  const avgCost = rows.length ? rows.reduce((s, r) => s + r.fuelCost, 0) / rows.length : 0;
  const maxPlnPerVehicle = Math.max(
    ...rows.map((r) => (r.vehicleCount > 0 ? r.fuelCost / r.vehicleCount : 0)),
    1,
  );

  return (
    <>
      {rows.map((r) => {
        const plnPerVehicle = r.vehicleCount > 0 ? r.fuelCost / r.vehicleCount : null;
        const tone = barToneForValue(r.region, r.fuelCost, avgCost);
        return (
          <li
            key={r.region}
            className={isUnassignedLabel(r.region) ? 'dash-grouped-fuel-row dash-grouped-fuel-unassigned' : 'dash-grouped-fuel-row'}
          >
            <span className="dash-grouped-fuel-label" title={r.region}>
              {r.region}
            </span>
            <div className="dash-grouped-fuel-bars">
              <div className="dash-grouped-pair">
                <span className="dash-grouped-tag">Tank.</span>
                <div className="dash-grouped-track">
                  <div
                    className="dash-grouped-fill dash-grouped-count"
                    style={{ width: `${Math.round((r.fuelCount / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="dash-grouped-val">{r.fuelCount} szt.</span>
              </div>
              <div className="dash-grouped-pair">
                <span className="dash-grouped-tag">PLN</span>
                <div className="dash-grouped-track">
                  <div
                    className={`dash-grouped-fill ${tone === 'alert' ? 'dash-bar-alert' : tone === 'warning' ? 'dash-bar-warn' : 'dash-bar-fuel'}`}
                    style={{ width: `${Math.round((r.fuelCost / maxCost) * 100)}%` }}
                  />
                </div>
                <span className="dash-grouped-val">{formatPln(r.fuelCost)} PLN</span>
              </div>
              <div className="dash-grouped-pair">
                <span className="dash-grouped-tag">PLN/poj.</span>
                <div className="dash-grouped-track">
                  <div
                    className="dash-grouped-fill dash-bar-neutral"
                    style={{
                      width: `${plnPerVehicle != null ? Math.round((plnPerVehicle / maxPlnPerVehicle) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="dash-grouped-val">
                  {plnPerVehicle != null ? `${formatPln(plnPerVehicle)} PLN` : '—'}
                </span>
              </div>
            </div>
            <span className="dash-grouped-meta">
              {r.vehicleCount} poj.
              {r.fuelLitersPer100Km != null ? ` · ${r.fuelLitersPer100Km.toFixed(1)} L/100 km` : ''}
              {r.drivenKm > 0 ? ` · ${r.drivenKm.toFixed(0)} km` : ''}
            </span>
          </li>
        );
      })}
    </>
  );
}

export function GroupedFuelByRegion({ rows }: { rows: RegionFuelRow[] }) {
  if (!rows.length) return null;

  const assigned = rows.filter((r) => !isUnassignedLabel(r.region));
  const unassigned = rows.filter((r) => isUnassignedLabel(r.region));

  const maxCostAssigned = Math.max(...assigned.map((r) => r.fuelCost), 1);
  const maxCountAssigned = Math.max(...assigned.map((r) => r.fuelCount), 1);
  const maxCostAll = Math.max(...rows.map((r) => r.fuelCost), 1);
  const maxCountAll = Math.max(...rows.map((r) => r.fuelCount), 1);

  return (
    <div className="dash-chart-card dash-chart-wide">
      <h4 className="dash-chart-title">Paliwo wg regionu</h4>
      <p className="dash-chart-desc">
        Ranking poziomy: tankowania, suma PLN i PLN na pojazd. Skala osobno dla regionów przypisanych
        (bez rozciągania przez „Nieprzypisany”).
      </p>
      <ul className="dash-grouped-fuel">
        <FuelRegionRows rows={assigned} maxCost={maxCostAssigned} maxCount={maxCountAssigned} />
      </ul>
      {unassigned.length > 0 && (
        <>
          <p className="dash-grouped-unassigned-head">Nieprzypisany (osobna skala)</p>
          <ul className="dash-grouped-fuel dash-grouped-fuel-unassigned-block">
            <FuelRegionRows rows={unassigned} maxCost={maxCostAll} maxCount={maxCountAll} />
          </ul>
        </>
      )}
    </div>
  );
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
