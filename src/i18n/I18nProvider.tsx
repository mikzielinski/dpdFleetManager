import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BUILTIN_LOCALES, DEFAULT_LOCALE } from './builtinLocales';
import {
  deleteCustomLocale,
  downloadLocaleFile,
  getStoredLocale,
  loadCustomLocales,
  parseLocaleJson,
  readLocaleFile,
  saveCustomLocale,
  setStoredLocale,
} from './localeStore';
import { translate } from './translate';
import type { I18nContextValue, LocaleFile, LocaleListItem } from './types';

const I18nContext = createContext<I18nContextValue | null>(null);

function buildLocaleList(
  all: Record<string, LocaleFile>,
  customCodes: Set<string>,
): LocaleListItem[] {
  return Object.values(all)
    .map((file) => ({
      code: file.meta.code,
      name: file.meta.name,
      nativeName: file.meta.nativeName,
      isCustom: customCodes.has(file.meta.code),
    }))
    .sort((a, b) => a.nativeName.localeCompare(b.nativeName, undefined, { sensitivity: 'base' }));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [customLocales, setCustomLocales] = useState<Record<string, LocaleFile>>(() =>
    loadCustomLocales(),
  );
  const [stringsEpoch, setStringsEpoch] = useState(0);
  const [locale, setLocaleState] = useState(() => {
    const stored = getStoredLocale();
    if (stored) return stored;
    return DEFAULT_LOCALE;
  });

  const allLocales = useMemo(
    () => ({ ...BUILTIN_LOCALES, ...customLocales }),
    [customLocales],
  );

  const customCodes = useMemo(() => new Set(Object.keys(customLocales)), [customLocales]);

  const locales = useMemo(
    () => buildLocaleList(allLocales, customCodes),
    [allLocales, customCodes],
  );

  const refreshLocales = useCallback(() => {
    setCustomLocales(loadCustomLocales());
  }, []);

  const setLocale = useCallback(
    (code: string) => {
      if (!allLocales[code]) return;
      setLocaleState(code);
      setStoredLocale(code);
    },
    [allLocales],
  );

  useEffect(() => {
    if (!allLocales[locale]) {
      setLocaleState(DEFAULT_LOCALE);
      setStoredLocale(DEFAULT_LOCALE);
    }
  }, [allLocales, locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const current = allLocales[locale]?.strings ?? BUILTIN_LOCALES[DEFAULT_LOCALE].strings;
      const fallback =
        allLocales[DEFAULT_LOCALE]?.strings ?? BUILTIN_LOCALES.en.strings;
      return translate(current, key, params, fallback);
    },
    [allLocales, locale, stringsEpoch],
  );

  const getLocaleFile = useCallback(
    (code: string): LocaleFile | null => allLocales[code] ?? null,
    [allLocales],
  );

  const downloadLocale = useCallback(
    (code?: string) => {
      const target = code ?? locale;
      const file = allLocales[target];
      if (!file) return;
      downloadLocaleFile(file);
    },
    [allLocales, locale],
  );

  const saveLocaleFromJson = useCallback((text: string, expectedCode?: string): LocaleFile => {
    const parsed = parseLocaleJson(text, expectedCode);
    saveCustomLocale(parsed);
    setCustomLocales(loadCustomLocales());
    setLocaleState(parsed.meta.code);
    setStoredLocale(parsed.meta.code);
    setStringsEpoch((n) => n + 1);
    return parsed;
  }, []);

  const importLocaleFile = useCallback(async (file: File) => {
    const parsed = await readLocaleFile(file);
    saveCustomLocale(parsed);
    setCustomLocales(loadCustomLocales());
    setLocaleState(parsed.meta.code);
    setStoredLocale(parsed.meta.code);
    setStringsEpoch((n) => n + 1);
  }, []);

  const removeCustomLocale = useCallback(
    (code: string) => {
      if (!customLocales[code]) return;
      deleteCustomLocale(code);
      const next = loadCustomLocales();
      setCustomLocales(next);
      if (locale === code) {
        setLocaleState(DEFAULT_LOCALE);
        setStoredLocale(DEFAULT_LOCALE);
      }
    },
    [customLocales, locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales,
      setLocale,
      t,
      importLocaleFile,
      removeCustomLocale,
      refreshLocales,
      getLocaleFile,
      downloadLocale,
      saveLocaleFromJson,
    }),
    [
      locale,
      locales,
      setLocale,
      t,
      importLocaleFile,
      removeCustomLocale,
      refreshLocales,
      getLocaleFile,
      downloadLocale,
      saveLocaleFromJson,
    ],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
