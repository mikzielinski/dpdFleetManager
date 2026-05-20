import type { FleetCostStats } from '../services/fleetStats';

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScoreResult {
  score: number;
  grade: HealthGrade;
  summary: string;
  factors: { label: string; impact: number; detail: string }[];
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

/** 0–100: wyżej = lepiej (mniej fraudów, niższe koszty, compliance OK). */
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { stats, complianceIssueCount, fleetMedianCostPerClaim } = input;
  const factors: HealthScoreResult['factors'] = [];
  let score = 100;

  const fraudPct = stats.claimCount > 0 ? (stats.flaggedCount / stats.claimCount) * 100 : 0;
  if (fraudPct > 0) {
    const impact = Math.min(35, Math.round(fraudPct * 0.8));
    score -= impact;
    factors.push({
      label: 'Oznaczenia / fraud',
      impact: -impact,
      detail: `${stats.flaggedCount} z ${stats.claimCount} rozliczeń (${fraudPct.toFixed(0)}%)`,
    });
  }

  const avg = stats.claimCount > 0 ? stats.totalCost / stats.claimCount : 0;
  const baseline = fleetMedianCostPerClaim ?? avg;
  if (baseline > 0 && avg > baseline * 1.35) {
    const ratio = avg / baseline;
    const impact = Math.min(25, Math.round((ratio - 1) * 20));
    score -= impact;
    factors.push({
      label: 'Wysoki koszt średni',
      impact: -impact,
      detail: `Średnio ${avg.toFixed(0)} PLN vs mediana floty ${baseline.toFixed(0)} PLN`,
    });
  }

  if (stats.claimCount >= 8 && stats.totalCost > (fleetMedianCostPerClaim ?? 500) * 6) {
    const impact = 15;
    score -= impact;
    factors.push({
      label: 'Wolumen kosztów',
      impact: -impact,
      detail: `${stats.claimCount} rozliczeń, suma ${stats.totalCost.toFixed(0)} PLN`,
    });
  }

  if (complianceIssueCount > 0) {
    const impact = Math.min(25, complianceIssueCount * 8);
    score -= impact;
    factors.push({
      label: 'Compliance pojazdu',
      impact: -impact,
      detail: `${complianceIssueCount} nieprawidłowości (badanie / polisy)`,
    });
  }

  const rejected = stats.byDecision.find((d) => /odrzucon|reject/i.test(d.label));
  if (rejected && rejected.count >= 2) {
    const impact = 10;
    score -= impact;
    factors.push({
      label: 'Odrzucone rozliczenia',
      impact: -impact,
      detail: `${rejected.count} odrzuceń`,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);
  const summary =
    grade === 'A' || grade === 'B'
      ? 'Akceptowalny profil kosztów i ryzyka'
      : grade === 'C'
        ? 'Wymaga monitorowania'
        : 'Podwyższone ryzyko — zalecana analiza';

  return { score, grade, factors, summary };
}

export function healthGradeClass(grade: HealthGrade): string {
  return `health-grade health-grade-${grade.toLowerCase()}`;
}
