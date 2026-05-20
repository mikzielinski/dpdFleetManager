import type { jsPDF } from 'jspdf';

let cachedBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function loadDejaVuBase64(): Promise<string> {
  if (cachedBase64) return cachedBase64;
  const base = import.meta.env.BASE_URL ?? '/';
  const url = `${base}fonts/DejaVuSans.ttf`.replace(/\/+/g, '/').replace(':/', '://');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Nie można załadować czcionki PDF (${url}): ${res.status}`);
  }
  cachedBase64 = arrayBufferToBase64(await res.arrayBuffer());
  return cachedBase64;
}

/** Czcionka z polskimi znakami (ąćęłńóśźż) dla jsPDF i autotable. */
export async function applyPdfFonts(doc: jsPDF): Promise<void> {
  const b64 = await loadDejaVuBase64();
  doc.addFileToVFS('DejaVuSans.ttf', b64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'bold');
  doc.setFont('DejaVuSans', 'normal');
}

export const PDF_FONT = 'DejaVuSans';

export const PDF_TABLE_STYLES = {
  font: PDF_FONT,
  fontStyle: 'normal' as const,
};
