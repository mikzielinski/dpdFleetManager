import type { AnalysisVariables } from '../services/maestro';
import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import {
  normalizeDpdRecord,
  pickField,
  pickVehicleFlagField,
  type DpdRecord,
} from './record';

function hasText(v: string): boolean {
  return v !== '—' && v.trim().length > 0;
}

/** Buduje wynik analizy z pól DPD_POC / DPD_VehicleFlags (bez uruchamiania Maestro). */
export function analysisFromRecord(
  record: DpdRecord,
  vehicleFlag?: VehicleFlagHistoryItem | null,
): AnalysisVariables | null {
  let fleetManagerNote = pickField(record, 'fleetManagerNote', 'FleetManagerNote');
  let combinedScore = pickField(record, 'combinedScore', 'CombinedScore');
  let riskLevel = pickField(record, 'riskLevel', 'RiskLevel');
  let flagType = pickField(record, 'flagType', 'FlagType');

  const decision = pickField(record, 'decision', 'Status');
  const net = pickField(record, 'netPrice', 'NetPrice');
  const total = pickField(record, 'totalPrice', 'TotalPrice');
  const amount = hasText(net) ? net : total;
  const vehicle = pickField(record, 'carRegistration', 'CarRegistration');
  const anomaly = pickField(record, 'anomalyReason', 'AnomalyReason');
  const comments = pickField(record, 'comments', 'Comments');

  if (vehicleFlag?.raw) {
    const flagRaw = normalizeDpdRecord(vehicleFlag.raw);
    if (!hasText(combinedScore)) {
      const s = pickVehicleFlagField(flagRaw, 'aiConfidenceScore');
      if (hasText(s)) combinedScore = s;
    }
    if (!hasText(flagType)) {
      const f = pickVehicleFlagField(flagRaw, 'flagType');
      if (hasText(f)) flagType = f;
    }
    if (!hasText(fleetManagerNote)) {
      const d = pickVehicleFlagField(flagRaw, 'description');
      if (hasText(d)) fleetManagerNote = d;
    }
    if (!hasText(riskLevel)) {
      const r = pickVehicleFlagField(flagRaw, 'riskLevel');
      if (hasText(r)) riskLevel = r;
    }
  }

  if (
    !hasText(fleetManagerNote) &&
    !hasText(combinedScore) &&
    !hasText(riskLevel) &&
    !hasText(flagType)
  ) {
    return null;
  }

  const service = pickField(record, 'serviceName', 'ServiceName');

  return {
    recordId: String(record.Id ?? record.id ?? ''),
    fleetManagerNote: hasText(fleetManagerNote) ? fleetManagerNote : undefined,
    combinedScore: hasText(combinedScore) ? combinedScore : undefined,
    riskLevel: hasText(riskLevel) ? riskLevel : undefined,
    flagType: hasText(flagType) ? flagType : undefined,
    decision: hasText(decision) ? decision : undefined,
    vehicleReg: hasText(vehicle) ? vehicle : undefined,
    declaredAmount: hasText(amount) ? `${amount} PLN` : undefined,
    validationStatus: hasText(anomaly) ? anomaly : hasText(comments) ? comments : undefined,
    summary: hasText(service) ? service : undefined,
  };
}
