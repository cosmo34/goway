import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedLocale } from '../../i18n/locales';
import type { TransportMode } from '../../config/tam';
import type { AccessibilitySettings } from '../../stores/appStore';

const STORAGE_KEY = '@goway/app-preferences';

export interface PersistedAppPreferences {
  locale?: SupportedLocale;
  accessibility?: AccessibilitySettings;
  enabledTransportModes?: TransportMode[];
}

export async function loadAppPreferences(): Promise<PersistedAppPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAppPreferences;
  } catch {
    return null;
  }
}

export async function saveAppPreferences(prefs: PersistedAppPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Préférences non critiques — ignorer les erreurs de stockage.
  }
}
