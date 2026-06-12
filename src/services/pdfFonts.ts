import type { jsPDF } from 'jspdf';
import { PDF_FONT_ENTRIES } from './pdfFonts.generated';

export const PDF_FONT_FAMILY = 'Roboto';

/** Register Roboto (latin-ext) for Polish diacritics in jsPDF / autoTable. */
export function applyPdfFonts(doc: jsPDF): void {
  for (const entry of PDF_FONT_ENTRIES) {
    doc.addFileToVFS(entry.vfs, entry.base64);
    doc.addFont(entry.vfs, entry.family, entry.style);
  }
  doc.setFont(PDF_FONT_FAMILY, 'normal');
}

export function pdfTableFontStyles() {
  return { font: PDF_FONT_FAMILY, fontStyle: 'normal' as const };
}

export function pdfTableHeadStyles(fillColor: [number, number, number]) {
  return {
    ...pdfTableFontStyles(),
    fontStyle: 'bold' as const,
    fillColor,
    textColor: [255, 255, 255] as [number, number, number],
  };
}
