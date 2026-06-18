import type { FleetCostStats } from '../services/fleetStats';

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type HealthFactorKey = 'fraud' | 'highCost' | 'volume' | 'compliance' | 'rejected';

export type HealthSummaryKey = 'good' | 'watch' | 'risk';

export interface HealthFactor {
  key: HealthFactorKey;
  impact: number;
  params: Record<string, string | number>;
}

export interface HealthScoreResult {
  score: number;
  grade: HealthGrade;
  summaryKey: HealthSummaryKey;
  factors: HealthFactor[];
}

function gradeFromScore(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export interface HealthScoreInput {
  stats: FleetCostStats;
  complianceIssueCount: number;
  fleetMedianCostPerClaim?: number;
}

/** 0–100: higher = better (fewer fraud flags, lower costs, compliance OK). */
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { stats, complianceIssueCount, fleetMedianCostPerClaim } = input;
  const factors: HealthFactor[] = [];
  let score = 100;

  const fraudPct = stats.claimCount > 0 ? (stats.flaggedCount / stats.claimCount) * 100 : 0;
  if (fraudPct > 0) {
    const impact = Math.min(35, Math.round(fraudPct * 0.8));
    score -= impact;
    factors.push({
      key: 'fraud',
      impact: -impact,
      params: {
        flagged: stats.flaggedCount,
        total: stats.claimCount,
        pct: fraudPct.toFixed(0),
      },
    });
  }

  const avg = stats.claimCount > 0 ? stats.totalCost / stats.claimCount : 0;
  const baseline = fleetMedianCostPerClaim ?? avg;
  if (baseline > 0 && avg > baseline * 1.35) {
    const ratio = avg / baseline;
    const impact = Math.min(25, Math.round((ratio - 1) * 20));
    score -= impact;
    factors.push({
      key: 'highCost',
      impact: -impact,
      params: { avg: avg.toFixed(0), median: baseline.toFixed(0) },
    });
  }

  if (stats.claimCount >= 8 && stats.totalCost > (fleetMedianCostPerClaim ?? 500) * 6) {
    const impact = 15;
    score -= impact;
    factors.push({
      key: 'volume',
      impact: -impact,
      params: { count: stats.claimCount, total: stats.totalCost.toFixed(0) },
    });
  }

  if (complianceIssueCount > 0) {
    const impact = Math.min(25, complianceIssueCount * 8);
    score -= impact;
    factors.push({
      key: 'compliance',
      impact: -impact,
      params: { count: complianceIssueCount },
    });
  }

  const rejected = stats.byDecision.find((d) => /odrzucon|reject/i.test(d.label));
  if (rejected && rejected.count >= 2) {
    const impact = 10;
    score -= impact;
    factors.push({
      key: 'rejected',
      impact: -impact,
      params: { count: rejected.count },
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);
  const summaryKey: HealthSummaryKey =
    grade === 'A' || grade === 'B' ? 'good' : grade === 'C' ? 'watch' : 'risk';

  return { score, grade, factors, summaryKey };
}

export function healthGradeClass(grade: HealthGrade): string {
  return `health-grade health-grade-${grade.toLowerCase()}`;
}
