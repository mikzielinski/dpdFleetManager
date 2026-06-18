import type { TableColumn } from '../config';
import type { AnalysisVariables } from '../services/maestro';
import { fleetMedianCostPerClaim } from '../services/fleetStats';
import { analysisFromRecord } from './analysisFromRecord';
import { getRecordNumericAmount, isLikelyFlagged } from './filterRecords';
import { pickField, recordId, type DpdRecord } from './record';
import { normalizeRegistration } from './record';

export type InsightSignalKey =
  | 'flagged'
  | 'ai_score'
  | 'high_risk'
  | 'high_cost'
  | 'anomaly'
  | 'fraud_flag'
  | 'pending_review'
  | 'repeat_vehicle';

export type InsightSeverity = 'high' | 'medium' | 'low';

export interface InsightSignal {
  key: InsightSignalKey;
  severity: InsightSeverity;
  detail?: string;
}

export interface EnrichedInsight {
  id: string;
  record: DpdRecord;
  analysis: AnalysisVariables | null;
  riskScore: number;
  signals: InsightSignal[];
  vehicleReg: string;
  serviceName: string;
  amount: number | null;
  decision: string;
}

export interface VehicleRiskRow {
  registration: string;
  claimCount: number;
  flaggedCount: number;
  totalAmount: number;
  maxRiskScore: number;
  avgRiskScore: number;
  signals: InsightSignalKey[];
}

export type InsightFilter = 'all' | 'high' | 'medium' | 'flagged' | 'high_cost' | 'vehicles';

function hasRiskFields(record: DpdRecord): boolean {
  const fields = [
    pickField(record, 'riskLevel', 'RiskLevel'),
    pickField(record, 'combinedScore', 'CombinedScore'),
    pickField(record, 'flagType', 'FlagType'),
    pickField(record, 'fleetManagerNote', 'FleetManagerNote'),
    pickField(record, 'fraudFlag'),
    pickField(record, 'anomalyReason'),
  ];
  return fields.some((f) => f && f !== '—');
}

function isPendingReview(record: DpdRecord): boolean {
  const status = pickField(record, 'decision', 'Status');
  return /action required|driver corrected|clarification|oczekuje/i.test(status);
}

function riskLevelRank(level: string | undefined): number {
  const l = (level ?? '').toLowerCase();
  if (l.includes('critical') || l.includes('kryty')) return 4;
  if (l.includes('high') || l.includes('wysok')) return 3;
  if (l.includes('medium') || l.includes('śred') || l.includes('sred')) return 2;
  if (l.includes('low') || l.includes('nisk')) return 1;
  return 0;
}

function parseScore(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function collectSignals(
  record: DpdRecord,
  analysis: AnalysisVariables | null,
  tableColumns: TableColumn[] | undefined,
  fleetMedian: number,
  vehicleClaimCounts: Map<string, number>,
): InsightSignal[] {
  const signals: InsightSignal[] = [];
  const amount = getRecordNumericAmount(record);
  const reg = pickField(record, 'carRegistration', 'CarRegistration');
  const normReg = reg !== '—' ? normalizeRegistration(reg) : '';

  if (isLikelyFlagged(record, tableColumns)) {
    signals.push({ key: 'flagged', severity: 'high' });
  }

  const fraudFlag = pickField(record, 'fraudFlag');
  if (fraudFlag && fraudFlag !== '—' && /true|tak|fraud|1/i.test(fraudFlag)) {
    signals.push({ key: 'fraud_flag', severity: 'high' });
  }

  const anomaly = pickField(record, 'anomalyReason');
  if (anomaly && anomaly !== '—' && anomaly !== 'false' && anomaly !== 'Nie') {
    signals.push({ key: 'anomaly', severity: 'medium', detail: anomaly });
  }

  if (isPendingReview(record)) {
    signals.push({ key: 'pending_review', severity: 'medium' });
  }

  const rl = analysis?.riskLevel ?? pickField(record, 'riskLevel', 'RiskLevel');
  const rlRank = riskLevelRank(rl !== '—' ? rl : undefined);
  if (rlRank >= 3) {
    signals.push({ key: 'high_risk', severity: 'high', detail: rl !== '—' ? rl : undefined });
  } else if (rlRank === 2) {
    signals.push({ key: 'high_risk', severity: 'medium', detail: rl !== '—' ? rl : undefined });
  }

  const score = parseScore(analysis?.combinedScore ?? pickField(record, 'combinedScore', 'CombinedScore'));
  if (score >= 60) {
    signals.push({
      key: 'ai_score',
      severity: score >= 80 ? 'high' : 'medium',
      detail: String(score),
    });
  }

  if (fleetMedian > 0 && amount != null && amount > fleetMedian * 1.45) {
    const ratio = Math.round((amount / fleetMedian) * 100);
    signals.push({
      key: 'high_cost',
      severity: amount > fleetMedian * 2.2 ? 'high' : 'medium',
      detail: `${ratio}% mediany`,
    });
  }

  if (normReg && (vehicleClaimCounts.get(normReg) ?? 0) >= 4) {
    signals.push({
      key: 'repeat_vehicle',
      severity: 'low',
      detail: String(vehicleClaimCounts.get(normReg)),
    });
  }

  return signals;
}

function scoreFromSignals(signals: InsightSignal[], analysis: AnalysisVariables | null): number {
  let score = 0;
  for (const s of signals) {
    const w = s.severity === 'high' ? 22 : s.severity === 'medium' ? 14 : 8;
    score += w;
  }
  score += Math.min(35, parseScore(analysis?.combinedScore) * 0.35);
  score += riskLevelRank(analysis?.riskLevel) * 8;
  return Math.min(100, Math.round(score));
}

export function buildInsightRecords(
  costs: DpdRecord[],
  tableColumns?: TableColumn[],
  fleetMedian?: number,
): EnrichedInsight[] {
  const median = fleetMedian ?? fleetMedianCostPerClaim(costs);

  const vehicleClaimCounts = new Map<string, number>();
  for (const r of costs) {
    const reg = pickField(r, 'carRegistration', 'CarRegistration');
    if (reg === '—') continue;
    const key = normalizeRegistration(reg);
    vehicleClaimCounts.set(key, (vehicleClaimCounts.get(key) ?? 0) + 1);
  }

  const out: EnrichedInsight[] = [];

  for (const record of costs) {
    const analysis = analysisFromRecord(record);
    const signals = collectSignals(record, analysis, tableColumns, median, vehicleClaimCounts);

    const flagged = isLikelyFlagged(record, tableColumns);
    const hasFields = hasRiskFields(record);
    const amount = getRecordNumericAmount(record);
    const highCost = median > 0 && amount != null && amount > median * 1.45;

    if (signals.length === 0 && !flagged && !hasFields && !highCost && !analysis) {
      continue;
    }

    const riskScore = scoreFromSignals(signals, analysis);
    if (riskScore < 12 && !flagged && !analysis && !highCost) continue;

    out.push({
      id: recordId(record),
      record,
      analysis,
      riskScore,
      signals: signals.length > 0 ? signals : flagged ? [{ key: 'flagged', severity: 'medium' }] : [],
      vehicleReg: pickField(record, 'carRegistration', 'CarRegistration'),
      serviceName: pickField(record, 'serviceName', 'ServiceName'),
      amount,
      decision: pickField(record, 'decision', 'Decision', 'Status'),
    });
  }

  return out.sort((a, b) => b.riskScore - a.riskScore || (b.amount ?? 0) - (a.amount ?? 0));
}

export function buildVehicleRiskRows(insights: EnrichedInsight[]): VehicleRiskRow[] {
  const map = new Map<string, VehicleRiskRow>();

  for (const item of insights) {
    if (item.vehicleReg === '—') continue;
    const reg = item.vehicleReg;
    const row = map.get(reg) ?? {
      registration: reg,
      claimCount: 0,
      flaggedCount: 0,
      totalAmount: 0,
      maxRiskScore: 0,
      avgRiskScore: 0,
      signals: [] as InsightSignalKey[],
    };
    row.claimCount += 1;
    if (item.signals.some((s) => s.key === 'flagged' || s.key === 'fraud_flag' || s.key === 'high_risk')) {
      row.flaggedCount += 1;
    }
    row.totalAmount += item.amount ?? 0;
    row.maxRiskScore = Math.max(row.maxRiskScore, item.riskScore);
    for (const s of item.signals) {
      if (!row.signals.includes(s.key)) row.signals.push(s.key);
    }
    map.set(reg, row);
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      avgRiskScore: r.claimCount > 0 ? Math.round(r.maxRiskScore) : 0,
    }))
    .sort((a, b) => b.maxRiskScore - a.maxRiskScore || b.flaggedCount - a.flaggedCount)
    .slice(0, 15);
}

export function filterInsights(items: EnrichedInsight[], filter: InsightFilter): EnrichedInsight[] {
  switch (filter) {
    case 'high':
      return items.filter((i) => i.riskScore >= 55);
    case 'medium':
      return items.filter((i) => i.riskScore >= 30);
    case 'flagged':
      return items.filter((i) => i.signals.some((s) => s.key === 'flagged' || s.key === 'fraud_flag'));
    case 'high_cost':
      return items.filter((i) => i.signals.some((s) => s.key === 'high_cost'));
    case 'vehicles':
      return items;
    default:
      return items;
  }
}

export function insightsSummary(items: EnrichedInsight[], vehicleRows: VehicleRiskRow[]) {
  const highRisk = items.filter((i) => i.riskScore >= 55).length;
  const withAi = items.filter((i) => i.analysis != null).length;
  const pending = items.filter((i) => i.signals.some((s) => s.key === 'pending_review')).length;
  const amountAtRisk = items.reduce((acc, i) => acc + (i.amount ?? 0), 0);
  return {
    total: items.length,
    vehicles: vehicleRows.length,
    highRisk,
    withAi,
    pending,
    amountAtRisk,
  };
}
