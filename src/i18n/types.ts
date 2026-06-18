/** One language pack — single JSON file per locale. */
export interface LocaleMeta {
  /** BCP-47-ish code, e.g. pl, en, cs */
  code: string;
  /** English name for admins */
  name: string;
  /** Name shown in the language picker */
  nativeName: string;
}

export interface LocaleFile {
  meta: LocaleMeta;
  strings: Record<string, unknown>;
}

export interface LocaleListItem {
  code: string;
  name: string;
  nativeName: string;
  isCustom: boolean;
}

export interface I18nContextValue {
  locale: string;
  locales: LocaleListItem[];
  setLocale: (code: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  importLocaleFile: (file: File) => Promise<void>;
  removeCustomLocale: (code: string) => void;
  refreshLocales: () => void;
  getLocaleFile: (code: string) => LocaleFile | null;
  downloadLocale: (code?: string) => void;
  saveLocaleFromJson: (text: string, expectedCode?: string) => LocaleFile;
}
