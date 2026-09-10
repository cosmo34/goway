import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius } from '../theme';
import { useThemeColors } from '../theme/ThemeContext';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { LineBadge, formatLineBadgeLabel } from './LineBadge';
import type { Departure } from '../stores/transitStore';

interface DepartureRowProps {
  departure: Departure;
  accessibilityLargeText?: boolean;
}

/** Ligne d’horaire compacte — même langage visuel que RouteOptionsSheet / DepartureChip. */
export function DepartureRow({ departure, accessibilityLargeText }: DepartureRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const time = departure.realtimeTime ?? departure.scheduledTime;
  const minutesUntil = Math.max(0, Math.round((time.getTime() - Date.now()) / 60_000));
  const clockTime = time.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
  const lineLabel = formatLineBadgeLabel(departure.lineName);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`${departure.lineName}, direction ${departure.direction}, ${minutesUntil} ${t('common.min')}, ${departure.isRealtime ? t('common.realtime') : t('common.scheduled')}`}
    >
      <LineBadge label={lineLabel} lineColor={departure.lineColor} />

      <View style={styles.info}>
        <Text
          style={[styles.direction, accessibilityLargeText && styles.largeText]}
          numberOfLines={1}
        >
          {departure.direction}
        </Text>
        <Text style={styles.clockTime}>{clockTime}</Text>
      </View>

      <View style={[mapGlassSurfaceStyles.panel, styles.timeChip]}>
        <MapGlassBackground />
        <Text style={[styles.minutes, accessibilityLargeText && styles.largeMinutes]}>
          {minutesUntil}
          <Text style={styles.minLabel}> {t('common.min')}</Text>
        </Text>
        {departure.isRealtime ? <View style={styles.realtimeDot} /> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    info: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    direction: {
      ...typography.bodySmall,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    largeText: {
      fontSize: 15,
    },
    clockTime: {
      ...typography.labelSmall,
      color: colors.textTertiary,
    },
    timeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      borderRadius: radius.md,
      flexShrink: 0,
    },
    minutes: {
      ...typography.labelLarge,
      color: colors.textPrimary,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      zIndex: 1,
    },
    largeMinutes: {
      fontSize: 16,
    },
    minLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    realtimeDot: {
      width: 5,
      height: 5,
      borderRadius: radius.full,
      backgroundColor: colors.realtime,
      zIndex: 1,
    },
  });
}
