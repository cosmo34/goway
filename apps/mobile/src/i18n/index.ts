import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { SUPPORTED_LOCALES, type SupportedLocale } from './locales';
import fr from './translations/fr';
import en from './translations/en';
import es from './translations/es';
import zh from './translations/zh';
import ar from './translations/ar';
import de from './translations/de';
import it from './translations/it';

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  es: { translation: es },
  zh: { translation: zh },
  ar: { translation: ar },
  de: { translation: de },
  it: { translation: it },
};

function resolveDeviceLocale(): SupportedLocale {
  const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'fr';
  if (SUPPORTED_LOCALES.includes(deviceLang as SupportedLocale)) {
    return deviceLang as SupportedLocale;
  }
  return 'fr';
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
