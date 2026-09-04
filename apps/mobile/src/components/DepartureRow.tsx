import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { colors, spacing, typography, radius } from '../theme';
import type { Departure } from '../stores/transitStore';

interface DepartureRowProps {
  departure: Departure;
  accessibilityLargeText?: boolean;
}

export function DepartureRow({ departure, accessibilityLargeText }: DepartureRowProps) {
  const { t } = useTranslation();
  const time = departure.realtimeTime ?? departure.scheduledTime;
  const minutesUntil = Math.max(
    0,
    Math.round((time.getTime() - Date.now()) / 60_000)
  );
  const clockTime = time.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`${departure.lineName}, direction ${departure.direction}, ${minutesUntil} ${t('common.min')}, ${departure.isRealtime ? t('common.realtime') : t('common.scheduled')}`}
    >
      <View style={[styles.lineBadge, { backgroundColor: departure.lineColor }]}>
        <Text style={styles.lineText}>{departure.lineName.replace('Ligne ', '')}</Text>
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.direction, accessibilityLargeText && styles.largeText]}
          numberOfLines={1}
        >
          {departure.direction}
        </Text>
        <Text style={styles.mode}>
          {departure.mode === 'tram'
            ? t('schedules.filterTram')
            : departure.mode === 'bus'
              ? t('schedules.filterBus')
              : t('schedules.filterTramBus')}
        </Text>
      </View>

      <View style={styles.timeBlock}>
        <Text style={[styles.minutes, accessibilityLargeText && styles.largeMinutes]}>
          {minutesUntil}
        </Text>
        <Text style={styles.minLabel}>{t('common.min')}</Text>
        <Text style={styles.clockTime}>{clockTime}</Text>
        {departure.isRealtime && (
          <View style={styles.realtimeDot} accessibilityLabel={t('common.realtime')} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  lineBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  direction: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  largeText: {
    fontSize: 18,
  },
  mode: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  timeBlock: {
    alignItems: 'center',
    minWidth: 48,
  },
  minutes: {
    ...typography.displayMedium,
    fontSize: 28,
    color: colors.textPrimary,
  },
  largeMinutes: {
    fontSize: 36,
  },
  minLabel: {
    ...typography.labelSmall,
    color: colors.textTertiary,
  },
  clockTime: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  realtimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.realtime,
    marginTop: 4,
  },
});
