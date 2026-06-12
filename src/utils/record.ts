import type { EntityRecord } from '@uipath/uipath-typescript/entities';

export type DpdRecord = EntityRecord & Record<string, unknown>;

/** API returns PascalCase; UI uses camelCase aliases. */
const FIELD_ALIASES: Record<string, readonly string[]> = {
  carRegistration: ['CarRegistration', 'carRegistration', 'CarRegistraction'],
  serviceName: ['ServiceName', 'serviceName'],
  serviceDescription: ['ServiceDescription', 'serviceDescription'],
  companyName: ['CompanyName', 'companyName'],
  taxId: ['TaxID', 'taxId', 'TaxId'],
  amount: ['Amount', 'amount'],
  netPrice: ['NetPrice', 'netPrice'],
  grossPrice: ['GrossPrice', 'grossPrice', 'Brutto', 'brutto'],
  decision: ['Status', 'status', 'decision', 'Decision'],
  autoDecision: [
    'AutoDecision',
    'autoDecision',
    'AgentDecision',
    'AutomaticDecision',
    'MaestroDecision',
    'Auto Decision',
  ],
  validationStatus: [
    'ValidationStatus',
    'validationStatus',
    'InvoiceValidation',
    'InvoiceValidationStatus',
    'Validation',
  ],
  serviceType: ['ServiceType', 'serviceType'],
  riskLevel: ['RiskLevel', 'riskLevel'],
  combinedScore: ['CombinedScore', 'combinedScore'],
  flagType: ['FlagType', 'flagType'],
  fleetManagerNote: ['FleetManagerNote', 'fleetManagerNote'],
  fraudFlag: ['FraudFlag', 'fraudFlag'],
  invoiceFileName: ['invoiceFileName', 'InvoiceFileName', 'Invoice File', 'InvoiceFile'],
  date: [
    'Date',
    'date',
    'ServiceDate',
    'serviceDate',
    'InvoiceDate',
    'invoiceDate',
    'DocumentDate',
    'TransactionDate',
    'CostDate',
    'CreateTime',
    'createTime',
  ],
  totalPrice: [
    'TotalPrice',
    'totalPrice',
    'Total',
    'total',
    'GrossAmount',
    'TotalAmount',
    'GrossPrice',
    'grossPrice',
  ],
  anomalyReason: ['AnomalyReason', 'anomalyReason', 'FraudFlag', 'fraudFlag'],
  comments: ['Comments', 'comments', 'ManagerComment', 'managerComment'],
};

const VEHICLE_FLAG_FIELD_ALIASES: Record<string, readonly string[]> = {
  vehicleId: ['VehicleID', 'Vehicle ID', 'VehicleId', 'vehicleId', 'vehicleID'],
  flaggedAt: [
    'FllagedatDate',
    'Flagged at Date',
    'FlaggedAtDate',
    'FlaggedAt',
    'flaggedAt',
  ],
  description: ['Description', 'description'],
  requiresAction: ['Requires Action', 'RequiresAction', 'requiresAction'],
  aiConfidenceScore: ['AI Confidence Score', 'AIConfidenceScore', 'aiConfidenceScore'],
  relatedCostRecordId: [
    'Related Cost Record ID',
    'RelatedCostRecordID',
    'RelatedCostRecordId',
    'relatedCostRecordId',
    'RecordID',
    'RecordId',
    'recordId',
  ],
  carRegistration: ['CarRegistration', 'Car Registration', 'carRegistration'],
  companyId: ['Company ID', 'CompanyId', 'companyId'],
  riskLevel: ['Severity', 'Risk Level', 'RiskLevel', 'riskLevel'],
  flagType: ['Flag Type', 'FlagType', 'flagType', 'Anomaly Type', 'AnomalyType'],
  fleetManagerNote: [
    'Fleet Manager Note',
    'FleetManagerNote',
    'fleetManagerNote',
    'Manager Note',
    'ManagerNote',
  ],
  combinedScore: [
    'Combined Score',
    'CombinedScore',
    'combinedScore',
    'AI Confidence Score',
    'AIConfidenceScore',
    'aiConfidenceScore',
  ],
  comments: ['Comments', 'comments', 'Comment', 'comment', 'Note', 'note'],
};

/** Keys that may wrap the actual field map in list/read responses */
const RECORD_PAYLOAD_KEYS = ['Fields', 'fields', 'data', 'attributes', 'properties'] as const;

const SYSTEM_FIELDS = new Set([
  'Id',
  'id',
  'CreateTime',
  'UpdateTime',
  'CreatedBy',
  'UpdatedBy',
  'RecordOwner',
]);

/** Merge nested field bags into a flat record (Id + entity fields at top level). */
export function flattenEntityRecord(record: DpdRecord): DpdRecord {
  const out: DpdRecord = { ...record };

  for (const bagKey of RECORD_PAYLOAD_KEYS) {
    const bag = out[bagKey];
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
      Object.assign(out, bag as Record<string, unknown>);
      delete out[bagKey];
    }
  }

  const fieldValues = out.fieldValues ?? out.FieldValues;
  if (Array.isArray(fieldValues)) {
    for (const entry of fieldValues) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const name = (e.name ?? e.fieldName ?? e.FieldName) as string | undefined;
      if (!name) continue;
      const val = e.value ?? e.unformattedValue ?? e.Value;
      if (val !== undefined) out[name] = val;
    }
    delete out.fieldValues;
    delete out.FieldValues;
  }

  return out;
}

export function normalizeDpdRecord(record: DpdRecord): DpdRecord {
  const out: DpdRecord = { ...flattenEntityRecord(record) };

  for (const [canonical, sources] of Object.entries(FIELD_ALIASES)) {
    if (out[canonical] !== undefined && out[canonical] !== null && out[canonical] !== '') {
      continue;
    }
    for (const key of sources) {
      const v = out[key];
      if (v !== undefined && v !== null && v !== '') {
        out[canonical] = v;
        break;
      }
    }
  }

  const invoice =
    out.Invoice ?? out.InvoiceRecipt ?? out.invoice ?? out.invoiceRecipt;
  if (invoice !== undefined && out.Invoice === undefined) {
    out.Invoice = invoice;
  }

  const invoiceName = extractFileDisplayName(out.invoiceFileName);
  if (invoiceName) out.invoiceFileName = invoiceName;
  else if (typeof out.invoiceFileName === 'object') delete out.invoiceFileName;

  if (!out.invoiceFileName) {
    const fromFile = extractFileDisplayName(invoice);
    if (fromFile) out.invoiceFileName = fromFile;
  }

  if (!out.date && out.CreateTime) {
    out.date = out.CreateTime;
  }

  return out;
}

export function recordId(r: DpdRecord): string {
  return String(r.Id ?? r.id ?? '');
}

/** Resolve a cell value using schema field name and known aliases. */
export function resolveRecordField(
  record: DpdRecord,
  fieldName: string,
  columnKey?: string,
): unknown {
  const normalized = normalizeDpdRecord(record);
  const candidates = new Set<string>();

  const add = (s: string | undefined) => {
    if (s) candidates.add(s);
  };

  add(fieldName);
  add(columnKey);
  if (fieldName) {
    add(fieldName.charAt(0).toLowerCase() + fieldName.slice(1));
    add(fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
  }
  if (columnKey) {
    add(columnKey.charAt(0).toUpperCase() + columnKey.slice(1));
  }

  for (const [canonical, sources] of Object.entries(FIELD_ALIASES)) {
    if (
      sources.some((s) => candidates.has(s)) ||
      candidates.has(canonical) ||
      (columnKey && canonical === columnKey) ||
      (fieldName && sources.includes(fieldName))
    ) {
      for (const s of [canonical, ...sources]) add(s);
    }
  }

  for (const key of candidates) {
    const label = normalized[`_${key}Label`];
    if (label !== undefined && label !== null && label !== '') return label;
    const v = normalized[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }

  return undefined;
}

export function pickField(r: DpdRecord, ...keys: string[]): string {
  for (const k of keys) {
    const v = resolveRecordField(r, k, k);
    if (v !== undefined) return formatValue(v);
  }
  return '—';
}

/** Map ChoiceSet raw value (number, string, expanded object) to display label. */
export function resolveChoiceSetLabel(
  raw: unknown,
  map?: Map<number, string>,
): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const dn = o.displayName ?? o.DisplayName ?? o.name ?? o.Name;
    if (typeof dn === 'string' && dn.trim()) return dn.trim();
    const nid = o.numberId ?? o.NumberId ?? o.value ?? o.Value;
    if (map && nid !== undefined && nid !== null) {
      const fromId = resolveChoiceSetLabel(nid, map);
      if (fromId) return fromId;
    }
  }

  if (map) {
    if (typeof raw === 'number' && map.has(raw)) return map.get(raw);
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      const asNum = Number(trimmed);
      if (trimmed !== '' && Number.isInteger(asNum) && map.has(asNum)) return map.get(asNum);
      for (const label of map.values()) {
        if (label.toLowerCase() === trimmed.toLowerCase()) return label;
      }
    }
  }

  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && !map?.has(raw)) return String(raw);
  return undefined;
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Tak' : 'Nie';
  if (Array.isArray(v)) {
    if (v.length === 1) return formatValue(v[0]);
    return v.map((item) => formatValue(item)).join(', ');
  }
  if (typeof v === 'object') {
    const fileName = extractFileDisplayName(v);
    if (fileName) return fileName;
    const o = v as Record<string, unknown>;
    if (typeof o.displayName === 'string' && o.displayName) return o.displayName;
    if (typeof o.DisplayName === 'string' && o.DisplayName) return o.DisplayName;
    if (typeof o.name === 'string' && o.name) return o.name;
    if (typeof o.Name === 'string' && o.Name) return o.Name;
    if (o.value !== undefined && o.value !== null && typeof o.value !== 'object') {
      return formatValue(o.value);
    }
    if (typeof o.numberId === 'number') return String(o.numberId);
    if (typeof o.NumberId === 'number') return String(o.NumberId);
    return JSON.stringify(v);
  }
  return String(v);
}

export function isFileMeta(v: unknown): v is { id?: string; name?: string; contentType?: string } {
  if (typeof v === 'string') {
    return /\.(pdf|png|jpe?g|gif|webp|tiff?)$/i.test(v.trim());
  }
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id === 'string' && o.id) return true;
  if (typeof o.Id === 'string' && o.Id) return true;
  if (typeof o.name === 'string' && o.name) return true;
  if (typeof o.Name === 'string' && o.Name) return true;
  if (typeof o.fileId === 'string' && o.fileId) return true;
  if (typeof o.attachmentId === 'string' && o.attachmentId) return true;
  const nested = o.value ?? o.Value;
  if (nested !== undefined && nested !== v) return isFileMeta(nested);
  return false;
}

/** Compare plates / vehicle IDs ignoring spaces and case. */
export function normalizeRegistration(value: string): string {
  return value
    .replace(/^VH[-_\s]*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function registrationsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizeRegistration(a);
  const nb = normalizeRegistration(b);
  if (na === nb) return true;
  return na.endsWith(nb) || nb.endsWith(na);
}

/** File attachment metadata from Data Fabric (PascalCase or camelCase). */
export function extractFileDisplayName(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return undefined;
    if (s.startsWith('{')) {
      try {
        return extractFileDisplayName(JSON.parse(s));
      } catch {
        return s;
      }
    }
    return s;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const name = o.Name ?? o.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const nested = o.value ?? o.Value;
  if (nested !== undefined && nested !== v) return extractFileDisplayName(nested);
  return undefined;
}

function parseRecordDateValue(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && v > 1_000_000_000_000) return new Date(v);
  if (typeof v === 'string') {
    const d = Date.parse(v);
    if (Number.isFinite(d)) return new Date(d);
  }
  return null;
}

/** Data rozliczenia z pól biznesowych encji; na końcu CreateTime z Data Fabric. */
export function getRecordDate(r: DpdRecord): Date | null {
  const normalized = normalizeDpdRecord(r);
  for (const key of FIELD_ALIASES.date) {
    const v = normalized[key] ?? resolveRecordField(normalized, key, key);
    const d = parseRecordDateValue(v);
    if (d) return d;
  }
  for (const key of ['CreateTime', 'createTime']) {
    const v = normalized[key];
    const d = parseRecordDateValue(v);
    if (d) return d;
  }
  return null;
}

export function formatDateValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const raw = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  if (!raw) return formatValue(v);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toLocaleDateString('pl-PL');
}

export function pickVehicleFlagField(r: DpdRecord, canonical: string): string {
  const sources = VEHICLE_FLAG_FIELD_ALIASES[canonical];
  if (!sources) return pickField(r, canonical);
  const normalized = normalizeDpdRecord(r);
  for (const key of sources) {
    const v = normalized[key];
    if (v !== undefined && v !== null && v !== '') return formatValue(v);
  }
  return pickField(r, ...sources);
}

export function findInvoiceFileField(record: DpdRecord, schemaFileFields: string[]): string | null {
  const r = normalizeDpdRecord(record);
  const tryName = (name: string): string | null => {
    if (isFileMeta(r[name])) return name;
    const compact = name.replace(/\s+/g, '');
    if (compact !== name && isFileMeta(r[compact])) return compact;
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    if (isFileMeta(r[pascal])) return pascal;
    return null;
  };

  for (const name of schemaFileFields) {
    const hit = tryName(name);
    if (hit) return hit;
  }
  for (const key of [
    'Invoice File',
    'InvoiceFile',
    'InvoiceRecipt',
    'InvoiceReceipt',
    'Invoice',
    'invoice',
  ]) {
    const hit = tryName(key);
    if (hit) return hit;
  }
  for (const [key, val] of Object.entries(r)) {
    if (isFileMeta(val)) return key;
    if (/invoice|faktur|receipt|załącz/i.test(key) && isFileMeta(val)) return key;
  }
  return null;
}

export function listInvoiceFileFieldCandidates(
  record: DpdRecord,
  schemaFileFields: string[],
): string[] {
  const primary = findInvoiceFileField(record, schemaFileFields);
  const ordered = [
    ...(primary ? [primary] : []),
    ...schemaFileFields,
    'Invoice File',
    'InvoiceFile',
    'InvoiceRecipt',
    'Invoice',
  ];
  return [...new Set(ordered)];
}

export function isDisplayableField(name: string): boolean {
  return !SYSTEM_FIELDS.has(name);
}

export function riskColor(level: string | undefined): string {
  switch ((level || '').toLowerCase()) {
    case 'critical':
      return '#8b0000';
    case 'high':
      return '#dc0032';
    case 'medium':
      return '#e87722';
    case 'low':
      return '#2e7d32';
    default:
      return '#555';
  }
}

export function riskBg(level: string | undefined): string {
  switch ((level || '').toLowerCase()) {
    case 'critical':
      return '#fce4e4';
    case 'high':
      return '#fde8e8';
    case 'medium':
      return '#fff3e0';
    case 'low':
      return '#e8f5e9';
    default:
      return '#f5f5f5';
  }
}
