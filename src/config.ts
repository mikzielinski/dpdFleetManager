/** Data Fabric entity DPD_POC / DPD_FEE (staging) — NOT a field GUID */
export const DPD_POC_ENTITY_ID = '4e2e38d9-bf4a-f111-8ef3-000d3a261acd';

/** Data Fabric entity DPD_VehicleFlags — linked by registration / Vehicle ID */
export const DPD_VEHICLE_FLAGS_ENTITY_ID = '8d83c3fe-c34a-f111-8ef3-000d3a261acd';

/**
 * Data Fabric entity names (resolved to UUID at runtime via entities.getAll()).
 * Display names from portal may differ from API `name`.
 */
export const DATA_FABRIC_ENTITY_LOOKUP = {
  b2bVehicles: ['DPDB2BVehicles', 'DPD_B2B_Vehicles'],
  areasWroclaw: ['DPDAreasWroclaw', 'DPD_Areas_Wroclaw'],
  b2bCourierCompanies: ['DPDB2BCourierCompanies', 'DPD_B2B_Courier_Companies'],
} as const;

/** Orchestrator release name (folder Shared/DPDDataInvestigator) */
export const ORCHESTRATOR_RELEASE_NAME = 'DPDDataInvestigator.agentic.Agentic.Process';

/** Maestro deployment / process lookup (fallback) */
export const MAESTRO_PROCESS_CANDIDATES = [
  ORCHESTRATOR_RELEASE_NAME,
  'DPDDataInvestigator',
  'Agentic Process',
  'Agentic.Process',
];

export const MAESTRO_FOLDER_PATH = 'Shared/DPDDataInvestigator';

/** Start event input for Agentic Process BPMN */
export const MAESTRO_INPUT_RECORD_ARG = 'InRecord_Id';

export const PAGE_SIZE = 25;

export interface TableColumn {
  /** UI / alias key (e.g. decision for Status) */
  key: string;
  label: string;
  /** Data Fabric field name on the API record (e.g. Status, CarRegistration) */
  fieldName: string;
}

/** Table columns (fallback if schema load fails) */
export const TABLE_COLUMNS: TableColumn[] = [
  { key: 'carRegistration', fieldName: 'CarRegistration', label: 'Pojazd' },
  { key: 'serviceName', fieldName: 'ServiceName', label: 'Usługa' },
  { key: 'companyName', fieldName: 'CompanyName', label: 'Firma' },
  { key: 'taxId', fieldName: 'TaxID', label: 'NIP' },
  { key: 'netPrice', fieldName: 'NetPrice', label: 'Netto' },
  { key: 'grossPrice', fieldName: 'GrossPrice', label: 'Brutto' },
  { key: 'amount', fieldName: 'Amount', label: 'Ilość' },
  { key: 'decision', fieldName: 'Status', label: 'Decyzja' },
];

/** Polish labels for known Data Fabric field names (override schema displayName). */
export const TABLE_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  Amount: 'Ilość',
  NetPrice: 'Netto',
  GrossPrice: 'Brutto',
  TotalPrice: 'Razem',
  Total: 'Razem',
  Status: 'Decyzja',
  CarRegistration: 'Pojazd',
  ServiceName: 'Usługa',
  CompanyName: 'Firma',
  TaxID: 'NIP',
};

/** Panel „Szczegóły zgłoszenia” — etykiety pól */
export const DETAIL_FIELD_LABELS: Record<string, string> = {
  carRegistration: 'Rejestracja',
  serviceName: 'Usługa',
  serviceDescription: 'Opis usługi',
  companyName: 'Firma',
  taxId: 'NIP',
  amount: 'Ilość',
  netPrice: 'Netto',
  grossPrice: 'Brutto',
  totalPrice: 'Razem',
  date: 'Data',
  invoiceFileName: 'Plik faktury',
  decision: 'Decyzja',
  anomalyReason: 'Anomalia',
  comments: 'Komentarz',
  riskLevel: 'Ryzyko',
  combinedScore: 'Wynik',
  flagType: 'Typ flagi',
  fleetManagerNote: 'Notatka managera',
};

/** Pola z długim tekstem — pod siatką, pełna szerokość (nie w kolumnach). */
export const DETAIL_FULL_WIDTH_FIELDS = ['comments', 'fleetManagerNote'] as const;

/** Ukryj w szczegółach, gdy wartość to „—”. */
export const DETAIL_OPTIONAL_FIELDS = [
  'decision',
  'anomalyReason',
  'comments',
  'riskLevel',
  'combinedScore',
  'flagType',
  'fleetManagerNote',
] as const;

export const DETAIL_FIELD_KEYS = [
  'carRegistration',
  'serviceName',
  'serviceDescription',
  'companyName',
  'taxId',
  'amount',
  'netPrice',
  'grossPrice',
  'totalPrice',
  'date',
  'invoiceFileName',
  ...DETAIL_OPTIONAL_FIELDS,
] as const;

/** Preferred Data Fabric fields for the grid (PascalCase names from entity schema) */
export const TABLE_FIELD_PREFERENCES = [
  'CarRegistration',
  'ServiceName',
  'CompanyName',
  'TaxID',
  'NetPrice',
  'GrossPrice',
  'TotalPrice',
  'Total',
  'Amount',
  'Status',
];

export const INVOICE_FILE_FIELD_CANDIDATES = [
  'Invoice File',
  'InvoiceFile',
  'Invoice',
  'invoice',
  'invoiceFile',
  'InvoiceRecipt',
  'InvoiceReceipt',
  'Attachment',
  'attachment',
];
