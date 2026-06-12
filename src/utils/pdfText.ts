const PL_ASCII: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'A',
  Ć: 'C',
  Ę: 'E',
  Ł: 'L',
  Ń: 'N',
  Ó: 'O',
  Ś: 'S',
  Ź: 'Z',
  Ż: 'Z',
};

/** Helvetica w jsPDF obsługuje tylko ASCII — zamiana polskich znaków na łacińskie. */
export function pdfText(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => PL_ASCII[ch] ?? ch);
}

export function pdfTableRows(
  rows: (string | number | null | undefined)[][],
): string[][] {
  return rows.map((row) => row.map((cell) => pdfText(cell)));
}
