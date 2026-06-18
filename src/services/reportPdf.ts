import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FleetCostStats } from './fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';
import type { VehicleCompliance } from '../utils/vehicleCompliance';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import type { VehicleCatalogItem } from './vehicleCatalog';
import type { CompanyCatalogItem } from './companyCatalog';
import { translate } from '../i18n/translate';
import plLocale from '../i18n/locales/pl.json';
import enLocale from '../i18n/locales/en.json';

function pdfT(locale: string, key: string, params?: Record<string, string | number>): string {
  const messages = (locale === 'en' ? enLocale.strings : plLocale.strings) as Record<
    string,
    unknown
  >;
  return translate(messages, key, params);
}

function pdfHealthSummary(health: HealthScoreResult, locale: string): string {
  return pdfT(locale, `health.summary.${health.summaryKey}`);
}

function pdfHealthFactorRows(health: HealthScoreResult, locale: string): string[][] {
  return health.factors.map((f) => [
    pdfT(locale, `health.factors.${f.key}.label`),
    String(f.impact),
    pdfT(locale, `health.factors.${f.key}.detail`, f.params),
  ]);
}

const BRAND_NAVY: [number, number, number] = [26, 27, 58];
const BRAND_ORANGE: [number, number, number] = [232, 119, 34];
const BRAND_DARK: [number, number, number] = [26, 26, 26];
const BRAND_GRAY: [number, number, number] = [120, 120, 120];

function addBrandHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...BRAND_NAVY);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Xelto EXPRESS', 14, 14);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Fleet Manager — weryfikacja kosztów', 14, 21);
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 38);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_GRAY);
  doc.text(subtitle, 14, 45);
  doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 14, 51);
}

function saveDoc(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function downloadVehicleReportPdf(opts: {
  vehicle: VehicleCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  compliance: VehicleCompliance;
  locale?: string;
}) {
  const { vehicle, stats, health, compliance, locale = 'pl' } = opts;
  const doc = new jsPDF();
  addBrandHeader(
    doc,
    `Raport pojazdu ${vehicle.registration}`,
    `${vehicle.companyLabel || '—'} · ${vehicle.areaLabel || '—'}`,
  );

  let y = 58;
  doc.setTextColor(...BRAND_DARK);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Health Score: ${health.score}/100 (${health.grade})`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfHealthSummary(health, locale), 14, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Suma kosztów (POC)', `${stats.totalCost.toFixed(2)} PLN`],
      ['Liczba rozliczeń', String(stats.claimCount)],
      ['Średni koszt', `${stats.avgCost.toFixed(2)} PLN`],
      ['Oznaczenia / fraud', String(stats.flaggedCount)],
      ['Przebieg', compliance.mileageKm != null ? `${compliance.mileageKm.toLocaleString('pl-PL')} km` : '—'],
      ['Badanie techniczne do', compliance.inspectionValidUntil ?? '—'],
      ['Status badania', compliance.inspectionStatus],
    ],
    theme: 'grid',
    headStyles: { fillColor: BRAND_ORANGE, textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  y += 8;

  if (stats.byCategory.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Koszty wg kategorii usług', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byCategory.map((c) => [
        c.category,
        String(c.count),
        c.total.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: BRAND_DARK },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (compliance.policies.length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Polisy ubezpieczeniowe', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Typ', 'Ważna do', 'Status']],
      body: compliance.policies.map((p) => [p.type, p.validUntil ?? '—', p.status]),
      headStyles: { fillColor: BRAND_DARK },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    y += 8;
  }

  if (health.factors.length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Czynniki Health Score', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Czynnik', 'Wpływ', 'Szczegóły']],
      body: pdfHealthFactorRows(health, locale),
      headStyles: { fillColor: BRAND_DARK },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  if (compliance.complianceIssues.length) {
    const fy = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
    doc.setTextColor(...BRAND_ORANGE);
    doc.setFontSize(9);
    doc.text('Nieprawidłowości: ' + compliance.complianceIssues.join('; '), 14, fy + 10);
  }

  saveDoc(doc, `Xelto_Pojazd_${vehicle.registration.replace(/\s/g, '_')}.pdf`);
}

export function downloadCompanyReportPdf(opts: {
  company: CompanyCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  vehicles: VehicleCatalogItem[];
  locale?: string;
}) {
  const { company, stats, health, vehicles } = opts;
  const doc = new jsPDF();
  addBrandHeader(
    doc,
    `Raport firmy B2B`,
    company.name,
  );

  let y = 58;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Health Score: ${health.score}/100 (${health.grade})`, 14, y);
  y += 12;

  autoTable(doc, {
    startY: y,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Region', company.areaLabel || '—'],
      ['Pojazdy we flocie', String(company.vehicleCount)],
      ['Suma kosztów POC', `${stats.totalCost.toFixed(2)} PLN`],
      ['Rozliczenia', String(stats.claimCount)],
      ['Oznaczenia / fraud', String(stats.flaggedCount)],
    ],
    headStyles: { fillColor: BRAND_ORANGE, textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 35;
  y += 8;

  if (stats.byCategory.length) {
    autoTable(doc, {
      startY: y,
      head: [['Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byCategory.map((c) => [c.category, String(c.count), c.total.toFixed(2)]),
      headStyles: { fillColor: BRAND_DARK },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (vehicles.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Pojazdy', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Rejestracja', 'Region', 'Health', 'Koszty PLN']],
      body: vehicles.slice(0, 40).map((v) => [
        v.registration,
        v.areaLabel || '—',
        v.healthGrade ? `${v.healthScore ?? '—'} (${v.healthGrade})` : '—',
        v.totalCost != null ? v.totalCost.toFixed(2) : '—',
      ]),
      headStyles: { fillColor: BRAND_DARK },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  saveDoc(doc, `Xelto_Firma_${company.name.slice(0, 30).replace(/[^\w]/g, '_')}.pdf`);
}

export function downloadFleetSummaryPdf(opts: {
  stats: FleetCostStats;
  vehicleCount: number;
  companyCount: number;
  locale?: string;
}) {
  const doc = new jsPDF();
  addBrandHeader(doc, 'Podsumowanie floty', 'Rejestr rozliczeń DPD_POC');

  autoTable(doc, {
    startY: 58,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Pojazdy B2B', String(opts.vehicleCount)],
      ['Firmy kurierskie', String(opts.companyCount)],
      ['Rozliczenia POC', String(opts.stats.claimCount)],
      ['Suma kosztów', `${opts.stats.totalCost.toFixed(2)} PLN`],
      ['Oznaczenia / fraud', String(opts.stats.flaggedCount)],
    ],
    headStyles: { fillColor: BRAND_ORANGE, textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  autoTable(doc, {
    startY: y + 8,
    head: [['Kategoria usługi', 'Liczba', 'Suma PLN']],
    body: opts.stats.byCategory.map((c) => {
      const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
      return [meta?.label ?? c.category, String(c.count), c.total.toFixed(2)];
    }),
    headStyles: { fillColor: BRAND_DARK },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  saveDoc(doc, `Xelto_Podsumowanie_floty.pdf`);
}
