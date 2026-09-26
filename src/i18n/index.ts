import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  STORAGE_KEYS,
  SUPPORTED_LANGUAGES,
  type Language,
} from '../config/app';
import { storage } from '../lib/storage';
import { is } from './locales/is';
import { en } from './locales/en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function initialLanguage(): Language {
  const stored = storage.get(STORAGE_KEYS.language);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: { is: { translation: is }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

function syncDocumentLanguage(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
}
syncDocumentLanguage(i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

/** Re-reads the stored language (native apps restore storage after this module loaded). */
export function applyStoredLanguage(): void {
  const lng = initialLanguage();
  if (lng !== i18n.language) void i18n.changeLanguage(lng);
}

/** Changes the UI language instantly and remembers it on this device. */
export function setLanguage(lng: Language): void {
  storage.set(STORAGE_KEYS.language, lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
