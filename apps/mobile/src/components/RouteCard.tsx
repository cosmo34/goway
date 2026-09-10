import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, radius } from '../theme';
import type { Route } from '../stores/transitStore';
import { LEG_ARRIVAL_LABEL, LEG_ORIGIN_LABEL } from '../services/routing/navigationSteps';
import { notificationService } from '../services/notifications/notificationService';
import { liveActivityService } from '../services/liveActivity/liveActivityService';
import { useTransitStore } from '../stores/transitStore';

interface RouteCardProps {
  route: Route;
}

function formatLegEndpoint(name: string, t: (key: string) => string): string {
  if (name === LEG_ORIGIN_LABEL) return t('common.departure');
  if (name === LEG_ARRIVAL_LABEL) return t('common.arrival');
  return name;
}

export function RouteCard({ route }: RouteCardProps) {
  const { t } = useTranslation();
  const [reminderSet, setReminderSet] = useState(false);
  const [loading, setLoading] = useState(false);
  const setTripReminder = useTransitStore((s) => s.setTripReminder);

  const transitLeg = route.legs.find((l) => l.mode !== 'walk');
  const walkLeg = route.legs.find((l) => l.mode === 'walk');

  const handleSetReminder = async () => {
    if (!transitLeg) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const reminder = {
      routeId: route.id,
      lineId: transitLeg.lineName ?? 'Ligne',
      stopId: transitLeg.fromStopId ?? '',
      stopName: transitLeg.from,
      departureTime: route.departureTime,
      walkingMinutes: walkLeg?.durationMinutes ?? 5,
      notifyAt: new Date(
        route.departureTime.getTime() - ((walkLeg?.durationMinutes ?? 5) + 2) * 60_000
      ),
      enabled: true,
    };

    const notifId = await notificationService.scheduleDepartureReminder(reminder);
    if (notifId) {
      setTripReminder(reminder);
      setReminderSet(true);

      if (liveActivityService.isSupported()) {
        const minutesUntil = Math.max(
          0,
          Math.round((route.departureTime.getTime() - Date.now()) / 60_000)
        );
        await liveActivityService.start({
          lineName: transitLeg.lineName ?? '',
          lineColor: transitLeg.lineColor ?? colors.accent,
          direction: transitLeg.to,
          minutesUntil,
          stopName: transitLeg.from,
          isRealtime: true,
        });
      }
    }
    setLoading(false);
  };

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.header}>
        <Text style={styles.duration}>{route.totalDurationMinutes}</Text>
        <Text style={styles.durationLabel}>{t('common.min')}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('search.fastestRoute')}</Text>
        </View>
      </View>

      {route.legs.map((leg, index) => (
        <View key={index} style={styles.leg}>
          <View
            style={[
              styles.legDot,
              {
                backgroundColor:
                  leg.mode === 'walk' ? colors.walk : leg.lineColor ?? colors.accent,
              },
            ]}
          />
          <View style={styles.legInfo}>
            <Text style={styles.legTitle}>
              {leg.mode === 'walk'
                ? `${t('common.walk')} — ${leg.durationMinutes} ${t('common.min')}`
                : `${leg.lineName} — ${leg.durationMinutes} ${t('common.min')}`}
            </Text>
            <Text style={styles.legDetail}>
              {formatLegEndpoint(leg.from, t)} → {formatLegEndpoint(leg.to, t)}
            </Text>
          </View>
        </View>
      ))}

      <Pressable
        style={[styles.reminderBtn, reminderSet && styles.reminderBtnActive]}
        onPress={handleSetReminder}
        disabled={loading || reminderSet}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.departureReminder')}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={[styles.reminderText, reminderSet && styles.reminderTextActive]}>
            {reminderSet ? t('notifications.departureReminder') + ' ✓' : t('notifications.departureReminder')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  duration: { ...typography.displayMedium, color: colors.textPrimary },
  durationLabel: { ...typography.bodyMedium, color: colors.textSecondary, flex: 1 },
  badge: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  badgeText: { ...typography.labelSmall, color: colors.accent },
  leg: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  legDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  legInfo: { flex: 1 },
  legTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '500' },
  legDetail: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 2 },
  reminderBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  reminderBtnActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accentMuted,
  },
  reminderText: { ...typography.labelLarge, color: colors.accent },
  reminderTextActive: { color: colors.textSecondary },
});
