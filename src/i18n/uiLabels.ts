import type { TableColumn } from '../config';
import type { HealthScoreResult } from '../utils/healthScore';
import type { ServiceCategory } from '../utils/serviceCategories';

type TFn = (key: string, params?: Record<string, string | number>) => string;

const TABLE_FIELD_KEYS: Record<string, string> = {
  carRegistration: 'table.vehicle',
  serviceName: 'table.service',
  companyName: 'table.company',
  taxId: 'table.taxId',
  netPrice: 'table.net',
  grossPrice: 'table.gross',
  amount: 'table.quantity',
  decision: 'table.decision',
};

const CATEGORY_KEYS: Record<ServiceCategory, string> = {
  Paliwo: 'categories.fuel',
  'Opłaty drogowe': 'categories.toll',
  'Serwis / naprawa': 'categories.service',
  'Przegląd techniczny': 'categories.inspection',
  Ubezpieczenie: 'categories.insurance',
  'Myjnia / parking': 'categories.wash',
  Opony: 'categories.tires',
  Inne: 'categories.other',
};

export function formatLocale(code: string): string {
  return code === 'pl' ? 'pl-PL' : 'en-GB';
}

export function localizedTableColumns(columns: TableColumn[], t: TFn): TableColumn[] {
  return columns.map((c) => {
    const key = TABLE_FIELD_KEYS[c.key] ?? `fields.${c.key}`;
    const label = t(key);
    return { ...c, label: label === key ? c.label : label };
  });
}

export function localizedFieldLabel(fieldKey: string, t: TFn): string {
  const label = t(`fields.${fieldKey}`);
  return label === `fields.${fieldKey}` ? fieldKey : label;
}

export function localizedServiceCategory(category: ServiceCategory, t: TFn): string {
  const key = CATEGORY_KEYS[category];
  const label = t(key);
  return label === key ? category : label;
}

export function localizedHealthSummary(health: HealthScoreResult, t: TFn): string {
  return t(`health.summary.${health.summaryKey}`);
}

export function localizedHealthFactorLabel(
  factor: HealthScoreResult['factors'][number],
  t: TFn,
): string {
  return t(`health.factors.${factor.key}.label`);
}

export function localizedHealthFactorDetail(
  factor: HealthScoreResult['factors'][number],
  t: TFn,
): string {
  return t(`health.factors.${factor.key}.detail`, factor.params);
}
