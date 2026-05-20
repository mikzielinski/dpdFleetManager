import { categorizeService } from '../utils/serviceCategories';
import { getRecordNumericAmount } from '../utils/filterRecords';
import type { DpdRecord } from '../utils/record';
import { normalizeRegistration, pickField } from '../utils/record';
import { mileageKmInPeriod } from '../data/demoMileageReports';
import type { PeriodFilterState } from '../utils/periodFilter';
import type { VehicleCatalogItem } from './vehicleCatalog';
import { matchCostsToVehicle } from './vehicleCatalog';

export interface RegionFuelRow {
  region: string;
  fuelCost: number;
  fuelLiters: number;
  fuelCount: number;
  vehicleCount: number;
  drivenKm: number;
  fuelCostPerKm: number | null;
  avgFuelCostPerVehicle: number;
}

export interface VehicleFuelPeriodStats {
  fuelCost: number;
  fuelLiters: number;
  fuelCount: number;
  drivenKm: number | null;
  fuelCostPerKm: number | null;
  region: string;
  regionAvgFuelCostPerKm: number | null;
  vsRegionPct: number | null;
}

function isFuelRecord(r: DpdRecord): boolean {
  const svc = pickField(r, 'serviceName', 'ServiceName');
  const st = pickField(r, 'serviceType', 'ServiceType');
  return categorizeService(svc === '—' ? '' : svc, st === '—' ? '' : st) === 'Paliwo';
}

function fuelLitersFromRecord(r: DpdRecord): number {
  const amt = getRecordNumericAmount(r);
  const qty = parseNumLoose(pickField(r, 'amount', 'Amount'));
  if (qty != null && qty > 0 && qty < 500) return qty;
  if (amt != null && amt > 0 && amt < 80) return Math.round(amt * 10) / 10;
  return 0;
}

function parseNumLoose(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function plateToRegion(
  plate: string,
  vehicles: VehicleCatalogItem[],
): string {
  const key = normalizeRegistration(plate);
  const v = vehicles.find((x) => normalizeRegistration(x.registration) === key);
  return v?.areaLabel?.trim() || 'Nieprzypisany';
}

/** Zużycie paliwa wg regionu / miasta w wybranym okresie. */
export function aggregateFuelByRegion(
  pocInPeriod: DpdRecord[],
  vehicles: VehicleCatalogItem[],
  period: PeriodFilterState,
): RegionFuelRow[] {
  const byRegion = new Map<
    string,
    {
      fuelCost: number;
      fuelLiters: number;
      fuelCount: number;
      plates: Set<string>;
      drivenKm: number;
    }
  >();

  for (const v of vehicles) {
    const region = v.areaLabel?.trim() || 'Nieprzypisany';
    const { drivenKm } = mileageKmInPeriod(v.registration, v.compliance?.mileageKm, period);
    const entry = byRegion.get(region) ?? {
      fuelCost: 0,
      fuelLiters: 0,
      fuelCount: 0,
      plates: new Set<string>(),
      drivenKm: 0,
    };
    entry.plates.add(normalizeRegistration(v.registration));
    if (drivenKm != null) entry.drivenKm += drivenKm;
    byRegion.set(region, entry);
  }

  for (const r of pocInPeriod) {
    if (!isFuelRecord(r)) continue;
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg === '—') continue;
    const region = plateToRegion(reg, vehicles);
    const cost = getRecordNumericAmount(r) ?? 0;
    const liters = fuelLitersFromRecord(r);

    const entry = byRegion.get(region) ?? {
      fuelCost: 0,
      fuelLiters: 0,
      fuelCount: 0,
      plates: new Set<string>(),
      drivenKm: 0,
    };
    entry.fuelCost += cost;
    entry.fuelLiters += liters;
    entry.fuelCount += 1;
    entry.plates.add(normalizeRegistration(reg));
    byRegion.set(region, entry);
  }

  const rows: RegionFuelRow[] = [];
  for (const [region, v] of byRegion) {
    if (v.fuelCount === 0 && v.drivenKm === 0) continue;
    const vehicleCount = v.plates.size;
    rows.push({
      region,
      fuelCost: v.fuelCost,
      fuelLiters: v.fuelLiters,
      fuelCount: v.fuelCount,
      vehicleCount,
      drivenKm: v.drivenKm,
      fuelCostPerKm: v.drivenKm > 0 ? v.fuelCost / v.drivenKm : null,
      avgFuelCostPerVehicle: vehicleCount > 0 ? v.fuelCost / vehicleCount : 0,
    });
  }

  return rows.sort((a, b) => b.fuelCost - a.fuelCost);
}

export function statsForVehicleFuelPeriod(
  vehicle: VehicleCatalogItem,
  pocInPeriod: DpdRecord[],
  pocVehicleFieldNames: readonly string[],
  period: PeriodFilterState,
  regionRows: RegionFuelRow[],
): VehicleFuelPeriodStats {
  const costs = matchCostsToVehicle(pocInPeriod, vehicle, pocVehicleFieldNames);
  let fuelCost = 0;
  let fuelLiters = 0;
  let fuelCount = 0;
  for (const r of costs) {
    if (!isFuelRecord(r)) continue;
    fuelCost += getRecordNumericAmount(r) ?? 0;
    fuelLiters += fuelLitersFromRecord(r);
    fuelCount += 1;
  }

  const { drivenKm } = mileageKmInPeriod(
    vehicle.registration,
    vehicle.compliance?.mileageKm,
    period,
  );
  const region = vehicle.areaLabel?.trim() || 'Nieprzypisany';
  const regionRow = regionRows.find((x) => x.region === region);
  const regionAvg = regionRow?.fuelCostPerKm ?? null;
  const fuelCostPerKm =
    drivenKm != null && drivenKm > 0 ? fuelCost / drivenKm : null;
  let vsRegionPct: number | null = null;
  if (fuelCostPerKm != null && regionAvg != null && regionAvg > 0) {
    vsRegionPct = Math.round(((fuelCostPerKm - regionAvg) / regionAvg) * 100);
  }

  return {
    fuelCost,
    fuelLiters,
    fuelCount,
    drivenKm,
    fuelCostPerKm,
    region,
    regionAvgFuelCostPerKm: regionAvg,
    vsRegionPct,
  };
}
