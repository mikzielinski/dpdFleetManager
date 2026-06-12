import type { jsPDF } from 'jspdf';

export const PDF_FONT_FAMILY = 'Roboto';

let fontModulePromise: Promise<typeof import('./pdfFonts.generated')> | null = null;

function loadFontModule() {
  if (!fontModulePromise) {
    fontModulePromise = import('./pdfFonts.generated');
  }
  return fontModulePromise;
}

/** Register full Roboto for Polish + ASCII in jsPDF / autoTable (lazy-loaded chunk). */
export async function applyPdfFonts(doc: jsPDF): Promise<void> {
  const { PDF_FONT_ENTRIES } = await loadFontModule();
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
