import type { TableColumn } from '../config';
import type { VehicleFlagHistoryItem } from './dataFabric';
import { isRecordAnalyzed, getRecordNumericAmount } from '../utils/filterRecords';
import { categorizeService, type ServiceCategory } from '../utils/serviceCategories';
import type { DpdRecord } from '../utils/record';
import { pickField, normalizeRegistration } from '../utils/record';
import type { VehicleCatalogItem } from './vehicleCatalog';
import { matchCostsToVehicle } from './vehicleCatalog';

export interface CategoryBreakdown {
  category: ServiceCategory;
  count: number;
  total: number;
}

export interface ServiceBreakdown {
  name: string;
  category: ServiceCategory;
  count: number;
  total: number;
}

export interface DecisionBreakdown {
  label: string;
  count: number;
}

export interface FleetCostStats {
  totalCost: number;
  claimCount: number;
  flaggedCount: number;
  avgCost: number;
  byCategory: CategoryBreakdown[];
  byService: ServiceBreakdown[];
  byDecision: DecisionBreakdown[];
}

function aggregateCosts(
  costs: DpdRecord[],
  _tableColumns?: TableColumn[],
  flagsByCostId?: Map<string, VehicleFlagHistoryItem>,
): FleetCostStats {
  const catMap = new Map<ServiceCategory, { count: number; total: number }>();
  const svcMap = new Map<string, ServiceBreakdown>();
  const decMap = new Map<string, number>();
  let totalCost = 0;
  let flaggedCount = 0;

  for (const r of costs) {
    const amount = getRecordNumericAmount(r) ?? 0;
    totalCost += amount;
    if (isRecordAnalyzed(r, flagsByCostId)) flaggedCount += 1;

    const svc = pickField(r, 'serviceName', 'ServiceName');
    const st = pickField(r, 'serviceType', 'ServiceType');
    const cat = categorizeService(svc === '—' ? '' : svc, st === '—' ? '' : st);

    const catEntry = catMap.get(cat) ?? { count: 0, total: 0 };
    catEntry.count += 1;
    catEntry.total += amount;
    catMap.set(cat, catEntry);

    const svcKey = svc === '—' ? '—' : svc;
    const svcEntry = svcMap.get(svcKey) ?? {
      name: svcKey,
      category: cat,
      count: 0,
      total: 0,
    };
    svcEntry.count += 1;
    svcEntry.total += amount;
    svcMap.set(svcKey, svcEntry);

    const dec = pickField(r, 'decision', 'Status');
    const decKey = dec === '—' ? 'Brak statusu' : dec;
    decMap.set(decKey, (decMap.get(decKey) ?? 0) + 1);
  }

  const claimCount = costs.length;
  const byCategory = [...catMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);
  const byService = [...svcMap.values()].sort((a, b) => b.total - a.total);
  const byDecision = [...decMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCost,
    claimCount,
    flaggedCount,
    avgCost: claimCount > 0 ? totalCost / claimCount : 0,
    byCategory,
    byService,
    byDecision,
  };
}

export function statsForVehicle(
  vehicle: Pick<VehicleCatalogItem, 'id' | 'registration'>,
  allPoc: DpdRecord[],
  pocVehicleFieldNames: readonly string[],
  tableColumns?: TableColumn[],
): FleetCostStats {
  const costs = matchCostsToVehicle(allPoc, vehicle, pocVehicleFieldNames);
  return aggregateCosts(costs, tableColumns);
}

export function statsForCompany(
  companyName: string,
  fleet: VehicleCatalogItem[],
  allPoc: DpdRecord[],
  _pocVehicleFieldNames?: readonly string[],
  tableColumns?: TableColumn[],
): FleetCostStats {
  const plates = new Set(
    fleet.filter((v) => v.companyLabel === companyName).map((v) => normalizeRegistration(v.registration)),
  );
  const costs = allPoc.filter((r) => {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg === '—') return false;
    return plates.has(normalizeRegistration(reg));
  });
  return aggregateCosts(costs, tableColumns);
}

export function fleetMedianCostPerClaim(allPoc: DpdRecord[]): number {
  const amounts = allPoc
    .map((r) => getRecordNumericAmount(r))
    .filter((a): a is number => a !== null && a > 0)
    .sort((a, b) => a - b);
  if (!amounts.length) return 0;
  const mid = Math.floor(amounts.length / 2);
  return amounts.length % 2 ? amounts[mid]! : (amounts[mid - 1]! + amounts[mid]!) / 2;
}

export function statsForFleet(
  allPoc: DpdRecord[],
  tableColumns?: TableColumn[],
  flagsByCostId?: Map<string, VehicleFlagHistoryItem>,
): FleetCostStats {
  return aggregateCosts(allPoc, tableColumns, flagsByCostId);
}

/** Koszty przypisane do rejestracji (dla tabeli pojazdów). */
export function vehicleCostTotals(
  fleet: VehicleCatalogItem[],
  allPoc: DpdRecord[],
  pocVehicleFieldNames: readonly string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of fleet) {
    const s = statsForVehicle(v, allPoc, pocVehicleFieldNames);
    map.set(v.id, s.totalCost);
  }
  return map;
}
