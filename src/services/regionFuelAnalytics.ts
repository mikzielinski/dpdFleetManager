import { categorizeService } from '../utils/serviceCategories';
import { computeFuelConsumption, fuelLitersFromRecord } from '../utils/fuelConsumption';
import { getRecordNumericAmount } from '../utils/filterRecords';
import type { DpdRecord } from '../utils/record';
import { normalizeRegistration, pickField } from '../utils/record';
import { mileageKmInPeriodFromFabric } from './fabricMileage';
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
  fuelLitersPer100Km: number | null;
  kmPerLiter: number | null;
}

export interface VehicleFuelPeriodStats {
  fuelCost: number;
  fuelLiters: number;
  fuelCount: number;
  drivenKm: number | null;
  fuelCostPerKm: number | null;
  fuelLitersPer100Km: number | null;
  kmPerLiter: number | null;
  plnPerLiter: number | null;
  region: string;
  regionAvgFuelCostPerKm: number | null;
  regionAvgLitersPer100Km: number | null;
  vsRegionCostPct: number | null;
  vsRegionConsumptionPct: number | null;
}

function isFuelRecord(r: DpdRecord): boolean {
  const svc = pickField(r, 'serviceName', 'ServiceName');
  const st = pickField(r, 'serviceType', 'ServiceType');
  return categorizeService(svc === '—' ? '' : svc, st === '—' ? '' : st) === 'Paliwo';
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
  allPocForMileage: DpdRecord[],
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
    const { drivenKm } = mileageKmInPeriodFromFabric(
      v.registration,
      allPocForMileage,
      period,
      v.compliance?.mileageKm,
    );
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
    const consumption = computeFuelConsumption(v.fuelLiters, v.drivenKm, v.fuelCost);
    rows.push({
      region,
      fuelCost: v.fuelCost,
      fuelLiters: v.fuelLiters,
      fuelCount: v.fuelCount,
      vehicleCount,
      drivenKm: v.drivenKm,
      fuelCostPerKm: v.drivenKm > 0 ? v.fuelCost / v.drivenKm : null,
      avgFuelCostPerVehicle: vehicleCount > 0 ? v.fuelCost / vehicleCount : 0,
      fuelLitersPer100Km: consumption.litersPer100Km,
      kmPerLiter: consumption.kmPerLiter,
    });
  }

  return rows.sort((a, b) => b.fuelCost - a.fuelCost);
}

export function statsForVehicleFuelPeriod(
  vehicle: VehicleCatalogItem,
  pocInPeriod: DpdRecord[],
  allPocForMileage: DpdRecord[],
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

  const { drivenKm } = mileageKmInPeriodFromFabric(
    vehicle.registration,
    allPocForMileage,
    period,
    vehicle.compliance?.mileageKm,
  );
  const region = vehicle.areaLabel?.trim() || 'Nieprzypisany';
  const regionRow = regionRows.find((x) => x.region === region);
  const regionAvgCost = regionRow?.fuelCostPerKm ?? null;
  const regionAvgL100 = regionRow?.fuelLitersPer100Km ?? null;
  const fuelCostPerKm =
    drivenKm != null && drivenKm > 0 ? fuelCost / drivenKm : null;
  const consumption = computeFuelConsumption(fuelLiters, drivenKm, fuelCost);

  let vsRegionCostPct: number | null = null;
  if (fuelCostPerKm != null && regionAvgCost != null && regionAvgCost > 0) {
    vsRegionCostPct = Math.round(((fuelCostPerKm - regionAvgCost) / regionAvgCost) * 100);
  }

  let vsRegionConsumptionPct: number | null = null;
  if (
    consumption.litersPer100Km != null &&
    regionAvgL100 != null &&
    regionAvgL100 > 0
  ) {
    vsRegionConsumptionPct = Math.round(
      ((consumption.litersPer100Km - regionAvgL100) / regionAvgL100) * 100,
    );
  }

  return {
    fuelCost,
    fuelLiters,
    fuelCount,
    drivenKm,
    fuelCostPerKm,
    fuelLitersPer100Km: consumption.litersPer100Km,
    kmPerLiter: consumption.kmPerLiter,
    plnPerLiter: consumption.plnPerLiter,
    region,
    regionAvgFuelCostPerKm: regionAvgCost,
    regionAvgLitersPer100Km: regionAvgL100,
    vsRegionCostPct,
    vsRegionConsumptionPct,
  };
}
