import { normalizeRegistration } from '../utils/record';
import { resolvePeriodBounds, type PeriodFilterState } from '../utils/periodFilter';

export interface MonthlyMileageReport {
  registration: string;
  monthKey: string;
  odometerKm: number;
  reportedAt: string;
}

function hashPlate(plate: string): number {
  const s = normalizeRegistration(plate);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Miesięczne raporty przebiegu kierowcy (demo — brak encji w Fabric). */
export function buildMonthlyMileageReports(
  registration: string,
  endOdometerKm: number,
  monthsBack = 14,
): MonthlyMileageReport[] {
  const reg = normalizeRegistration(registration);
  if (!reg || endOdometerKm <= 0) return [];

  const h = hashPlate(reg);
  const kmPerMonth = 1200 + (h % 1400);
  const reports: MonthlyMileageReport[] = [];
  let odometer = endOdometerKm;
  const now = new Date();

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 5);
    const reportedAt = d.toISOString().slice(0, 10);
    reports.push({
      registration: reg,
      monthKey: monthKey(d),
      odometerKm: Math.round(odometer),
      reportedAt,
    });
    const jitter = kmPerMonth + ((h + i * 17) % 400) - 200;
    odometer = Math.max(5000, odometer - jitter);
  }

  return reports.reverse();
}

export function mileageKmInPeriod(
  registration: string,
  endOdometerKm: number | null | undefined,
  period: PeriodFilterState,
): { startKm: number | null; endKm: number | null; drivenKm: number | null } {
  const endKm = endOdometerKm != null && endOdometerKm > 0 ? endOdometerKm : null;
  if (!endKm) return { startKm: null, endKm: null, drivenKm: null };

  const reports = buildMonthlyMileageReports(registration, endKm);
  if (!reports.length) return { startKm: null, endKm, drivenKm: null };

  const { from, to } = resolvePeriodBounds(period);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const inRange = reports.filter((r) => {
    const t = Date.parse(r.reportedAt);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });

  if (!inRange.length) {
    const before = reports.filter((r) => Date.parse(r.reportedAt) < fromMs);
    const startKm = before.length ? before[before.length - 1]!.odometerKm : reports[0]!.odometerKm;
    return { startKm, endKm, drivenKm: Math.max(0, endKm - startKm) };
  }

  const startKm = inRange[0]!.odometerKm;
  const last = inRange[inRange.length - 1]!;
  const drivenKm = Math.max(0, endKm - startKm);
  return { startKm, endKm: last.odometerKm <= endKm ? endKm : last.odometerKm, drivenKm };
}
