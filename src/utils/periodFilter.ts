import type { DpdRecord } from './record';
import { getRecordDate } from './record';

export type PeriodPreset =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'halfYear'
  | 'year'
  | 'custom'
  | 'all';

export interface PeriodFilterState {
  preset: PeriodPreset;
  /** ISO date YYYY-MM-DD — dla custom lub nadpisanie */
  customFrom: string;
  customTo: string;
}

export const DEFAULT_PERIOD_FILTER: PeriodFilterState = {
  preset: 'month',
  customFrom: '',
  customTo: '',
};

export function isPeriodFilterActive(state: PeriodFilterState): boolean {
  return state.preset !== 'all';
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseIsoDateInput(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = Date.parse(`${t}T12:00:00`);
  return Number.isFinite(d) ? new Date(d) : null;
}

/** Granice okresu [from, to] w czasie lokalnym (kalendarz PL). */
export function resolvePeriodBounds(state: PeriodFilterState, now = new Date()): {
  from: Date;
  to: Date;
} {
  const end = endOfDay(now);
  const today = startOfDay(now);

  if (state.preset === 'all') {
    return { from: new Date(0), to: end };
  }

  if (state.preset === 'custom') {
    const from = parseIsoDateInput(state.customFrom) ?? today;
    const toRaw = parseIsoDateInput(state.customTo) ?? today;
    const to = endOfDay(toRaw);
    if (from.getTime() > to.getTime()) return { from: startOfDay(toRaw), to };
    return { from: startOfDay(from), to };
  }

  if (state.preset === 'day') {
    return { from: today, to: end };
  }

  if (state.preset === 'week') {
    const from = new Date(today);
    const dow = from.getDay() === 0 ? 6 : from.getDay() - 1;
    from.setDate(from.getDate() - dow);
    return { from: startOfDay(from), to: end };
  }

  if (state.preset === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: startOfDay(from), to: end };
  }

  if (state.preset === 'quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const from = new Date(today.getFullYear(), q * 3, 1);
    return { from: startOfDay(from), to: end };
  }

  if (state.preset === 'halfYear') {
    const h = today.getMonth() < 6 ? 0 : 6;
    const from = new Date(today.getFullYear(), h, 1);
    return { from: startOfDay(from), to: end };
  }

  if (state.preset === 'year') {
    const from = new Date(today.getFullYear(), 0, 1);
    return { from: startOfDay(from), to: end };
  }

  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: startOfDay(from), to: end };
}

export function formatPeriodRangeLabel(state: PeriodFilterState, now = new Date()): string {
  if (state.preset === 'all') return 'Cała historia';
  const { from, to } = resolvePeriodBounds(state, now);
  const fmt = (d: Date) =>
    d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const labels: Record<PeriodPreset, string> = {
    day: '1 dzień',
    week: 'Tydzień',
    month: 'Miesiąc',
    quarter: 'Kwartał',
    halfYear: 'Pół roku',
    year: 'Rok',
    custom: 'Zakres',
    all: 'Wszystko',
  };
  const preset = labels[state.preset];
  return `${preset}: ${fmt(from)} – ${fmt(to)}`;
}

/** Poprzedni okres o tej samej długości co bieżący preset (do trendów KPI). */
export function resolvePreviousPeriodBounds(
  state: PeriodFilterState,
  now = new Date(),
): { from: Date; to: Date } | null {
  if (!isPeriodFilterActive(state)) return null;
  const { from, to } = resolvePeriodBounds(state, now);
  const spanMs = to.getTime() - from.getTime() + 1;
  const prevEnd = new Date(from.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs + 1);
  return { from: startOfDay(prevStart), to: endOfDay(prevEnd) };
}

export function filterRecordsByPreviousPeriod(
  items: DpdRecord[],
  state: PeriodFilterState,
  now = new Date(),
): DpdRecord[] {
  const bounds = resolvePreviousPeriodBounds(state, now);
  if (!bounds) return [];
  const fromMs = bounds.from.getTime();
  const toMs = bounds.to.getTime();
  return items.filter((r) => {
    const d = getRecordDate(r);
    if (!d) return false;
    const t = d.getTime();
    return t >= fromMs && t <= toMs;
  });
}

export function filterRecordsByPeriod(
  items: DpdRecord[],
  state: PeriodFilterState,
  now = new Date(),
): DpdRecord[] {
  if (!isPeriodFilterActive(state)) return items;
  const { from, to } = resolvePeriodBounds(state, now);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  return items.filter((r) => {
    const d = getRecordDate(r);
    if (!d) return false;
    const t = d.getTime();
    return t >= fromMs && t <= toMs;
  });
}

export const PERIOD_PRESET_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: 'day', label: '1 dzień' },
  { id: 'week', label: 'Tydzień' },
  { id: 'month', label: 'Miesiąc' },
  { id: 'quarter', label: 'Kwartał' },
  { id: 'halfYear', label: 'Pół roku' },
  { id: 'year', label: 'Rok' },
  { id: 'custom', label: 'Zakres' },
  { id: 'all', label: 'Wszystko' },
];
