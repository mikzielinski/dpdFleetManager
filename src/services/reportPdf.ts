import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FleetCostStats } from './fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';
import type { VehicleCompliance } from '../utils/vehicleCompliance';
import { complianceStatusLabelPl } from '../utils/complianceLabels';
import { applyPdfFonts, PDF_FONT, PDF_TABLE_STYLES } from '../utils/pdfFonts';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import type { VehicleCatalogItem } from './vehicleCatalog';
import type { CompanyCatalogItem } from './companyCatalog';

const DPD_RED: [number, number, number] = [220, 0, 50];
const DPD_DARK: [number, number, number] = [59, 59, 59];
const DPD_GRAY: [number, number, number] = [120, 120, 120];

const tableDefaults = {
  styles: { ...PDF_TABLE_STYLES, fontSize: 9 },
  headStyles: {
    fillColor: DPD_RED,
    textColor: [255, 255, 255] as [number, number, number],
    font: PDF_FONT,
  },
  bodyStyles: { font: PDF_FONT },
};

async function createPdfDoc(): Promise<jsPDF> {
  const doc = new jsPDF();
  await applyPdfFonts(doc);
  return doc;
}

function addDpdHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...DPD_RED);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(PDF_FONT, 'bold');
  doc.text('DPD', 14, 14);
  doc.setFontSize(11);
  doc.setFont(PDF_FONT, 'normal');
  doc.text('Fleet Manager — koszty kierowców', 14, 21);
  doc.setTextColor(...DPD_DARK);
  doc.setFontSize(14);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(title, 14, 38);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, 'normal');
  doc.setTextColor(...DPD_GRAY);
  doc.text(subtitle, 14, 45);
  doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 14, 51);
}

function saveDoc(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export async function downloadVehicleReportPdf(opts: {
  vehicle: VehicleCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  compliance: VehicleCompliance;
}) {
  const { vehicle, stats, health, compliance } = opts;
  const doc = await createPdfDoc();
  addDpdHeader(
    doc,
    `Raport pojazdu ${vehicle.registration}`,
    `${vehicle.companyLabel || '—'} · ${vehicle.areaLabel || '—'}`,
  );

  let y = 58;
  doc.setTextColor(...DPD_DARK);
  doc.setFontSize(11);
  doc.setFont(PDF_FONT, 'bold');
  doc.text(`Health Score: ${health.score}/100 (${health.grade})`, 14, y);
  y += 6;
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.text(health.summary, 14, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Suma kosztów (POC)', `${stats.totalCost.toFixed(2)} PLN`],
      ['Liczba rozliczeń', String(stats.claimCount)],
      ['Średni koszt', `${stats.avgCost.toFixed(2)} PLN`],
      ['Oznaczenia / fraud', String(stats.flaggedCount)],
      [
        'Przebieg',
        compliance.mileageKm != null ? `${compliance.mileageKm.toLocaleString('pl-PL')} km` : '—',
      ],
      ['Badanie techniczne do', compliance.inspectionValidUntil ?? '—'],
      ['Status badania', complianceStatusLabelPl(compliance.inspectionStatus)],
    ],
    theme: 'grid',
    ...tableDefaults,
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  y += 8;

  if (stats.byCategory.length) {
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(10);
    doc.text('Koszty wg kategorii usług', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byCategory.map((c) => {
        const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
        return [meta?.label ?? c.category, String(c.count), c.total.toFixed(2)];
      }),
      theme: 'striped',
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (stats.byService.length) {
    doc.setFont(PDF_FONT, 'bold');
    doc.text('Top usługi', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Usługa', 'Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byService.slice(0, 12).map((s) => [
        s.name,
        s.category,
        String(s.count),
        s.total.toFixed(2),
      ]),
      theme: 'striped',
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (compliance.policies.length) {
    doc.setFont(PDF_FONT, 'bold');
    doc.text('Polisy ubezpieczeniowe', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Typ', 'Ważna do', 'Status']],
      body: compliance.policies.map((p) => [
        p.type,
        p.validUntil ?? '—',
        complianceStatusLabelPl(p.status),
      ]),
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    y += 8;
  }

  if (health.factors.length) {
    doc.setFont(PDF_FONT, 'bold');
    doc.text('Czynniki Health Score', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Czynnik', 'Wpływ', 'Szczegóły']],
      body: health.factors.map((f) => [f.label, String(f.impact), f.detail]),
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  if (compliance.complianceIssues.length) {
    const fy = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
    doc.setTextColor(...DPD_RED);
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, 'normal');
    doc.text('Nieprawidłowości: ' + compliance.complianceIssues.join('; '), 14, fy + 10);
  }

  saveDoc(doc, `DPD_Pojazd_${vehicle.registration.replace(/\s/g, '_')}.pdf`);
}

export async function downloadCompanyReportPdf(opts: {
  company: CompanyCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  vehicles: VehicleCatalogItem[];
}) {
  const { company, stats, health, vehicles } = opts;
  const doc = await createPdfDoc();
  addDpdHeader(doc, `Raport firmy B2B`, company.name);

  let y = 58;
  doc.setFont(PDF_FONT, 'bold');
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
      ['Średni koszt', `${stats.avgCost.toFixed(2)} PLN`],
      ['Oznaczenia / fraud', String(stats.flaggedCount)],
    ],
    theme: 'grid',
    ...tableDefaults,
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 35;
  y += 8;

  if (stats.byCategory.length) {
    autoTable(doc, {
      startY: y,
      head: [['Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byCategory.map((c) => {
        const meta = SERVICE_CATEGORIES.find((x) => x.id === c.category);
        return [meta?.label ?? c.category, String(c.count), c.total.toFixed(2)];
      }),
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (vehicles.length) {
    doc.setFont(PDF_FONT, 'bold');
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
      ...tableDefaults,
      headStyles: {
        fillColor: DPD_DARK,
        textColor: [255, 255, 255] as [number, number, number],
        font: PDF_FONT,
      },
      styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  saveDoc(doc, `DPD_Firma_${company.name.slice(0, 30).replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]/gi, '_')}.pdf`);
}

export async function downloadFleetSummaryPdf(opts: {
  stats: FleetCostStats;
  vehicleCount: number;
  companyCount: number;
}) {
  const doc = await createPdfDoc();
  addDpdHeader(doc, 'Podsumowanie floty', 'Rejestr rozliczeń DPD_POC');

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
    theme: 'grid',
    ...tableDefaults,
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
    ...tableDefaults,
    headStyles: { fillColor: DPD_DARK, textColor: [255, 255, 255], font: PDF_FONT },
    styles: { ...PDF_TABLE_STYLES, fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  saveDoc(doc, `DPD_Podsumowanie_floty.pdf`);
}
