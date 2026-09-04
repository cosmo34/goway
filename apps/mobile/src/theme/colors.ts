/**
 * Design system GOWAY — Navigation sombre, accent teal
 */
export const colors = {
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
} as const;

export type ColorToken = keyof typeof colors;
