import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { spacing, typography } from '../theme';
import { useThemeColors } from '../theme/ThemeContext';
import type { Departure } from '../stores/transitStore';

interface DepartureChipProps {
  departure: Departure;
  size?: 'default' | 'compact';
}

const COMPACT_SCALE = 0.85;

export function DepartureChip({ departure, size = 'default' }: DepartureChipProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const time = departure.realtimeTime ?? departure.scheduledTime;
  const minutesUntil = Math.max(0, Math.round((time.getTime() - Date.now()) / 60_000));
  const compact = size === 'compact';

  return (
    <View style={[mapGlassSurfaceStyles.panel, styles.chip, compact && styles.chipCompact]}>
      <MapGlassBackground />
      <Text style={[styles.chipText, compact && styles.chipTextCompact]}>
        {minutesUntil}
        <Text style={[styles.chipUnit, compact && styles.chipUnitCompact]}> {t('common.min')}</Text>
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    chipCompact: {
      paddingHorizontal: Math.round(spacing.md * COMPACT_SCALE),
      paddingVertical: Math.round((spacing.sm + 2) * COMPACT_SCALE),
    },
    chipText: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
      fontWeight: '700',
      zIndex: 1,
    },
    chipTextCompact: {
      fontSize: Math.round(typography.bodyMedium.fontSize * COMPACT_SCALE),
      lineHeight: Math.round(typography.bodyMedium.lineHeight * COMPACT_SCALE),
    },
    chipUnit: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    chipUnitCompact: {
      fontSize: Math.round(12 * COMPACT_SCALE),
    },
  });
}
