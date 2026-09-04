export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadows = {
  // Pas d'ombres lourdes — style flat avec bordures subtiles
  sheet: {
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
} as const;
