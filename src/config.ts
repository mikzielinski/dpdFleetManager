/** Data Fabric entity DPD_POC / DPD_FEE (staging) — NOT a field GUID */
export const DPD_POC_ENTITY_ID = '4e2e38d9-bf4a-f111-8ef3-000d3a261acd';

/** Data Fabric entity DPD_VehicleFlags — linked by registration / Vehicle ID */
export const DPD_VEHICLE_FLAGS_ENTITY_ID = '8d83c3fe-c34a-f111-8ef3-000d3a261acd';

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
  { key: 'companyName', fieldName: 'CompanyName', label: 'Nazwa firmy' },
  { key: 'taxId', fieldName: 'TaxID', label: 'NIP' },
  { key: 'netPrice', fieldName: 'NetPrice', label: 'Kwota' },
  { key: 'decision', fieldName: 'Status', label: 'Decyzja' },
];

/** Preferred Data Fabric fields for the grid (PascalCase names from entity schema) */
export const TABLE_FIELD_PREFERENCES = [
  'CarRegistration',
  'ServiceName',
  'CompanyName',
  'TaxID',
  'NetPrice',
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
