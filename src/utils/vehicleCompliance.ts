import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import { resolveSchemaFieldName } from './entityFields';
import type { DpdRecord } from './record';
import { normalizeRegistration } from './record';

/** Uzupełnij compliance gdy Fabric nie ma pól (staging). Wyłącz: VITE_STAGING_COMPLIANCE_ENRICH=false */
export const STAGING_COMPLIANCE_ENRICH_ENABLED =
  import.meta.env.VITE_STAGING_COMPLIANCE_ENRICH !== 'false';

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
  mileageSource: 'fabric' | 'estimated' | 'missing';
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

function stableDaysFromSeed(seed: string, minDays: number, maxDays: number): number {
  const s = normalizeRegistration(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return minDays + (h % (maxDays - minDays + 1));
}

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dane z encji B2B lub estymata deterministyczna (staging bez pól compliance). */
export function extractVehicleCompliance(
  row: DpdRecord,
  registration: string,
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

  let mileageSource: VehicleCompliance['mileageSource'] = mileageKm != null ? 'fabric' : 'missing';
  if (mileageKm == null && registration) {
    mileageKm = 40_000 + stableDaysFromSeed(registration, 0, 180_000);
    mileageSource = 'estimated';
  }

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
    if (!validUntil && mileageSource === 'estimated') {
      const offset = spec.type === 'OC' ? 120 : spec.type === 'AC' ? 200 : 90;
      validUntil = addDaysIso(new Date(), stableDaysFromSeed(registration + spec.type, -30, offset));
    }
    const status = complianceStatusForDate(validUntil);
    policies.push({
      type: spec.type,
      validUntil,
      status,
      label: spec.type,
    });
  }

  if (!inspectionValidUntil && mileageSource === 'estimated') {
    inspectionValidUntil = addDaysIso(
      new Date(),
      stableDaysFromSeed(registration + 'insp', -60, 365),
    );
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
