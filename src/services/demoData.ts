import type { EntityGetResponse } from '@uipath/uipath-typescript/entities';
import type { PaginationCursor } from '@uipath/uipath-typescript/core';
import { DPD_POC_ENTITY_ID, TABLE_COLUMNS } from '../config';
import { appendDemoPocBoost, type PocBoostVehicle } from '../data/demoStagingPoc';
import type { DpdRecord } from '../utils/record';
import { pickField } from '../utils/record';
export const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === 'true';

/** Pojazdy zgodne z mockVehicleCatalog — do boost POC w trybie BYPASS. */
const BYPASS_DEMO_VEHICLES: PocBoostVehicle[] = [
  { registration: 'WR145DPD' },
  { registration: 'WR136DPD' },
  { registration: 'DW7855U' },
  { registration: 'DW2048O' },
  { registration: 'DW2905K' },
  { registration: 'WR117DPD' },
];

export interface DemoAnalysisVariables {
  recordId?: string;
  fleetManagerNote?: string;
  combinedScore?: string;
  riskLevel?: string;
  decision?: string;
  flagType?: string;
  vehicleReg?: string;
  declaredAmount?: string;
  validationStatus?: string;
  summary?: string;
  latestRunStatus?: string;
  runStatus?: string;
}

/** Minimal valid PDF for invoice preview when using in-memory data. */
export const DEMO_INVOICE_PDF = new Blob(
  [
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF',
  ],
  { type: 'application/pdf' },
);

const MOCK_RECORDS: DpdRecord[] = [
  {
    Id: 'demo-001',
    carRegistration: 'WA 12345',
    serviceName: 'Myjnia samochodowa',
    serviceDescription: 'Mycie pełne + wosk',
    companyName: 'Auto Spa Warszawa',
    taxId: '5251234567',
    netPrice: 89.5,
    amount: 1,
    decision: 'Oczekuje',
    riskLevel: 'low',
    combinedScore: '12',
    flagType: '',
    fleetManagerNote: '',
    invoiceFileName: 'faktura_WA12345.pdf',
    Invoice: { name: 'faktura_WA12345.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-002',
    carRegistration: 'KR 98765',
    serviceName: 'Paliwo ON',
    serviceDescription: 'Tankowanie 45 L',
    companyName: 'Orlen Stacja 412',
    taxId: '7740001456',
    netPrice: 312.4,
    amount: 45,
    decision: 'Zatwierdzono',
    riskLevel: 'low',
    combinedScore: '8',
    invoiceFileName: 'paragon_KR98765.pdf',
    Invoice: { name: 'paragon_KR98765.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-003',
    carRegistration: 'GD 55421',
    serviceName: 'Wymiana opon',
    serviceDescription: '4× opony zimowe + wyważenie',
    companyName: 'Opony Express Gdańsk',
    taxId: '5832011122',
    netPrice: 1840.0,
    amount: 4,
    decision: 'Do weryfikacji',
    riskLevel: 'medium',
    combinedScore: '54',
    flagType: 'Kwota powyżej średniej dla floty',
    fleetManagerNote: 'Kwota netto znacząco wyższa od mediany dla pojazdu dostawczego.',
    invoiceFileName: 'faktura_GD55421.pdf',
    Invoice: { name: 'faktura_GD55421.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-004',
    carRegistration: 'PO 77881',
    serviceName: 'Przegląd techniczny',
    serviceDescription: 'Przegląd okresowy + diagnostyka',
    companyName: 'Serwis DPD Poznań',
    taxId: '7773012345',
    netPrice: 420.0,
    amount: 1,
    decision: 'Oczekuje',
    riskLevel: 'low',
    combinedScore: '15',
    invoiceFileName: 'faktura_PO77881.pdf',
  },
  {
    Id: 'demo-005',
    carRegistration: 'WAW 12A34',
    serviceName: 'Naprawa zawieszenia',
    serviceDescription: 'Wymiana amortyzatorów przód',
    companyName: 'Auto-Mix Piaseczno',
    taxId: '5219876543',
    netPrice: 2150.75,
    amount: 2,
    decision: 'Odrzucono',
    riskLevel: 'high',
    combinedScore: '78',
    flagType: 'Duplikat faktury / podejrzany NIP',
    fleetManagerNote:
      'Wykryto podobną fakturę z tego samego NIP w ciągu 14 dni. Zalecana weryfikacja HITL.',
    invoiceFileName: 'faktura_WAW12A34.pdf',
    Invoice: { name: 'faktura_WAW12A34.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-006',
    carRegistration: 'LU 44556',
    serviceName: 'Ubezpieczenie OC/AC',
    serviceDescription: 'Składka kwartalna',
    companyName: 'PZU Flota',
    taxId: '5260250995',
    netPrice: 890.0,
    amount: 1,
    decision: 'Zatwierdzono',
    riskLevel: 'low',
    combinedScore: '5',
    invoiceFileName: 'polisa_LU44556.pdf',
  },
  {
    Id: 'demo-007',
    carRegistration: 'SZ 33210',
    serviceName: 'Myjnia',
    serviceDescription: 'Mycie podwozia',
    companyName: 'Clean Truck Szczecin',
    taxId: '8512345678',
    netPrice: 65.0,
    amount: 1,
    decision: 'Oczekuje',
    riskLevel: 'low',
    combinedScore: '10',
    invoiceFileName: 'faktura_SZ33210.pdf',
    Invoice: { name: 'faktura_SZ33210.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-008',
    carRegistration: 'KT 90123',
    serviceName: 'Olej silnikowy',
    serviceDescription: 'Wymiana oleju + filtr',
    companyName: 'Quick Lube Kato',
    taxId: '6345678901',
    netPrice: 245.99,
    amount: 1,
    decision: 'Do weryfikacji',
    riskLevel: 'medium',
    combinedScore: '42',
    flagType: 'Niezgodność VIN na fakturze',
    fleetManagerNote: 'Numer rejestracyjny na fakturze różni się o jedną cyfrę.',
    invoiceFileName: 'faktura_KT90123.pdf',
    Invoice: { name: 'faktura_KT90123.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-009',
    carRegistration: 'BI 66778',
    serviceName: 'Parking nocny',
    serviceDescription: 'Postój hub Białystok',
    companyName: 'DPD Hub Parking',
    taxId: '5421234567',
    netPrice: 28.0,
    amount: 2,
    decision: 'Zatwierdzono',
    riskLevel: 'low',
    combinedScore: '6',
  },
  {
    Id: 'demo-wr145-fraud',
    CarRegistration: 'WR145DPD',
    ServiceName: 'Vehicle Repair',
    ServiceType: 'Vehicle Repair',
    CompanyName: 'Auto Serwis Wrocław',
    TaxID: '8990001451',
    NetPrice: 4850,
    Amount: 1,
    Status: 'Flagged',
    decision: 'Flagged',
    FlagType: 'Kwota 4× powyżej mediany floty',
    FraudFlag: 'true',
    fleetManagerNote: 'Podejrzana faktura — duplikat NIP w 14 dni.',
  },
  {
    Id: 'demo-dw7855-mot',
    CarRegistration: 'DW7855U',
    ServiceName: 'Vehicle Inspection',
    CompanyName: 'SKP Wrocław Południe',
    NetPrice: 189,
    decision: 'Zatwierdzono',
  },
  {
    Id: 'demo-dw2048-ins',
    CarRegistration: 'DW2048O',
    ServiceName: 'Fuel Expense',
    CompanyName: 'Circle K',
    NetPrice: 310,
    decision: 'Oczekuje',
  },
  {
    Id: 'demo-010',
    carRegistration: 'WR 11223',
    serviceName: 'AdBlue',
    serviceDescription: 'Uzupełnienie 15 L',
    companyName: 'Shell Wrocław',
    taxId: '5261000001',
    netPrice: 156.3,
    amount: 15,
    decision: 'Oczekuje',
    riskLevel: 'low',
    combinedScore: '11',
    invoiceFileName: 'paragon_WR11223.pdf',
    Invoice: { name: 'paragon_WR11223.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-011',
    carRegistration: 'LD 88990',
    serviceName: 'Naprawa klimatyzacji',
    serviceDescription: 'Nabicie czynnika + uszczelnienie',
    companyName: 'Klima Serwis Łódź',
    taxId: '7251234567',
    netPrice: 680.0,
    amount: 1,
    decision: 'Oczekuje',
    riskLevel: 'medium',
    combinedScore: '38',
    invoiceFileName: 'faktura_LD88990.pdf',
    Invoice: { name: 'faktura_LD88990.pdf', contentType: 'application/pdf' },
  },
  {
    Id: 'demo-012',
    carRegistration: 'RZ 44551',
    serviceName: 'Holowanie',
    serviceDescription: 'Laweta po awarii',
    companyName: 'Pomoc Drogowa Rzeszów',
    taxId: '8134567890',
    netPrice: 450.0,
    amount: 1,
    decision: 'Do weryfikacji',
    riskLevel: 'high',
    combinedScore: '71',
    flagType: 'Usługa awaryjna bez zgłoszenia wcześniejszego',
    fleetManagerNote: 'Brak wpisu w systemie zgłoszeń awarii przed datą faktury.',
    invoiceFileName: 'faktura_RZ44551.pdf',
    Invoice: { name: 'faktura_RZ44551.pdf', contentType: 'application/pdf' },
  },
];

function withSpreadDates(records: DpdRecord[]): DpdRecord[] {
  const now = Date.now();
  return records.map((r, i) => {
    if (pickField(r, 'date') !== '—') return r;
    const d = new Date(now - (i + 1) * 86_400_000 * 3);
    const iso = d.toISOString().slice(0, 10);
    return { ...r, Date: iso, ServiceDate: iso, date: iso };
  });
}

export function getAllMockRecords(): DpdRecord[] {
  const base = withSpreadDates(MOCK_RECORDS.map((r) => ({ ...r })));
  return appendDemoPocBoost(BYPASS_DEMO_VEHICLES, base);
}

export function getMockRecordById(id: string): DpdRecord | undefined {
  const rec = MOCK_RECORDS.find((r) => String(r.Id ?? r.id) === id);
  return rec ? { ...rec } : undefined;
}

export function parseDemoCursor(cursor?: PaginationCursor): number {
  if (!cursor) return 0;
  const s = String(cursor);
  const m = /^demo:(\d+)$/.exec(s);
  return m ? Number.parseInt(m[1], 10) : 0;
}

export function demoCursorOffset(offset: number): PaginationCursor {
  return `demo:${offset}` as unknown as PaginationCursor;
}

export function sliceMockRecords(
  offset: number,
  pageSize: number,
): { items: DpdRecord[]; nextCursor?: PaginationCursor; hasNext: boolean } {
  const all = getAllMockRecords();
  const items = all.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  const hasNext = nextOffset < all.length;
  return {
    items,
    nextCursor: hasNext ? demoCursorOffset(nextOffset) : undefined,
    hasNext,
  };
}

export const DEMO_MAESTRO_TARGET = {
  processKey: 'demo-dpd-investigator',
  folderKey: 'demo-folder-key',
  folderId: 1,
  name: 'DPDDataInvestigator',
} as const;

export function mockEntityContext(): {
  entity: EntityGetResponse;
  fileFields: string[];
  choiceMaps: Map<string, Map<number, string>>;
  tableColumns: typeof TABLE_COLUMNS;
} {
  return {
    entity: {
      id: DPD_POC_ENTITY_ID,
      displayName: 'DPD_POC',
      fields: [
        { name: 'CarRegistration', displayName: 'Pojazd' },
        { name: 'ServiceName', displayName: 'Usługa' },
        { name: 'NetPrice', displayName: 'Kwota netto' },
        { name: 'Amount', displayName: 'Ilość' },
        { name: 'Status', displayName: 'Decyzja' },
        { name: 'ServiceType', displayName: 'Typ usługi' },
        { name: 'Invoice', fieldDisplayType: 'File', displayName: 'Faktura' },
      ],
    } as EntityGetResponse,
    fileFields: ['Invoice'],
    choiceMaps: new Map(),
    tableColumns: [...TABLE_COLUMNS],
  };
}

export function analysisVariablesForRecord(
  recordId: string,
  complete: boolean,
): DemoAnalysisVariables {
  const rec = getMockRecordById(recordId);
  if (!complete) {
    return {
      recordId,
      latestRunStatus: 'Running',
      runStatus: 'Running',
    };
  }

  const risk = String(rec?.riskLevel ?? 'low');
  const note =
    String(rec?.fleetManagerNote ?? '') ||
    (risk === 'high'
      ? 'Wykryto podwyższone ryzyko — zalecana weryfikacja managera floty.'
      : risk === 'medium'
        ? 'Drobne niezgodności na fakturze — sprawdź szczegóły.'
        : 'Koszt w normie dla tego typu usługi.');

  return {
    recordId,
    fleetManagerNote: note,
    combinedScore: String(rec?.combinedScore ?? '20'),
    riskLevel: risk,
    decision: String(rec?.decision ?? 'Oczekuje'),
    flagType: String(rec?.flagType ?? ''),
    vehicleReg: String(rec?.carRegistration ?? ''),
    declaredAmount: rec?.netPrice != null ? `${rec.netPrice} PLN` : undefined,
    validationStatus: risk === 'high' ? 'Wymaga weryfikacji' : 'Zgodna',
    summary: rec?.serviceName ?? 'Usługa',
    latestRunStatus: 'Completed',
    runStatus: 'Completed',
  };
}
