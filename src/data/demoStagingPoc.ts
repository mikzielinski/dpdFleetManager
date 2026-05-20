import type { DpdRecord } from '../utils/record';
import { normalizeRegistration } from '../utils/record';
import { getDemoCaseTag } from './demoFleetCases';
export interface PocBoostVehicle {
  registration: string;
}

/** Tylko lokalny dev — domyślnie wyłączone (staging używa Data Fabric). */
export const DEMO_POC_BOOST_ENABLED = import.meta.env.VITE_DEMO_POC_BOOST === 'true';

type PocTemplate = {
  serviceName: string;
  serviceType?: string;
  companyName: string;
  netPrice: number;
  decision: string;
  flagType?: string;
  fraudFlag?: string;
  fleetManagerNote?: string;
};

const VENDORS = {
  fuel: ['Circle K', 'Shell', 'Orlen', 'BP Express'],
  toll: ['Autopay', 'ViaTOLL', 'A1 Opłaty'],
  repair: ['Auto Serwis Wrocław', 'Moto-Fix', 'Quick Tire Service'],
  inspection: ['Stacja Kontroli Pojazdów', 'SKP Wrocław Południe'],
  wash: ['Myjnia Flota', 'Clean Truck'],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

function templatesForTag(tag: ReturnType<typeof getDemoCaseTag>): PocTemplate[] {
  switch (tag) {
    case 'fraud':
      return [
        {
          serviceName: 'Vehicle Repair',
          companyName: pick(VENDORS.repair, 1),
          netPrice: 4850,
          decision: 'Flagged',
          flagType: 'Kwota 4× powyżej mediany floty',
          fraudFlag: 'true',
          fleetManagerNote: 'Podejrzana faktura — duplikat NIP w 14 dni.',
        },
        {
          serviceName: 'Fuel Expense',
          companyName: pick(VENDORS.fuel, 0),
          netPrice: 420,
          decision: 'Oczekuje',
        },
        {
          serviceName: 'Toll Road Charge',
          companyName: pick(VENDORS.toll, 0),
          netPrice: 180,
          decision: 'Zatwierdzono',
        },
      ];
    case 'high_cost':
      return [
        {
          serviceName: 'Fuel Expense',
          companyName: pick(VENDORS.fuel, 2),
          netPrice: 890,
          decision: 'Oczekuje',
        },
        {
          serviceName: 'Toll Road Charge',
          companyName: pick(VENDORS.toll, 1),
          netPrice: 620,
          decision: 'Zatwierdzono',
        },
        {
          serviceName: 'Vehicle Repair',
          companyName: pick(VENDORS.repair, 0),
          netPrice: 2100,
          decision: 'Do weryfikacji',
          flagType: 'Koszt serwisu powyżej limitu',
        },
      ];
    case 'mot_expired':
    case 'insurance_expired':
    case 'mot_due_soon':
      return [
        {
          serviceName: 'Vehicle Inspection',
          companyName: pick(VENDORS.inspection, 0),
          netPrice: 189,
          decision: 'Zatwierdzono',
        },
        {
          serviceName: 'Fuel Expense',
          companyName: pick(VENDORS.fuel, 1),
          netPrice: 310,
          decision: 'Zatwierdzono',
        },
      ];
    default:
      return [
        {
          serviceName: 'Fuel Expense',
          companyName: pick(VENDORS.fuel, 0),
          netPrice: 245,
          decision: 'Zatwierdzono',
        },
        {
          serviceName: 'Car Wash',
          companyName: pick(VENDORS.wash, 0),
          netPrice: 55,
          decision: 'Zatwierdzono',
        },
      ];
  }
}

function existingCountForPlate(allPoc: DpdRecord[], plate: string): number {
  const key = normalizeRegistration(plate);
  return allPoc.filter((r) => {
    const reg = String(r.CarRegistration ?? r.carRegistration ?? '');
    return normalizeRegistration(reg) === key;
  }).length;
}

/**
 * Dodatkowe rozliczenia POC dla pojazdów bez kosztów (lub mało) — pełne demo statystyk.
 * Nie zastępuje rekordów z Data Fabric.
 */
export function generateStagingDemoPocRecords(
  vehicles: PocBoostVehicle[],
  existingPoc: DpdRecord[],
): DpdRecord[] {
  const out: DpdRecord[] = [];
  let seq = 9000;

  for (const v of vehicles) {
    const plate = v.registration;
    if (!plate) continue;
    const have = existingCountForPlate(existingPoc, plate);
    const tag = getDemoCaseTag(plate);
    const templates = templatesForTag(tag);
    const want = have === 0 ? templates.length : have < 2 ? Math.min(2, templates.length) : 0;

    for (let i = 0; i < want; i++) {
      const t = templates[i]!;
      seq += 1;
      const daysAgo = (seq % 75) + i * 3 + (plate.length % 20);
      const serviceDate = new Date();
      serviceDate.setDate(serviceDate.getDate() - daysAgo);
      const dateIso = serviceDate.toISOString().slice(0, 10);
      out.push({
        Id: `demo-boost-${seq}`,
        CarRegistration: plate,
        Date: dateIso,
        ServiceDate: dateIso,
        ServiceName: t.serviceName,
        ServiceType: t.serviceType ?? t.serviceName,
        CompanyName: t.companyName,
        TaxID: `899${String(seq).padStart(7, '0')}`.slice(0, 10),
        NetPrice: t.netPrice,
        Amount: 1,
        Status: t.decision,
        decision: t.decision,
        FlagType: t.flagType ?? '',
        FraudFlag: t.fraudFlag ?? '',
        FleetManagerNote: t.fleetManagerNote ?? '',
      });
    }
  }

  return out;
}

/** Dołącza syntetyczne POC do listy kosztów (statystyki, health score, filtry). */
export function appendDemoPocBoost(
  vehicles: PocBoostVehicle[],
  pocItems: DpdRecord[],
): DpdRecord[] {
  if (!DEMO_POC_BOOST_ENABLED || !vehicles.length) return pocItems;
  const extra = generateStagingDemoPocRecords(vehicles, pocItems);
  return extra.length ? [...pocItems, ...extra] : pocItems;
}

/** Dołącza syntetyczne POC tylko gdy VITE_DEMO_POC_BOOST=true. */
export function applyPocDatasetPolicy(
  vehicles: PocBoostVehicle[],
  pocItems: DpdRecord[],
): DpdRecord[] {
  return appendDemoPocBoost(vehicles, pocItems);
}
