import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ko from './locales/ko.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  ko: { translation: ko },
  en: { translation: en },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Korean is the mandatory default experience: a first-time visitor (no
    // saved choice) loads Korean regardless of their browser locale. An
    // explicit choice still wins because the LanguageDetector reads the
    // persisted `localStorage` value first, and any missing key falls back to
    // Korean too.
    fallbackLng: 'ko',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Persisted choice first; otherwise fall through to fallbackLng ('ko').
      // `navigator` is intentionally omitted so a non-Korean browser does not
      // override the mandatory Korean default for new visitors.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lol-lang',
    },
  });

export default i18n;
