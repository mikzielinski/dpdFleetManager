import type { LocaleFile } from './types';

const CUSTOM_LOCALES_KEY = 'xelto-express.fleet.custom-locales';
const ACTIVE_LOCALE_KEY = 'xelto-express.fleet.locale';

export function getStoredLocale(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LOCALE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLocale(code: string): void {
  try {
    localStorage.setItem(ACTIVE_LOCALE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function loadCustomLocales(): Record<string, LocaleFile> {
  try {
    const raw = localStorage.getItem(CUSTOM_LOCALES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, LocaleFile> = {};
    for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
      try {
        out[code] = normalizeLocaleFile(value, code);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCustomLocale(locale: LocaleFile): void {
  const all = loadCustomLocales();
  all[locale.meta.code] = locale;
  try {
    localStorage.setItem(CUSTOM_LOCALES_KEY, JSON.stringify(all));
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : 'Could not save language file in browser storage.',
    );
  }
}

export function deleteCustomLocale(code: string): void {
  const all = loadCustomLocales();
  delete all[code];
  try {
    localStorage.setItem(CUSTOM_LOCALES_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function normalizeLocaleFile(data: unknown, expectedCode?: string): LocaleFile {
  if (!data || typeof data !== 'object') {
    throw new Error('File must be a JSON object with meta and strings sections.');
  }
  const obj = data as Record<string, unknown>;
  const meta = obj.meta;
  if (!meta || typeof meta !== 'object') {
    throw new Error('Missing meta section (code, name, nativeName).');
  }
  const m = meta as Record<string, unknown>;
  const code = String(m.code ?? expectedCode ?? '').trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(code)) {
    throw new Error('meta.code must be a language code (e.g. pl, en, cs).');
  }
  const name = String(m.name ?? '').trim();
  const nativeName = String(m.nativeName ?? '').trim();
  if (!name || !nativeName) {
    throw new Error('meta.name and meta.nativeName are required.');
  }
  const strings = obj.strings;
  if (!strings || typeof strings !== 'object' || Array.isArray(strings)) {
    throw new Error('Missing strings section (nested translation keys).');
  }
  if (Object.keys(strings as object).length === 0) {
    throw new Error('strings section cannot be empty.');
  }
  return {
    meta: { code, name, nativeName },
    strings: strings as Record<string, unknown>,
  };
}

export async function readLocaleFile(file: File): Promise<LocaleFile> {
  const text = await file.text();
  return parseLocaleJson(text);
}

export function parseLocaleJson(text: string, expectedCode?: string): LocaleFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON — use UTF-8 encoding (diacritics are supported).');
  }
  return normalizeLocaleFile(parsed, expectedCode);
}

export function serializeLocaleFile(locale: LocaleFile): string {
  return `${JSON.stringify(locale, null, 2)}\n`;
}

export function downloadLocaleFile(locale: LocaleFile): void {
  const blob = new Blob([serializeLocaleFile(locale)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${locale.meta.code}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
