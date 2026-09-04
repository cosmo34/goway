export type SupportedLocale = 'fr' | 'en' | 'es' | 'zh' | 'ar' | 'de' | 'it';

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  'fr',
  'en',
  'es',
  'zh',
  'ar',
  'de',
  'it',
];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  zh: '中文',
  ar: 'العربية',
  de: 'Deutsch',
  it: 'Italiano',
};

/** Langues RTL */
export const RTL_LOCALES: SupportedLocale[] = ['ar'];

export function isRTL(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}
