/** Kategorie kosztów POC do statystyk i raportów. */
export type ServiceCategory =
  | 'Paliwo'
  | 'Opłaty drogowe'
  | 'Serwis / naprawa'
  | 'Przegląd techniczny'
  | 'Ubezpieczenie'
  | 'Myjnia / parking'
  | 'Opony'
  | 'Inne';

export interface ServiceCategoryMeta {
  id: ServiceCategory;
  label: string;
  color: string;
}

export const SERVICE_CATEGORIES: ServiceCategoryMeta[] = [
  { id: 'Paliwo', label: 'Paliwo', color: '#e85d04' },
  { id: 'Opłaty drogowe', label: 'Opłaty drogowe', color: '#7b2cbf' },
  { id: 'Serwis / naprawa', label: 'Serwis / naprawa', color: '#e87722' },
  { id: 'Przegląd techniczny', label: 'Przegląd techniczny', color: '#0077b6' },
  { id: 'Ubezpieczenie', label: 'Ubezpieczenie', color: '#2a9d8f' },
  { id: 'Myjnia / parking', label: 'Myjnia / parking', color: '#6c757d' },
  { id: 'Opony', label: 'Opony', color: '#bc6c25' },
  { id: 'Inne', label: 'Inne', color: '#adb5bd' },
];

const RULES: { category: ServiceCategory; pattern: RegExp }[] = [
  { category: 'Paliwo', pattern: /paliwo|fuel|benzyn|diesel|on\b|adblue|tankow/i },
  { category: 'Opłaty drogowe', pattern: /toll|autostrada|opłat|bramk|via\s*toll/i },
  { category: 'Przegląd techniczny', pattern: /przegląd|badanie\s*tech|mot\b|inspection/i },
  { category: 'Ubezpieczenie', pattern: /ubezpieczen|polisa|\boc\b|\bac\b|nnw|likwid/i },
  { category: 'Myjnia / parking', pattern: /myjni|parking|wash|czyszczen/i },
  { category: 'Opony', pattern: /opon|tire|wyważ/i },
  {
    category: 'Serwis / naprawa',
    pattern: /napraw|serwis|wymian|olej|repair|service|części|hamulc/i,
  },
];

export function categorizeService(serviceName: string, serviceType = ''): ServiceCategory {
  const blob = `${serviceName} ${serviceType}`.trim();
  if (!blob) return 'Inne';
  for (const { category, pattern } of RULES) {
    if (pattern.test(blob)) return category;
  }
  return 'Inne';
}
