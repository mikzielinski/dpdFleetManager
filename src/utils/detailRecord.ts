import type { AnalysisVariables } from '../services/maestro';
import type { VehicleFlagHistoryItem } from '../services/dataFabric';
import {
  findInvoiceFileField,
  formatValue,
  isFileMeta,
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
  flagType: 'description',
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
  if (existing !== undefined) return formatValue(existing);

  const fieldName = findInvoiceFileField(normalized, fileFields);
  if (!fieldName) return undefined;

  const meta = normalized[fieldName];
  if (typeof meta === 'string' && meta.trim()) return meta.trim();
  if (isFileMeta(meta)) {
    const name = meta.name ?? (meta as { Name?: string }).Name;
    if (name) return name;
  }
  return undefined;
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
    if (!resolveRecordField(out, 'totalPrice', 'totalPrice') && analysis.declaredAmount) {
      out.totalPrice = analysis.declaredAmount;
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
  return pickField(enriched, key);
}
