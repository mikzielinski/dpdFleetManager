/** Normalize decision / Status field for styling and filters. */
export type DecisionTone =
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'pending'
  | 'review'
  | 'action'
  | 'corrected'
  | 'neutral';

export function readDecisionLabel(status: string): string {
  return status.trim();
}

export function decisionTone(status: string): DecisionTone {
  const s = status.trim().toLowerCase();
  if (!s || s === '—') return 'neutral';
  if (/approved|zatwierdz/i.test(s)) return 'approved';
  if (/rejected|odrzucon/i.test(s)) return 'rejected';
  if (/driver corrected|poprawione/i.test(s)) return 'corrected';
  if (/action required|oczekuje.*kierow|awaiting.*driver/i.test(s)) return 'action';
  if (/flagged|flag/i.test(s)) return 'flagged';
  if (/under review|w trakcie|weryfik/i.test(s)) return 'review';
  if (/pending|oczekuj/i.test(s)) return 'pending';
  return 'neutral';
}

export function decisionRowClass(status: string): string {
  const tone = decisionTone(status);
  return tone === 'neutral' ? '' : `row-decision-${tone}`;
}

export function decisionChipClass(status: string): string {
  const tone = decisionTone(status);
  if (tone === 'neutral') return 'status-chip';
  return `status-chip status-chip--${tone}`;
}
