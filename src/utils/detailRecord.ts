import type { AnalysisVariables } from '../services/maestro';
import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import {
  extractFileDisplayName,
  findInvoiceFileField,
  formatDateValue,
  formatValue,
  normalizeDpdRecord,
  pickField,
  pickVehicleFlagField,
  resolveRecordField,
  type DpdRecord,
} from './record';

export interface DetailEnrichmentContext {
  analysis?: AnalysisVariables | null;
  vehicleFlag?: VehicleFlagHistoryItem | null;
  fileFields?: string[];
}

const ANALYSIS_DETAIL_MAP: Partial<Record<string, keyof AnalysisVariables>> = {
  riskLevel: 'riskLevel',
  combinedScore: 'combinedScore',
  flagType: 'flagType',
  fleetManagerNote: 'fleetManagerNote',
  comments: 'validationStatus',
};

const FLAG_DETAIL_MAP: Record<string, string> = {
  combinedScore: 'aiConfidenceScore',
  flagType: 'flagType',
  fleetManagerNote: 'description',
  comments: 'requiresAction',
};

/** Uzupełnia rekord o nazwę pliku faktury z metadanych pola File. */
export function deriveInvoiceFileName(
  record: DpdRecord,
  fileFields: string[] = [],
): string | undefined {
  const normalized = normalizeDpdRecord(record);
  const existing = resolveRecordField(normalized, 'invoiceFileName', 'invoiceFileName');
  if (existing !== undefined) {
    const fromObj = extractFileDisplayName(existing);
    if (fromObj) return fromObj;
    if (typeof existing === 'string' && !existing.trim().startsWith('{')) {
      return formatValue(existing);
    }
  }

  const fieldName = findInvoiceFileField(normalized, fileFields);
  if (!fieldName) return undefined;

  const meta = normalized[fieldName];
  return extractFileDisplayName(meta);
}

function deriveServiceDate(record: DpdRecord, fileFields: string[]): unknown {
  const existing = resolveRecordField(record, 'date', 'date');
  if (existing !== undefined) return existing;

  const invField = findInvoiceFileField(record, fileFields);
  if (invField) {
    const meta = record[invField];
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const ct = (meta as Record<string, unknown>).CreateTime;
      if (ct) return ct;
    }
  }

  return record.CreateTime ?? record.createTime;
}

/** Scala DPD_POC + wynik Maestro + powiązany wpis DPD_VehicleFlags dla panelu szczegółów. */
export function enrichRecordForDetailView(
  record: DpdRecord,
  context: DetailEnrichmentContext = {},
): DpdRecord {
  const out = normalizeDpdRecord(record);
  const { analysis, vehicleFlag, fileFields = [] } = context;

  const invoiceName = deriveInvoiceFileName(out, fileFields);
  if (invoiceName) out.invoiceFileName = invoiceName;

  const serviceDate = deriveServiceDate(out, fileFields);
  if (serviceDate !== undefined && resolveRecordField(out, 'date', 'date') === undefined) {
    out.date = serviceDate;
  }

  if (analysis) {
    for (const [detailKey, analysisKey] of Object.entries(ANALYSIS_DETAIL_MAP)) {
      if (!analysisKey) continue;
      const current = resolveRecordField(out, detailKey, detailKey);
      if (current !== undefined) continue;
      const fromAnalysis = analysis[analysisKey];
      if (fromAnalysis != null && String(fromAnalysis).trim()) {
        out[detailKey] = fromAnalysis;
      }
    }
  }

  if (vehicleFlag?.raw) {
    const flagRaw = normalizeDpdRecord(vehicleFlag.raw);
    for (const [detailKey, flagKey] of Object.entries(FLAG_DETAIL_MAP)) {
      const current = resolveRecordField(out, detailKey, detailKey);
      if (current !== undefined) continue;
      const fromFlag = pickVehicleFlagField(flagRaw, flagKey);
      if (fromFlag !== '—') out[detailKey] = fromFlag;
    }
    const riskFromFlag = pickVehicleFlagField(flagRaw, 'riskLevel');
    if (
      riskFromFlag !== '—' &&
      resolveRecordField(out, 'riskLevel', 'riskLevel') === undefined
    ) {
      out.riskLevel = riskFromFlag;
    }
  }

  return out;
}

export function pickDetailField(
  record: DpdRecord,
  key: string,
  context: DetailEnrichmentContext = {},
): string {
  const enriched = enrichRecordForDetailView(record, context);
  if (key === 'date') return formatDateValue(resolveRecordField(enriched, 'date', 'date'));
  return pickField(enriched, key);
}
