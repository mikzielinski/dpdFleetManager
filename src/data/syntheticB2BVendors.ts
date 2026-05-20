/** Fikcyjni partnerzy B2B DPD (kurierzy / flota) — tylko do uzupełnienia UI, gdy brak relacji w Data Fabric. */
export interface SyntheticB2BPartner {
  company: string;
  area: string;
}

export const SYNTHETIC_B2B_PARTNERS: readonly SyntheticB2BPartner[] = [
  { company: 'Trans-Hex Kurier B2B Sp. z o.o.', area: 'Wrocław Centrum' },
  { company: 'Partner Logistic Wrocław', area: 'Wrocław Południe' },
  { company: 'DPD Subcontractor — Metro Fleet', area: 'Wrocław Północ' },
  { company: 'Express Door2Door B2B', area: 'Wrocław Zachód' },
  { company: 'Śląska Flota Kurierska Sp. z o.o.', area: 'Wrocław Wschód' },
  { company: 'Baltic Courier Partners', area: 'Wrocław Centrum' },
  { company: 'ProLogis Last Mile B2B', area: 'Wrocław Fabryczna' },
  { company: 'Urban Delivery Alliance', area: 'Wrocław Krzyki' },
  { company: 'Oder Fleet Solutions', area: 'Wrocław Ołtaszyn' },
  { company: 'Małopolska Kurier B2B (oddz. dolnośl.)', area: 'Wrocław Psie Pole' },
  { company: 'Green Mile Logistics Sp. z o.o.', area: 'Wrocław Centrum' },
  { company: 'Hub & Spoke Courier Wrocław', area: 'Wrocław Południe' },
  { company: 'Noxten B2B Transport', area: 'Wrocław Północ' },
  { company: 'VeloKurier Partner DPD', area: 'Wrocław Zachód' },
  { company: 'Polska Sieć Flotowa B2B', area: 'Wrocław Wschód' },
  { company: 'Rhenus Last Mile Wrocław', area: 'Wrocław Fabryczna' },
  { company: 'CityRoute Courier Sp. z o.o.', area: 'Wrocław Krzyki' },
  { company: 'Dolnośląscy Partnerzy Dostaw', area: 'Wrocław Ołtaszyn' },
  { company: 'FastBox B2B Wrocław', area: 'Wrocław Psie Pole' },
  { company: 'EuroTrans Subcontractor PL', area: 'Wrocław Centrum' },
];

/** Nazwy z kosztów POC (stacje, warsztaty) — nie pokazujemy jako „firma kurierska B2B”. */
const POC_INVOICE_VENDOR_PATTERNS = [
  /^bp\s*polska/i,
  /^shell\b/i,
  /^circle\s*k/i,
  /^orlen\b/i,
  /^auto\s*serwis/i,
  /^quick\s*tire/i,
  /^pzu\b/i,
  /^clean\s*truck/i,
  /^myjnia/i,
  /^warsztat/i,
  /^stacja\s*paliw/i,
];

export function isPocInvoiceVendorName(company: string): boolean {
  const t = company.trim();
  if (!t) return false;
  return POC_INVOICE_VENDOR_PATTERNS.some((re) => re.test(t));
}

/** Stabilny indeks 0..n-1 z rejestracji (do przypisania partnera B2B). */
export function syntheticPartnerIndex(seed: string, poolSize: number): number {
  const s = seed.replace(/\s+/g, '').toUpperCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return poolSize > 0 ? h % poolSize : 0;
}

export function pickSyntheticPartner(seed: string): SyntheticB2BPartner {
  const i = syntheticPartnerIndex(seed, SYNTHETIC_B2B_PARTNERS.length);
  return SYNTHETIC_B2B_PARTNERS[i]!;
}
