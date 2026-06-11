import type { AnalysisVariables } from '../services/maestro';
import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import {
  normalizeDpdRecord,
  pickField,
  pickVehicleFlagField,
  recordId,
  type DpdRecord,
} from './record';

const ANALYSIS_CONTENT_KEYS: (keyof AnalysisVariables)[] = [
  'fleetManagerNote',
  'combinedScore',
  'riskLevel',
  'flagType',
  'decision',
  'validationStatus',
  'summary',
  'declaredAmount',
  'vehicleReg',
];

/** True when at least one field carries displayable AI analysis content. */
export function hasAnalysisContent(vars: AnalysisVariables | null | undefined): boolean {
  if (!vars) return false;
  return ANALYSIS_CONTENT_KEYS.some((key) => {
    const v = vars[key];
    return v != null && String(v).trim() !== '';
  });
}

/** Prefer session (Maestro) values; fill gaps from persisted record / VehicleFlags. */
export function mergeAnalysisVariables(
  session?: AnalysisVariables | null,
  persisted?: AnalysisVariables | null,
): AnalysisVariables | null {
  if (!hasAnalysisContent(session) && !hasAnalysisContent(persisted)) {
    return null;
  }
  if (!hasAnalysisContent(session)) return persisted ?? null;
  if (!hasAnalysisContent(persisted)) return session ?? null;

  const pick = (key: keyof AnalysisVariables): string | undefined => {
    const fromSession = session?.[key];
    if (fromSession != null && String(fromSession).trim()) return String(fromSession);
    const fromPersisted = persisted?.[key];
    if (fromPersisted != null && String(fromPersisted).trim()) return String(fromPersisted);
    return undefined;
  };

  return {
    recordId: session?.recordId ?? persisted?.recordId,
    fleetManagerNote: pick('fleetManagerNote'),
    combinedScore: pick('combinedScore'),
    riskLevel: pick('riskLevel'),
    flagType: pick('flagType'),
    decision: pick('decision'),
    validationStatus: pick('validationStatus'),
    summary: pick('summary'),
    vehicleReg: pick('vehicleReg'),
    declaredAmount: pick('declaredAmount'),
    latestRunStatus: session?.latestRunStatus ?? persisted?.latestRunStatus,
  };
}

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
