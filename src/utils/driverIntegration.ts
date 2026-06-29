import type { DpdRecord } from './record';
import { pickField } from './record';
import {
  CORRECTION_REQUEST_STATUS,
  DRIVER_CORRECTED_STATUS,
} from '../config';

/** Status values set by Maestro / manager after analysis — do not overwrite with Driver Corrected. */
export const ANALYSIS_TERMINAL_STATUSES = new Set([
  'approved',
  'rejected',
  'under review',
  'flagged',
]);

export function isAnalysisTerminalStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return ANALYSIS_TERMINAL_STATUSES.has(normalized);
}

export interface DriverCorrectionResolvedEvent {
  recordId: string;
  status?: string;
  closedAt?: string;
}

const CORRECTION_RESOLVED_TYPE = 'xelto-express:correction-resolved';

const PARENT_ORIGIN_HINTS = ['uipath.host', 'uipath.com', 'localhost', '127.0.0.1'];

export function isTrustedDriverMessageOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return true;
  return PARENT_ORIGIN_HINTS.some((hint) => origin.includes(hint));
}

export function parseDriverCorrectionResolved(data: unknown): DriverCorrectionResolvedEvent | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  if (String(payload.type ?? '') !== CORRECTION_RESOLVED_TYPE) return null;

  const recordId = String(payload.recordId ?? payload.id ?? '').trim();
  if (!recordId) return null;

  return {
    recordId,
    status: String(payload.status ?? '').trim() || undefined,
    closedAt: String(payload.closedAt ?? '').trim() || undefined,
  };
}

export function readRecordStatus(record: DpdRecord): string {
  return pickField(record, 'decision', 'Status', 'status');
}

export function isAwaitingDriverCorrection(record: DpdRecord): boolean {
  const status = readRecordStatus(record).toLowerCase();
  return (
    status.includes('action') ||
    status === CORRECTION_REQUEST_STATUS.toLowerCase() ||
    /oczekuje.*kierow|awaiting.*driver/i.test(status)
  );
}

export function isDriverCorrected(record: DpdRecord): boolean {
  const status = readRecordStatus(record).toLowerCase();
  return (
    status.includes('driver corrected') ||
    status.includes('poprawione') ||
    status === DRIVER_CORRECTED_STATUS.toLowerCase()
  );
}

export function buildDriverCorrectionUrl(recordId: string, message: string): string {
  const base = import.meta.env.VITE_DRIVER_APP_URL?.trim() || 'https://mzpocevylrxu.staging.uipath.host/dpddriver/';
  const url = new URL(base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('correction', '1');
  url.searchParams.set('recordId', recordId);
  if (message.trim()) url.searchParams.set('reason', message.trim());
  return url.href;
}
