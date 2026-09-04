import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';
import type { NavigationStep } from '../services/routing/navigationSteps';
import { haversineMeters } from '../utils/geo';
import type { Coordinates } from '../stores/transitStore';

interface InAppNavigationCardProps {
  step: NavigationStep;
  stepIndex: number;
  totalSteps: number;
  userLocation?: Coordinates | null;
  onStop: () => void;
}

function stepIcon(step: NavigationStep, isArrived: boolean): keyof typeof Ionicons.glyphMap {
  if (isArrived) return 'flag-outline';
  if (step.kind === 'transit') return 'bus-outline';
  return 'walk-outline';
}

export function InAppNavigationCard({
  step,
  stepIndex,
  totalSteps,
  userLocation,
  onStop,
}: InAppNavigationCardProps) {
  const { t } = useTranslation();
  const distanceMeters = userLocation ? Math.round(haversineMeters(userLocation, step.to)) : null;
  const isArrived = step.kind === 'arrive';
  const accentColor = step.kind === 'transit' ? step.lineColor ?? colors.accent : colors.accent;

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground />

        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Ionicons name={stepIcon(step, isArrived)} size={14} color={accentColor} />
            <Text style={styles.stepCounter}>
              {t('map.navigationStep', { current: stepIndex + 1, total: totalSteps })}
            </Text>
          </View>
          <Pressable onPress={onStop} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {step.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {step.subtitle}
          </Text>
          {distanceMeters != null && !isArrived ? (
            <Text style={styles.distance}>
              {t('map.distanceRemaining', { meters: distanceMeters })}
            </Text>
          ) : null}
          {!isArrived ? (
            <Text style={styles.autoAdvanceHint}>{t('map.navigationAutoAdvance')}</Text>
          ) : null}
        </View>

        {isArrived ? (
          <Pressable
            style={styles.actionButton}
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel={t('map.finishNavigation')}
          >
            <MapGlassBackground />
            <Text style={styles.actionButtonText}>{t('map.finishNavigation')}</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.md,
  },
  sheet: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepCounter: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  title: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    lineHeight: 18,
  },
  subtitle: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  distance: {
    ...typography.labelSmall,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  autoAdvanceHint: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 9,
    marginTop: 2,
  },
  actionButtonText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
