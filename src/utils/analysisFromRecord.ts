import type { AnalysisVariables } from '../services/maestro';
import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import {
  normalizeDpdRecord,
  pickField,
  pickVehicleFlagField,
  recordId,
  type DpdRecord,
} from './record';

function pickNonEmpty(r: DpdRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = pickField(r, key);
    if (v !== '—') return v;
  }
  return undefined;
}

function formatDeclaredAmount(netPrice: string | undefined): string | undefined {
  if (!netPrice) return undefined;
  return /pln/i.test(netPrice) ? netPrice : `${netPrice} PLN`;
}

function resolveAutoDecision(r: DpdRecord): string | undefined {
  const explicit = pickNonEmpty(r, 'autoDecision');
  if (explicit) return explicit;

  const status = pickNonEmpty(r, 'decision');
  if (status && /^auto[\s-]/i.test(status)) return status;

  return undefined;
}

/**
 * Build AI analysis panel data from persisted DPD_POC fields (and linked DPD_VehicleFlags).
 * Maestro writes results back to the entity; session-only storedResults misses approved/rejected rows.
 */
export function analysisVariablesFromRecord(
  record: DpdRecord | null | undefined,
  vehicleFlag?: VehicleFlagHistoryItem | null,
  id?: string,
): AnalysisVariables | null {
  if (!record) return null;

  const r = normalizeDpdRecord(record);
  const flagRaw = vehicleFlag?.raw ? normalizeDpdRecord(vehicleFlag.raw) : null;

  const fromFlag = (...canon: string[]): string | undefined => {
    if (!flagRaw) return undefined;
    for (const key of canon) {
      const v = pickVehicleFlagField(flagRaw, key);
      if (v !== '—') return v;
    }
    return undefined;
  };

  const fleetManagerNote =
    pickNonEmpty(r, 'fleetManagerNote') ?? fromFlag('fleetManagerNote', 'description');

  const combinedScore =
    pickNonEmpty(r, 'combinedScore') ?? fromFlag('combinedScore', 'aiConfidenceScore');

  const riskLevel = pickNonEmpty(r, 'riskLevel') ?? fromFlag('riskLevel');

  const flagType = pickNonEmpty(r, 'flagType') ?? fromFlag('flagType');

  const requiresAction = fromFlag('requiresAction');
  const validationStatus =
    pickNonEmpty(r, 'validationStatus', 'comments') ??
    (requiresAction && requiresAction.length <= 80 ? requiresAction : undefined);
  const decision = resolveAutoDecision(r);
  const vehicleReg = pickNonEmpty(r, 'carRegistration');
  const declaredAmount = formatDeclaredAmount(pickNonEmpty(r, 'netPrice', 'amount'));

  if (
    !fleetManagerNote &&
    !combinedScore &&
    !riskLevel &&
    !flagType &&
    !decision &&
    !validationStatus
  ) {
    return null;
  }

  return {
    recordId: id ?? recordId(r),
    fleetManagerNote,
    combinedScore,
    riskLevel,
    flagType,
    decision,
    validationStatus,
    vehicleReg,
    declaredAmount,
  };
}
