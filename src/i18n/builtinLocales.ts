import pl from './locales/pl.json';
import en from './locales/en.json';
import type { LocaleFile } from './types';

export const BUILTIN_LOCALES: Record<string, LocaleFile> = {
  pl: pl as LocaleFile,
  en: en as LocaleFile,
};

export const DEFAULT_LOCALE = 'pl';
