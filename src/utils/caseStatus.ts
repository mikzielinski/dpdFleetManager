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

function isTruthyFlag(value: string): boolean {
  if (!value || value === '—') return false;
  return value === 'true' || value === 'Tak' || value === 'Yes' || value === '1';
}

function resolveStatusText(record: DpdRecord, tableColumns?: TableColumn[]): string {
  const decCol = tableColumns?.find((c) => c.key === 'decision');
  const status = decCol ? displayField(record, decCol) : pickField(record, 'decision');
  return status && status !== '—' ? status : '';
}

export function isFraudCase(record: DpdRecord, statusText?: string): boolean {
  const status = statusText ?? resolveStatusText(record);
  const fraudFlag = pickField(record, 'fraudFlag');
  const riskLevel = pickField(record, 'riskLevel');
  const anomaly = pickField(record, 'anomalyReason');

  if (isTruthyFlag(fraudFlag) || /fraud/i.test(fraudFlag)) return true;
  if (/fraud/i.test(status)) return true;
  if (anomaly && anomaly !== '—' && /fraud/i.test(anomaly)) return true;
  if (riskLevel && riskLevel !== '—' && /fraud|wysok|high|critical/i.test(riskLevel)) return true;
  return false;
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
  const fraud = isFraudCase(record, statusText);
  return classifyCaseStatus(statusText, { fraud });
}

export function decisionChartColor(label: string): string {
  return classifyCaseStatus(label, { fraud: /fraud/i.test(label) }).chartColor;
}
