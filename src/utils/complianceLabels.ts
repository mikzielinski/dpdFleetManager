import type { ComplianceStatus } from './vehicleCompliance';

export function complianceStatusLabelPl(status: ComplianceStatus | string): string {
  switch (status) {
    case 'ok':
      return 'Ważne';
    case 'due_soon':
      return 'Wkrótce wygasa';
    case 'expired':
      return 'Po terminie';
    default:
      return 'Brak danych';
  }
}
