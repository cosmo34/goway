import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { GlassCard } from './GlassCard';
import { colors, radius, spacing, typography } from '../theme';
import type { Route } from '../stores/transitStore';
import { notificationService } from '../services/notifications/notificationService';
import { liveActivityService } from '../services/liveActivity/liveActivityService';
import { useTransitStore } from '../stores/transitStore';

interface RouteBottomSheetProps {
  route?: Route;
  loading?: boolean;
  bottomInset?: number;
}

export function RouteBottomSheet({ route, loading, bottomInset = 0 }: RouteBottomSheetProps) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const setTripReminder = useTransitStore((s) => s.setTripReminder);

  if (loading || !route) {
    return (
      <View style={[styles.wrapper, { paddingBottom: bottomInset }]}>
        <GlassCard style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>{t('map.planningRoute')}</Text>
          </View>
        </GlassCard>
      </View>
    );
  }

  const transitLeg = route.legs.find((l) => l.mode !== 'walk');
  const walkLeg = route.legs.find((l) => l.mode === 'walk');
  const minutesUntilDeparture = Math.max(
    0,
    Math.round((route.departureTime.getTime() - Date.now()) / 60_000)
  );

  const handleStart = async () => {
    if (!transitLeg) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setStarted(true);

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

    try {
      const notifId = await notificationService.scheduleDepartureReminder(reminder);
      if (notifId) {
        setTripReminder(reminder);

        if (liveActivityService.isSupported()) {
          await liveActivityService.start({
            lineName: transitLeg.lineName ?? '',
            lineColor: transitLeg.lineColor ?? colors.accent,
            direction: transitLeg.to,
            minutesUntil: minutesUntilDeparture,
            stopName: transitLeg.from,
            isRealtime: true,
          });
        }
      }
    } catch {
      // Les notifications sont optionnelles — la navigation marche reste active.
    }

    setActionLoading(false);
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomInset }]}>
      <GlassCard style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.duration}>
              {route.totalDurationMinutes}
              <Text style={styles.durationUnit}> {t('common.min')}</Text>
            </Text>
            <Text style={styles.arrival}>
              {t('map.arrivalAt', {
                time: format(route.arrivalTime, 'HH:mm', { locale: fr }),
              })}
            </Text>
          </View>

          <View style={styles.legChips}>
            {route.legs.map((leg, index) => (
              <View key={index} style={styles.legChipGroup}>
                {leg.mode === 'walk' ? (
                  <View style={styles.walkChip}>
                    <Ionicons name="walk-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.walkChipText}>{leg.durationMinutes}</Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.lineChip,
                      { borderColor: leg.lineColor ?? colors.accent },
                      index === route.legs.findIndex((l) => l.mode !== 'walk') && styles.lineChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.lineChipText,
                        index === route.legs.findIndex((l) => l.mode !== 'walk') && styles.lineChipTextActive,
                      ]}
                    >
                      {leg.lineName ?? 'L'}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {transitLeg ? (
          <Text style={styles.departureInfo}>
            {t('map.departureIn', {
              minutes: minutesUntilDeparture,
              stop: transitLeg.from,
            })}
          </Text>
        ) : null}

        <Pressable
          style={[styles.startButton, started && styles.startButtonDone]}
          onPress={handleStart}
          disabled={actionLoading || started}
          accessibilityRole="button"
          accessibilityLabel={t('map.startNavigation')}
        >
          {actionLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <>
              <Text style={styles.startButtonText}>
                {started ? t('map.navigationActive') : t('map.startNavigation').toUpperCase()}
              </Text>
              {!started ? (
                <Ionicons name="arrow-forward" size={20} color={colors.textInverse} />
              ) : null}
            </>
          )}
        </Pressable>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.lg,
  },
  sheet: {
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  duration: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  durationUnit: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  arrival: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  legChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '50%',
  },
  legChipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  walkChipText: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  lineChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    backgroundColor: 'transparent',
  },
  lineChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  lineChipText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  lineChipTextActive: {
    color: colors.textInverse,
  },
  departureInfo: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  startButtonDone: {
    backgroundColor: colors.accentDark,
  },
  startButtonText: {
    ...typography.labelLarge,
    color: colors.textInverse,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
