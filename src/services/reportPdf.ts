import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FleetCostStats } from './fleetStats';
import type { HealthScoreResult } from '../utils/healthScore';
import type { VehicleCompliance } from '../utils/vehicleCompliance';
import { SERVICE_CATEGORIES } from '../utils/serviceCategories';
import type { VehicleCatalogItem } from './vehicleCatalog';
import type { CompanyCatalogItem } from './companyCatalog';
import { BRAND, BRAND_RGB } from '../brand';
import { applyPdfFonts, pdfTableFontStyles, pdfTableHeadStyles, PDF_FONT_FAMILY } from './pdfFonts';

const REPORT = {
  costsTotal: 'Suma kosztów rozliczeń',
  claimsCount: 'Liczba rozliczeń',
  analyzedCount: 'Przeanalizowane rozliczenia',
  fleetRegistry: 'Rejestr rozliczeń kosztów floty',
} as const;

async function addBrandHeader(doc: jsPDF, title: string, subtitle: string) {
  await applyPdfFonts(doc);
  doc.setFillColor(...BRAND_RGB.indigo);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.text(BRAND.name, 14, 14);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.text(BRAND.productTitle, 14, 21);
  doc.setTextColor(...BRAND_RGB.dark);
  doc.setFontSize(14);
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.text(title, 14, 38);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setTextColor(...BRAND_RGB.gray);
  doc.text(subtitle, 14, 45);
  doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 14, 51);
}

function addBrandFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(PDF_FONT_FAMILY, 'normal');
    doc.setTextColor(...BRAND_RGB.gray);
    doc.text(
      `${BRAND.name} · ${BRAND.productTitle} · strona ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }
}

function saveDoc(doc: jsPDF, filename: string) {
  addBrandFooter(doc);
  doc.save(filename);
}

export async function downloadVehicleReportPdf(opts: {
  vehicle: VehicleCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  compliance: VehicleCompliance;
}) {
  const { vehicle, stats, health, compliance } = opts;
  const doc = new jsPDF();
  await addBrandHeader(
    doc,
    `Raport pojazdu ${vehicle.registration}`,
    `${vehicle.companyLabel || '—'} · ${vehicle.areaLabel || '—'}`,
  );

  let y = 58;
  doc.setTextColor(...BRAND_RGB.dark);
  doc.setFontSize(11);
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.text(`Health Score: ${health.score}/100 (${health.grade})`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(health.summary, 14, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Metryka', 'Wartość']],
    body: [
      [REPORT.costsTotal, `${stats.totalCost.toFixed(2)} PLN`],
      [REPORT.claimsCount, String(stats.claimCount)],
      ['Średni koszt', `${stats.avgCost.toFixed(2)} PLN`],
      [REPORT.analyzedCount, String(stats.flaggedCount)],
      ['Przebieg', compliance.mileageKm != null ? `${compliance.mileageKm.toLocaleString('pl-PL')} km` : '—'],
      ['Badanie techniczne do', compliance.inspectionValidUntil ?? '—'],
      ['Status badania', compliance.inspectionStatus],
    ],
    theme: 'grid',
    headStyles: pdfTableHeadStyles(BRAND_RGB.indigo),
    styles: { ...pdfTableFontStyles(), fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  y += 8;

  if (stats.byCategory.length) {
    doc.setFont(PDF_FONT_FAMILY, 'bold');
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
      headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
      styles: { ...pdfTableFontStyles(), fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (compliance.policies.length) {
    doc.setFont(PDF_FONT_FAMILY, 'bold');
    doc.text('Polisy ubezpieczeniowe', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Typ', 'Ważna do', 'Status']],
      body: compliance.policies.map((p) => [p.type, p.validUntil ?? '—', p.status]),
      headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
      styles: { ...pdfTableFontStyles(), fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    y += 8;
  }

  if (health.factors.length) {
    doc.setFont(PDF_FONT_FAMILY, 'bold');
    doc.text('Czynniki Health Score', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Czynnik', 'Wpływ', 'Szczegóły']],
      body: health.factors.map((f) => [f.label, String(f.impact), f.detail]),
      headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
      styles: { ...pdfTableFontStyles(), fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  if (compliance.complianceIssues.length) {
    const fy = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
    doc.setTextColor(...BRAND_RGB.indigo);
    doc.setFontSize(9);
    doc.text('Nieprawidłowości: ' + compliance.complianceIssues.join('; '), 14, fy + 10);
  }

  saveDoc(doc, `Xelto_Pojazd_${vehicle.registration.replace(/\s/g, '_')}.pdf`);
}

export async function downloadCompanyReportPdf(opts: {
  company: CompanyCatalogItem;
  stats: FleetCostStats;
  health: HealthScoreResult;
  vehicles: VehicleCatalogItem[];
}) {
  const { company, stats, health, vehicles } = opts;
  const doc = new jsPDF();
  await addBrandHeader(
    doc,
    `Raport firmy B2B`,
    company.name,
  );

  let y = 58;
  doc.setFont(PDF_FONT_FAMILY, 'bold');
  doc.setFontSize(11);
  doc.text(`Health Score: ${health.score}/100 (${health.grade})`, 14, y);
  y += 12;

  autoTable(doc, {
    startY: y,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Region', company.areaLabel || '—'],
      ['Pojazdy we flocie', String(company.vehicleCount)],
      [REPORT.costsTotal, `${stats.totalCost.toFixed(2)} PLN`],
      [REPORT.claimsCount, String(stats.claimCount)],
      [REPORT.analyzedCount, String(stats.flaggedCount)],
    ],
    headStyles: pdfTableHeadStyles(BRAND_RGB.indigo),
    styles: { ...pdfTableFontStyles(), fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 35;
  y += 8;

  if (stats.byCategory.length) {
    autoTable(doc, {
      startY: y,
      head: [['Kategoria', 'Liczba', 'Suma PLN']],
      body: stats.byCategory.map((c) => [c.category, String(c.count), c.total.toFixed(2)]),
      headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
      styles: { ...pdfTableFontStyles(), fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (vehicles.length) {
    doc.setFont(PDF_FONT_FAMILY, 'bold');
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
      headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
      styles: { ...pdfTableFontStyles(), fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  saveDoc(doc, `Xelto_Firma_${company.name.slice(0, 30).replace(/[^\w]/g, '_')}.pdf`);
}

export async function downloadFleetSummaryPdf(opts: {
  stats: FleetCostStats;
  vehicleCount: number;
  companyCount: number;
}) {
  const doc = new jsPDF();
  await addBrandHeader(doc, 'Podsumowanie floty', REPORT.fleetRegistry);

  autoTable(doc, {
    startY: 58,
    head: [['Metryka', 'Wartość']],
    body: [
      ['Pojazdy we flocie', String(opts.vehicleCount)],
      ['Firmy kurierskie', String(opts.companyCount)],
      [REPORT.claimsCount, String(opts.stats.claimCount)],
      [REPORT.costsTotal, `${opts.stats.totalCost.toFixed(2)} PLN`],
      [REPORT.analyzedCount, String(opts.stats.flaggedCount)],
    ],
    headStyles: pdfTableHeadStyles(BRAND_RGB.indigo),
    styles: { ...pdfTableFontStyles(), fontSize: 9 },
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
    headStyles: pdfTableHeadStyles(BRAND_RGB.navy),
    styles: { ...pdfTableFontStyles(), fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  saveDoc(doc, `Xelto_Podsumowanie_floty.pdf`);
}
