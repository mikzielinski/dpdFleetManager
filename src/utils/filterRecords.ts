import type { TableColumn } from '../config';
import { displayField } from '../services/dataFabric';
import type { DpdRecord } from './record';
import { pickField, recordId } from './record';

export interface ClaimsFilterState {
  query: string;
  serviceName: string;
  decision: string;
  amountMin: string;
  amountMax: string;
  flaggedOnly: boolean;
}

export const DEFAULT_CLAIMS_FILTERS: ClaimsFilterState = {
  query: '',
  serviceName: '',
  decision: '',
  amountMin: '',
  amountMax: '',
  flaggedOnly: false,
};

function parseNumLoose(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Parsed numeric net amount for filtering and summaries (never Amount/ilość). */
export function getRecordNumericAmount(r: DpdRecord): number | null {
  return parseNumLoose(pickField(r, 'netPrice'));
}

/** True when record is flagged / anomaly (Status, flag fields, or anomaly reason). */
export function isLikelyFlagged(r: DpdRecord, tableColumns?: TableColumn[]): boolean {
  const decCol = tableColumns?.find((c) => c.key === 'decision');
  const status = decCol ? displayField(r, decCol) : pickField(r, 'decision', 'Status', 'status');
  if (status && status !== '—' && /flagged|flag|anomal/i.test(status)) return true;

  const ft = pickField(r, 'flagType');
  if (ft && ft !== '—') return true;

  const ar = pickField(r, 'anomalyReason');
  if (ar && ar !== '—' && (ar === 'true' || ar === 'Tak' || /anomal/i.test(ar))) return true;

  const ff = pickField(r, 'fraudFlag');
  if (ff && ff !== '—' && (ff === 'true' || ff === 'Tak' || /fraud/i.test(ff))) return true;

  return false;
}

/** Filters that must scan the full entity, not only the current API page. */
export function needsFullDatasetFilters(filters: ClaimsFilterState): boolean {
  return (
    filters.flaggedOnly ||
    filters.query.trim() !== '' ||
    filters.serviceName !== '' ||
    filters.decision !== '' ||
    filters.amountMin.trim() !== '' ||
    filters.amountMax.trim() !== ''
  );
}

function rowSearchBlob(record: DpdRecord, tableColumns: TableColumn[]): string {
  const parts: string[] = [recordId(record)];
  for (const col of tableColumns) {
    parts.push(displayField(record, col));
  }
  parts.push(pickField(record, 'serviceDescription', 'companyName'));
  return parts.join(' ').toLowerCase();
}

/** Client-side filter for the current page of claims (matches visible table columns + ID). */
export function filterClaimRecords(
  items: DpdRecord[],
  tableColumns: TableColumn[],
  filters: ClaimsFilterState,
): DpdRecord[] {
  const q = filters.query.trim().toLowerCase();

  return items.filter((r) => {
    if (filters.flaggedOnly && !isLikelyFlagged(r, tableColumns)) return false;

    if (filters.serviceName) {
      const svcCol = tableColumns.find((c) => c.key === 'serviceName');
      const svc = svcCol ? displayField(r, svcCol) : pickField(r, 'serviceName');
      if (svc !== filters.serviceName) return false;
    }

    if (filters.decision) {
      const decCol = tableColumns.find((c) => c.key === 'decision');
      const dec = decCol ? displayField(r, decCol) : pickField(r, 'decision');
      if (dec !== filters.decision) return false;
    }

    const amt = getRecordNumericAmount(r);
    const minV = parseNumLoose(filters.amountMin);
    const maxV = parseNumLoose(filters.amountMax);
    if (minV !== null && (amt === null || amt < minV)) return false;
    if (maxV !== null && (amt === null || amt > maxV)) return false;

    if (q) {
      const blob = rowSearchBlob(r, tableColumns);
      if (!blob.includes(q)) return false;
    }

    return true;
  });
}
