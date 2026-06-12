import type { TableColumn } from '../config';
import { displayField } from '../services/dataFabric';
import type { DpdRecord } from './record';
import { pickField } from './record';

export type CaseStatusKind = 'approved' | 'rejected' | 'flagged' | 'fraud' | 'pending' | 'neutral';

export interface CaseStatusInfo {
  kind: CaseStatusKind;
  label: string;
  badgeClass: string;
  rowClass?: string;
  chartColor: string;
}

function resolveStatusText(record: DpdRecord, tableColumns?: TableColumn[]): string {
  const decCol = tableColumns?.find((c) => c.key === 'decision');
  const status = decCol ? displayField(record, decCol) : pickField(record, 'decision');
  return status && status !== '—' ? status : '';
}

/** Fraud only when explicitly named — FraudFlag=true means „anomalia po analizie”, not fraud. */
export function isFraudCase(record: DpdRecord, statusText?: string): boolean {
  const status = statusText ?? resolveStatusText(record);
  if (/fraud|oszust/i.test(status)) return true;

  const fraudFlag = pickField(record, 'fraudFlag');
  if (fraudFlag && fraudFlag !== '—' && /fraud|oszust/i.test(fraudFlag)) return true;

  const anomaly = pickField(record, 'anomalyReason');
  if (anomaly && anomaly !== '—' && /fraud|oszust/i.test(anomaly)) return true;

  return false;
}

function isFinalManagerDecision(statusText: string): boolean {
  return /approv|zatwier|reject|odrzu/i.test(statusText);
}

export function classifyCaseStatus(
  statusText: string,
  options?: { fraud?: boolean },
): CaseStatusInfo {
  const label = statusText || '—';
  const lower = statusText.toLowerCase();

  if (options?.fraud || /fraud/i.test(lower)) {
    return {
      kind: 'fraud',
      label: label === '—' ? 'Fraud' : label,
      badgeClass: 'case-status-badge case-status-fraud',
      rowClass: 'case-row-fraud',
      chartColor: '#991b1b',
    };
  }
  if (/reject|odrzu/i.test(lower)) {
    return {
      kind: 'rejected',
      label,
      badgeClass: 'case-status-badge case-status-rejected',
      rowClass: 'case-row-rejected',
      chartColor: '#dc2626',
    };
  }
  if (/approv|zatwier/i.test(lower)) {
    return {
      kind: 'approved',
      label,
      badgeClass: 'case-status-badge case-status-approved',
      rowClass: 'case-row-approved',
      chartColor: '#16a34a',
    };
  }
  if (/flag|anomal/i.test(lower)) {
    return {
      kind: 'flagged',
      label,
      badgeClass: 'case-status-badge case-status-flagged',
      rowClass: 'case-row-flagged',
      chartColor: '#ca8a04',
    };
  }
  if (/oczek|pend|clarif|wyjaśn/i.test(lower) || !statusText) {
    return {
      kind: 'pending',
      label: label === '—' ? 'Oczekuje' : label,
      badgeClass: 'case-status-badge case-status-pending',
      rowClass: 'case-row-pending',
      chartColor: '#9ca3af',
    };
  }
  return {
    kind: 'neutral',
    label,
    badgeClass: 'case-status-badge case-status-neutral',
    chartColor: '#9ca3af',
  };
}

export function getCaseStatusFromRecord(
  record: DpdRecord,
  tableColumns?: TableColumn[],
): CaseStatusInfo {
  const statusText = resolveStatusText(record, tableColumns);
  const fraud =
    !isFinalManagerDecision(statusText) && isFraudCase(record, statusText);
  return classifyCaseStatus(statusText, { fraud });
}

export function decisionChartColor(label: string): string {
  return classifyCaseStatus(label, { fraud: /fraud/i.test(label) }).chartColor;
}
