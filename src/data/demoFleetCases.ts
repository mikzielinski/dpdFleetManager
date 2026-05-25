import type { VehicleCompliance, InsurancePolicyInfo } from '../utils/vehicleCompliance';
import { complianceStatusForDate } from '../utils/vehicleCompliance';
import { normalizeRegistration } from '../utils/record';
import { pickSyntheticPartner } from './syntheticB2BVendors';

/** Tylko lokalny dev — domyślnie wyłączone (staging używa Data Fabric). */
export const DEMO_FLEET_CASES_ENABLED = import.meta.env.VITE_DEMO_FLEET_CASES === 'true';

export type DemoCaseTag =
  | 'ok'
  | 'high_cost'
  | 'fraud'
  | 'mot_expired'
  | 'insurance_expired'
  | 'mot_due_soon';

export interface DemoFleetCase {
  tag: DemoCaseTag;
  mileageKm: number;
  inspectionValidUntil: string;
  policies: { type: InsurancePolicyInfo['type']; validUntil: string }[];
  description: string;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildPolicies(
  specs: { type: InsurancePolicyInfo['type']; validUntil: string }[],
): InsurancePolicyInfo[] {
  return specs.map((s) => ({
    type: s.type,
    validUntil: s.validUntil,
    status: complianceStatusForDate(s.validUntil),
    label: s.type,
  }));
}

function finalizeCase(spec: DemoFleetCase): VehicleCompliance {
  const policies = buildPolicies(spec.policies);
  const inspectionStatus = complianceStatusForDate(spec.inspectionValidUntil);
  const complianceIssues: string[] = [];
  if (inspectionStatus === 'expired') complianceIssues.push('Przegląd techniczny po terminie');
  if (inspectionStatus === 'due_soon') complianceIssues.push('Przegląd techniczny wkrótce wygasa');
  for (const p of policies) {
    if (p.status === 'expired') complianceIssues.push(`Polisa ${p.type} po terminie`);
    if (p.status === 'due_soon') complianceIssues.push(`Polisa ${p.type} wkrótce wygasa`);
  }
  return {
    mileageKm: spec.mileageKm,
    mileageSource: 'fabric',
    inspectionValidUntil: spec.inspectionValidUntil,
    inspectionStatus,
    policies,
    complianceIssues,
  };
}

/** Scenariusze demo przypisane do konkretnych tablic (Wrocław / Dolnośląskie). */
const EXPLICIT_CASES: Record<string, DemoFleetCase> = {
  WR145DPD: {
    tag: 'fraud',
    mileageKm: 187_420,
    inspectionValidUntil: addDays(45),
    policies: [
      { type: 'OC', validUntil: addDays(200) },
      { type: 'AC', validUntil: addDays(180) },
      { type: 'NNW', validUntil: addDays(300) },
      { type: 'Assistance', validUntil: addDays(120) },
    ],
    description: 'Wysokie koszty POC + oznaczenie fraud — test health score',
  },
  WR136DPD: {
    tag: 'ok',
    mileageKm: 92_100,
    inspectionValidUntil: addDays(220),
    policies: [
      { type: 'OC', validUntil: addDays(400) },
      { type: 'AC', validUntil: addDays(350) },
      { type: 'NNW', validUntil: addDays(400) },
      { type: 'Assistance', validUntil: addDays(200) },
    ],
    description: 'Profil OK',
  },
  WR117DPD: {
    tag: 'high_cost',
    mileageKm: 156_800,
    inspectionValidUntil: addDays(90),
    policies: [
      { type: 'OC', validUntil: addDays(250) },
      { type: 'AC', validUntil: addDays(100) },
      { type: 'NNW', validUntil: addDays(250) },
      { type: 'Assistance', validUntil: addDays(80) },
    ],
    description: 'Podwyższone koszty serwisowe',
  },
  DW7855U: {
    tag: 'mot_expired',
    mileageKm: 241_300,
    inspectionValidUntil: addDays(-45),
    policies: [
      { type: 'OC', validUntil: addDays(60) },
      { type: 'AC', validUntil: addDays(-10) },
      { type: 'NNW', validUntil: addDays(90) },
      { type: 'Assistance', validUntil: addDays(30) },
    ],
    description: 'Przegląd techniczny po terminie',
  },
  DW2048O: {
    tag: 'insurance_expired',
    mileageKm: 78_500,
    inspectionValidUntil: addDays(120),
    policies: [
      { type: 'OC', validUntil: addDays(-20) },
      { type: 'AC', validUntil: addDays(-5) },
      { type: 'NNW', validUntil: addDays(40) },
      { type: 'Assistance', validUntil: addDays(15) },
    ],
    description: 'Polisa OC/AC wygasła',
  },
  DW2905K: {
    tag: 'mot_due_soon',
    mileageKm: 134_200,
    inspectionValidUntil: addDays(18),
    policies: [
      { type: 'OC', validUntil: addDays(300) },
      { type: 'AC', validUntil: addDays(280) },
      { type: 'NNW', validUntil: addDays(300) },
      { type: 'Assistance', validUntil: addDays(200) },
    ],
    description: 'Badanie techniczne wygasa w 18 dni',
  },
  DW2463W: {
    tag: 'ok',
    mileageKm: 61_400,
    inspectionValidUntil: addDays(310),
    policies: [
      { type: 'OC', validUntil: addDays(500) },
      { type: 'AC', validUntil: addDays(450) },
      { type: 'NNW', validUntil: addDays(500) },
      { type: 'Assistance', validUntil: addDays(400) },
    ],
    description: 'Profil OK — niski przebieg',
  },
  DW2872M: {
    tag: 'high_cost',
    mileageKm: 198_900,
    inspectionValidUntil: addDays(75),
    policies: [
      { type: 'OC', validUntil: addDays(180) },
      { type: 'AC', validUntil: addDays(160) },
      { type: 'NNW', validUntil: addDays(180) },
      { type: 'Assistance', validUntil: addDays(90) },
    ],
    description: 'Koszty opłat drogowych i paliwa',
  },
};

function hashPlate(plate: string): number {
  const s = normalizeRegistration(plate);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function generatedCase(registration: string): DemoFleetCase {
  const h = hashPlate(registration);
  const partner = pickSyntheticPartner(registration);
  const baseMileage = 55_000 + (h % 190_000);
  const variant = h % 5;
  if (variant === 0) {
    return {
      tag: 'ok',
      mileageKm: baseMileage,
      inspectionValidUntil: addDays(200 + (h % 120)),
      policies: [
        { type: 'OC', validUntil: addDays(400) },
        { type: 'AC', validUntil: addDays(350) },
        { type: 'NNW', validUntil: addDays(400) },
        { type: 'Assistance', validUntil: addDays(250) },
      ],
      description: `Standard flota B2B — ${partner.company}`,
    };
  }
  if (variant === 1) {
    return {
      tag: 'mot_due_soon',
      mileageKm: baseMileage,
      inspectionValidUntil: addDays(12 + (h % 15)),
      policies: [
        { type: 'OC', validUntil: addDays(280) },
        { type: 'AC', validUntil: addDays(260) },
        { type: 'NNW', validUntil: addDays(280) },
        { type: 'Assistance', validUntil: addDays(100) },
      ],
      description: `Zbliżający się przegląd — ${partner.area}`,
    };
  }
  if (variant === 2) {
    return {
      tag: 'high_cost',
      mileageKm: baseMileage + 20_000,
      inspectionValidUntil: addDays(90),
      policies: [
        { type: 'OC', validUntil: addDays(200) },
        { type: 'AC', validUntil: addDays(150) },
        { type: 'NNW', validUntil: addDays(200) },
        { type: 'Assistance', validUntil: addDays(60) },
      ],
      description: 'Średnio-wysokie koszty eksploatacji',
    };
  }
  if (variant === 3) {
    return {
      tag: 'insurance_expired',
      mileageKm: baseMileage,
      inspectionValidUntil: addDays(160),
      policies: [
        { type: 'OC', validUntil: addDays(-15 - (h % 30)) },
        { type: 'AC', validUntil: addDays(-5) },
        { type: 'NNW', validUntil: addDays(40) },
        { type: 'Assistance', validUntil: addDays(20) },
      ],
      description: 'Wygasłe ubezpieczenie OC',
    };
  }
  return {
    tag: 'mot_expired',
    mileageKm: baseMileage,
    inspectionValidUntil: addDays(-30 - (h % 60)),
    policies: [
      { type: 'OC', validUntil: addDays(120) },
      { type: 'AC', validUntil: addDays(80) },
      { type: 'NNW', validUntil: addDays(120) },
      { type: 'Assistance', validUntil: addDays(40) },
    ],
    description: 'Po terminie badania technicznego',
  };
}

export function getDemoFleetCompliance(registration: string): VehicleCompliance {
  const key = normalizeRegistration(registration);
  const spec = EXPLICIT_CASES[key] ?? generatedCase(registration);
  return finalizeCase(spec);
}

export function getDemoCaseTag(registration: string): DemoCaseTag {
  const key = normalizeRegistration(registration);
  return (EXPLICIT_CASES[key] ?? generatedCase(registration)).tag;
}

/** Pola do wstrzyknięcia w rekord B2B (gdy Data Fabric nie ma kolumn). */
export function demoFieldsForB2BRecord(compliance: VehicleCompliance): Record<string, unknown> {
  const oc = compliance.policies.find((p) => p.type === 'OC');
  const ac = compliance.policies.find((p) => p.type === 'AC');
  const nnw = compliance.policies.find((p) => p.type === 'NNW');
  const ast = compliance.policies.find((p) => p.type === 'Assistance');
  return {
    Mileage: compliance.mileageKm,
    Przebieg: compliance.mileageKm,
    TechnicalInspectionValidUntil: compliance.inspectionValidUntil,
    BadanieTechniczneDo: compliance.inspectionValidUntil,
    OCValidUntil: oc?.validUntil,
    ACValidUntil: ac?.validUntil,
    NNWValidUntil: nnw?.validUntil,
    AssistanceValidUntil: ast?.validUntil,
  };
}
