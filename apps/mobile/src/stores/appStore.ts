import { create } from 'zustand';
import type { SupportedLocale } from '../i18n/locales';
import { TRANSPORT_MODES, type TransportMode } from '../config/tam';
import { loadAppPreferences, saveAppPreferences } from '../services/storage/appPreferences';

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  announceDepartures: boolean;
  hapticFeedback: boolean;
}

interface AppState {
  locale: SupportedLocale;
  accessibility: AccessibilitySettings;
  enabledTransportModes: TransportMode[];
  preferencesHydrated: boolean;
  setLocale: (locale: SupportedLocale) => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  toggleTransportMode: (mode: TransportMode) => void;
  hydrateFromStorage: () => Promise<void>;
}

function persistState(state: Pick<AppState, 'locale' | 'accessibility' | 'enabledTransportModes'>) {
  void saveAppPreferences({
    locale: state.locale,
    accessibility: state.accessibility,
    enabledTransportModes: state.enabledTransportModes,
  });
}

function isTransportMode(value: unknown): value is TransportMode {
  return typeof value === 'string' && (TRANSPORT_MODES as readonly string[]).includes(value);
}

export const useAppStore = create<AppState>((set, get) => ({
  locale: 'fr',
  accessibility: {
    largeText: false,
    highContrast: false,
    reduceMotion: false,
    announceDepartures: true,
    hapticFeedback: true,
  },
  enabledTransportModes: [...TRANSPORT_MODES],
  preferencesHydrated: false,

  setLocale: (locale) => {
    set({ locale });
    persistState(get());
  },

  updateAccessibility: (settings) => {
    set((state) => ({
      accessibility: { ...state.accessibility, ...settings },
    }));
    persistState(get());
  },

  toggleTransportMode: (mode) => {
    set((state) => {
      const enabled = new Set(state.enabledTransportModes);
      if (enabled.has(mode)) {
        if (enabled.size <= 1) return state;
        enabled.delete(mode);
      } else {
        enabled.add(mode);
      }
      return { enabledTransportModes: [...enabled] as TransportMode[] };
    });
    persistState(get());
  },

  hydrateFromStorage: async () => {
    const prefs = await loadAppPreferences();
    if (!prefs) {
      set({ preferencesHydrated: true });
      return;
    }

    set({
      locale: prefs.locale ?? get().locale,
      accessibility: prefs.accessibility
        ? { ...get().accessibility, ...prefs.accessibility }
        : get().accessibility,
      enabledTransportModes:
        prefs.enabledTransportModes?.filter(isTransportMode).length
          ? prefs.enabledTransportModes.filter(isTransportMode)
          : get().enabledTransportModes,
      preferencesHydrated: true,
    });
  },
}));
