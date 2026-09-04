import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  fontFamily,

  // Display — grands chiffres d'horaires
  displayLarge: {
    fontSize: 48,
    fontWeight: '700' as const,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  displayMedium: {
    fontSize: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // Titres
  titleLarge: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  titleMedium: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  titleSmall: { fontSize: 15, fontWeight: '600' as const },

  // Corps
  bodyLarge: { fontSize: 17, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },

  // Labels
  labelLarge: { fontSize: 14, fontWeight: '500' as const, letterSpacing: 0.1 },
  labelMedium: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
  labelSmall: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.3 },

  // Monospace — horaires, codes arrêts
  mono: {
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
} as const;
