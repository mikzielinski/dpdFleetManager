import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import { resolveSchemaFieldName } from './entityFields';
import type { DpdRecord } from './record';

export type ComplianceStatus = 'ok' | 'due_soon' | 'expired' | 'unknown';

export type InsurancePolicyType = 'OC' | 'AC' | 'NNW' | 'Assistance' | 'Inne';

export interface InsurancePolicyInfo {
  type: InsurancePolicyType;
  validUntil: string | null;
  status: ComplianceStatus;
  label: string;
}

export interface VehicleCompliance {
  mileageKm: number | null;
  mileageSource: 'fabric' | 'missing';
  inspectionValidUntil: string | null;
  inspectionStatus: ComplianceStatus;
  policies: InsurancePolicyInfo[];
  complianceIssues: string[];
}

const MILEAGE_FIELDS = [
  'Mileage',
  'Odometer',
  'Przebieg',
  'CurrentMileage',
  'Kilometers',
  'LastOdometer',
] as const;

const INSPECTION_DATE_FIELDS = [
  'TechnicalInspectionValidUntil',
  'MOTValidUntil',
  'InspectionExpiry',
  'BadanieTechniczneDo',
  'InspectionValidUntil',
  'MOTExpiryDate',
] as const;

const INSURANCE_ROWS = [
  { type: 'OC' as const, fields: ['OCValidUntil', 'InsuranceOCUntil', 'PolisaOCdo', 'OC_Expiry'] },
  { type: 'AC' as const, fields: ['ACValidUntil', 'InsuranceACUntil', 'PolisaACdo', 'AC_Expiry'] },
  { type: 'NNW' as const, fields: ['NNWValidUntil', 'InsuranceNNWUntil'] },
  {
    type: 'Assistance' as const,
    fields: ['AssistanceValidUntil', 'InsuranceAssistanceUntil'],
  },
] as const;

function parseDateLoose(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') {
    const d = Date.parse(v);
    if (Number.isFinite(d)) return new Date(d).toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && v > 1_000_000_000_000) {
    return new Date(v).toISOString().slice(0, 10);
  }
  return null;
}

function parseMileage(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function complianceStatusForDate(isoDate: string | null, soonDays = 30): ComplianceStatus {
  if (!isoDate) return 'unknown';
  const end = Date.parse(isoDate);
  if (!Number.isFinite(end)) return 'unknown';
  const now = Date.now();
  const soon = soonDays * 86_400_000;
  if (end < now) return 'expired';
  if (end < now + soon) return 'due_soon';
  return 'ok';
}

/** Pola compliance wyłącznie z encji DPD_B2B_Vehicles (Data Fabric). */
export function extractVehicleCompliance(
  row: DpdRecord,
  _registration: string,
  entity?: EntityGetResponse | null,
): VehicleCompliance {
  const mileageField =
    resolveSchemaFieldName(entity ?? null, MILEAGE_FIELDS, /przebieg|mileage|odometer/i) ??
    'Mileage';
  let mileageKm = parseMileage(row[mileageField]);
  for (const f of MILEAGE_FIELDS) {
    if (mileageKm != null) break;
    mileageKm = parseMileage(row[f]);
  }

  const mileageSource: VehicleCompliance['mileageSource'] =
    mileageKm != null ? 'fabric' : 'missing';

  let inspectionValidUntil: string | null = null;
  const inspField =
    resolveSchemaFieldName(entity ?? null, INSPECTION_DATE_FIELDS, /badanie|inspection|mot/i) ??
    null;
  const inspKeys = inspField ? [inspField, ...INSPECTION_DATE_FIELDS] : [...INSPECTION_DATE_FIELDS];
  for (const k of inspKeys) {
    inspectionValidUntil = parseDateLoose(row[k]);
    if (inspectionValidUntil) break;
  }

  const policies: InsurancePolicyInfo[] = [];
  for (const spec of INSURANCE_ROWS) {
    let validUntil: string | null = null;
    for (const f of spec.fields) {
      validUntil = parseDateLoose(row[f]);
      if (validUntil) break;
    }
    const status = complianceStatusForDate(validUntil);
    policies.push({
      type: spec.type,
      validUntil,
      status,
      label: spec.type,
    });
  }

  const inspectionStatus = complianceStatusForDate(inspectionValidUntil);
  const complianceIssues: string[] = [];
  if (inspectionStatus === 'expired') complianceIssues.push('Przegląd techniczny po terminie');
  if (inspectionStatus === 'due_soon') complianceIssues.push('Przegląd techniczny wkrótce wygasa');
  for (const p of policies) {
    if (p.status === 'expired') complianceIssues.push(`Polisa ${p.type} po terminie`);
    if (p.status === 'due_soon') complianceIssues.push(`Polisa ${p.type} wkrótce wygasa`);
  }

  return {
    mileageKm,
    mileageSource,
    inspectionValidUntil,
    inspectionStatus,
    policies,
    complianceIssues,
  };
}

/** Zgodne z extractVehicleCompliance — bez warstwy demo. */
export function resolveVehicleCompliance(
  row: DpdRecord,
  registration: string,
  entity?: EntityGetResponse | null,
): VehicleCompliance {
  return extractVehicleCompliance(row, registration, entity);
}
