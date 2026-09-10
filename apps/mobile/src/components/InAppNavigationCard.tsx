import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';
import type { NavigationStep } from '../services/routing/navigationSteps';
import { haversineMeters } from '../utils/geo';
import type { Coordinates } from '../stores/transitStore';

interface InAppNavigationCardProps {
  step: NavigationStep;
  steps: NavigationStep[];
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
  steps,
  stepIndex,
  totalSteps,
  userLocation,
  onStop,
}: InAppNavigationCardProps) {
  const { t } = useTranslation();
  const distanceMeters = userLocation ? Math.round(haversineMeters(userLocation, step.to)) : null;
  const isArrived = step.kind === 'arrive';
  const accentColor = step.kind === 'transit' ? step.lineColor ?? colors.accent : colors.accent;
  const upcoming = steps.slice(stepIndex, Math.min(steps.length, stepIndex + 4));

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground variant="dark" />

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
        </View>

        {upcoming.length > 1 ? (
          <ScrollView
            style={styles.stepsList}
            contentContainerStyle={styles.stepsListContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {upcoming.map((item, offset) => {
              const absoluteIndex = stepIndex + offset;
              const isCurrent = offset === 0;
              const itemColor =
                item.kind === 'transit' ? item.lineColor ?? colors.accent : colors.accent;
              return (
                <View
                  key={item.id}
                  style={[styles.stepRow, isCurrent && styles.stepRowCurrent]}
                >
                  <View style={[styles.stepDot, { backgroundColor: itemColor }]} />
                  <View style={styles.stepRowText}>
                    <Text
                      style={[styles.stepRowTitle, isCurrent && styles.stepRowTitleCurrent]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.stepRowSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <Text style={styles.stepRowIndex}>{absoluteIndex + 1}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {!isArrived ? (
          <Text style={styles.autoAdvanceHint}>{t('map.navigationAutoAdvance')}</Text>
        ) : null}

        {isArrived ? (
          <Pressable
            style={styles.actionButton}
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel={t('map.finishNavigation')}
          >
            <MapGlassBackground variant="dark" />
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
    maxHeight: 280,
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
  stepsList: {
    maxHeight: 118,
    marginTop: 2,
  },
  stepsListContent: {
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stepRowCurrent: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepRowText: {
    flex: 1,
    gap: 1,
  },
  stepRowTitle: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  stepRowTitleCurrent: {
    color: colors.textPrimary,
  },
  stepRowSubtitle: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    fontSize: 11,
  },
  stepRowIndex: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    fontWeight: '600',
    minWidth: 14,
    textAlign: 'right',
  },
  autoAdvanceHint: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginTop: 2,
    paddingHorizontal: spacing.xs,
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
