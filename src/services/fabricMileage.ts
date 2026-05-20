import type { PeriodFilterState } from '../utils/periodFilter';
import { resolvePeriodBounds } from '../utils/periodFilter';
import type { DpdRecord } from '../utils/record';
import {
  getRecordDate,
  normalizeRegistration,
  pickField,
  resolveRecordField,
} from '../utils/record';

export type MileageDataSource = 'poc_reports' | 'vehicle_odometer' | 'missing';

export interface MileagePeriodResult {
  startKm: number | null;
  endKm: number | null;
  drivenKm: number | null;
  source: MileageDataSource;
  reportCount: number;
}

const POC_MILEAGE_FIELD_NAMES = [
  'Mileage',
  'Odometer',
  'Przebieg',
  'OdometerReading',
  'CurrentMileage',
  'Kilometers',
  'LastOdometer',
  'VehicleMileage',
  'ReportedMileage',
] as const;

const MILEAGE_SERVICE_PATTERN =
  /przebieg|odometer|mileage|licznik|raport\s*kierow|driver\s*mileage/i;

function parseMileageValue(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Odczyt przebiegu z pojedynczego rekordu DPD_POC (pole lub usługa-raport). */
export function parseMileageFromPocRecord(r: DpdRecord): number | null {
  for (const name of POC_MILEAGE_FIELD_NAMES) {
    const v = resolveRecordField(r, name);
    const km = parseMileageValue(v);
    if (km != null) return km;
  }
  const svc = pickField(r, 'serviceName', 'ServiceName');
  const st = pickField(r, 'serviceType', 'ServiceType');
  const blob = `${svc} ${st}`;
  if (MILEAGE_SERVICE_PATTERN.test(blob)) {
    const amt = parseMileageValue(resolveRecordField(r, 'amount', 'Amount'));
    if (amt != null && amt > 500) return amt;
  }
  return null;
}

interface MileageReading {
  at: Date;
  km: number;
}

function plateMatches(reg: string, plate: string): boolean {
  return normalizeRegistration(reg) === normalizeRegistration(plate);
}

/**
 * Przebieg w okresie z raportów w DPD_POC (kierowca / odczyt licznika na rozliczeniu).
 * Bez danych demo — tylko rekordy z Data Fabric.
 */
export function mileageKmInPeriodFromFabric(
  registration: string,
  allPoc: DpdRecord[],
  period: PeriodFilterState,
  vehicleOdometerKm?: number | null,
): MileagePeriodResult {
  const plate = registration.trim();
  if (!plate) {
    return { startKm: null, endKm: null, drivenKm: null, source: 'missing', reportCount: 0 };
  }

  const { from, to } = resolvePeriodBounds(period);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const readings: MileageReading[] = [];

  for (const row of allPoc) {
    const reg = pickField(row, 'carRegistration', 'CarRegistration');
    if (reg === '—' || !plateMatches(reg, plate)) continue;

    const km = parseMileageFromPocRecord(row);
    if (km == null) continue;

    const at = getRecordDate(row);
    if (!at) continue;

    readings.push({ at, km });
  }

  readings.sort((a, b) => a.at.getTime() - b.at.getTime());

  if (readings.length === 0) {
    if (vehicleOdometerKm != null && vehicleOdometerKm > 0) {
      return {
        startKm: null,
        endKm: vehicleOdometerKm,
        drivenKm: null,
        source: 'vehicle_odometer',
        reportCount: 0,
      };
    }
    return { startKm: null, endKm: null, drivenKm: null, source: 'missing', reportCount: 0 };
  }

  const beforePeriod = readings.filter((r) => r.at.getTime() < fromMs);
  const inPeriod = readings.filter((r) => r.at.getTime() >= fromMs && r.at.getTime() <= toMs);

  const startKm =
    beforePeriod.length > 0
      ? beforePeriod[beforePeriod.length - 1]!.km
      : inPeriod.length > 0
        ? inPeriod[0]!.km
        : null;

  const endFromPoc =
    inPeriod.length > 0
      ? inPeriod[inPeriod.length - 1]!.km
      : beforePeriod.length > 0
        ? beforePeriod[beforePeriod.length - 1]!.km
        : null;

  const endKm =
    endFromPoc ??
    (vehicleOdometerKm != null && vehicleOdometerKm > 0 ? vehicleOdometerKm : null);

  let drivenKm: number | null = null;
  if (startKm != null && endKm != null && endKm >= startKm) {
    drivenKm = endKm - startKm;
  }

  return {
    startKm,
    endKm,
    drivenKm,
    source: 'poc_reports',
    reportCount: inPeriod.length || readings.length,
  };
}
