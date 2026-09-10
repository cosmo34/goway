/**
 * Design system GOWAY — tokens dark / light
 */

export const darkColors = {
  background: '#0D1117',
  surface: '#151B24',
  surfaceElevated: '#1A2230',
  surfaceGlass: 'rgba(21, 27, 36, 0.88)',

  mapOverlay: 'rgba(13, 17, 23, 0.4)',
  mapRoute: '#2DD4BF',
  mapRouteGlow: 'rgba(45, 212, 191, 0.35)',
  mapRouteActive: '#5EEAD4',
  mapPoi: '#FACC15',
  mapPoiStroke: '#FDE68A',
  mapStop: '#38BDF8',
  mapStopStroke: '#0EA5E9',
  mapVehicle: '#2DD4BF',

  textPrimary: '#F0F4F8',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textInverse: '#0D1117',

  accent: '#2DD4BF',
  accentDark: '#14B8A6',
  accentMuted: 'rgba(45, 212, 191, 0.15)',
  accentGlow: 'rgba(45, 212, 191, 0.45)',

  tram: '#2DD4BF',
  bus: '#38BDF8',
  tramBus: '#A78BFA',
  walk: '#94A3B8',

  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  realtime: '#2DD4BF',

  border: 'rgba(255, 255, 255, 0.08)',
  borderFocus: 'rgba(45, 212, 191, 0.5)',

  focusRing: '#5EEAD4',
  highContrastText: '#FFFFFF',
  highContrastBg: '#000000',

  glassTint: 'rgba(14, 14, 16, 0.42)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  blurFallback: 'rgba(21, 27, 36, 0.22)',
  chipPressed: 'rgba(45, 212, 191, 0.12)',
} as const;

export const lightColors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.86)',

  mapOverlay: 'rgba(244, 247, 251, 0.35)',
  mapRoute: '#0D9488',
  mapRouteGlow: 'rgba(13, 148, 136, 0.28)',
  mapRouteActive: '#14B8A6',
  mapPoi: '#CA8A04',
  mapPoiStroke: '#EAB308',
  mapStop: '#0284C7',
  mapStopStroke: '#0369A1',
  mapVehicle: '#0D9488',

  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textInverse: '#F8FAFC',

  accent: '#0D9488',
  accentDark: '#0F766E',
  accentMuted: 'rgba(13, 148, 136, 0.12)',
  accentGlow: 'rgba(13, 148, 136, 0.28)',

  tram: '#0D9488',
  bus: '#0284C7',
  tramBus: '#7C3AED',
  walk: '#64748B',

  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  realtime: '#0D9488',

  border: 'rgba(15, 23, 42, 0.1)',
  borderFocus: 'rgba(13, 148, 136, 0.45)',

  focusRing: '#14B8A6',
  highContrastText: '#FFFFFF',
  highContrastBg: '#0F172A',

  glassTint: 'rgba(255, 255, 255, 0.14)',
  glassBorder: 'rgba(15, 23, 42, 0.1)',
  blurFallback: 'rgba(255, 255, 255, 0.18)',
  chipPressed: 'rgba(13, 148, 136, 0.1)',
} as const;

export type AppColors = { readonly [K in keyof typeof darkColors]: string };
export type ColorToken = keyof typeof darkColors;

/** Compat : défaut sombre (écrans non migrés). */
export const colors: AppColors = { ...darkColors };

export function colorsForScheme(scheme: 'light' | 'dark'): AppColors {
  return scheme === 'light' ? lightColors : darkColors;
}
