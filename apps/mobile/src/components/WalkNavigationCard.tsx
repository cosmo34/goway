import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';
import type { Stop } from '../stores/transitStore';
import { promptWalkingDirections } from '../utils/openDirections';

interface WalkNavigationCardProps {
  stop: Stop;
  walkingMinutes: number;
  onClose: () => void;
}

export function WalkNavigationCard({ stop, walkingMinutes, onClose }: WalkNavigationCardProps) {
  const { t } = useTranslation();

  const handleOpenDirections = () => {
    promptWalkingDirections(stop.coordinates, stop.name, {
      pickerTitle: t('map.directionsPickerTitle'),
      cancel: t('common.cancel'),
      unavailable: t('map.directionsUnavailable'),
      mapsApple: t('map.mapsApple'),
      mapsGoogle: t('map.mapsGoogle'),
      mapsWaze: t('map.mapsWaze'),
      mapsCitymapper: t('map.mapsCitymapper'),
      mapsMoovit: t('map.mapsMoovit'),
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground variant="dark" />

        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Ionicons name="walk-outline" size={14} color={colors.accent} />
            <Text style={styles.title} numberOfLines={1}>
              {t('map.walkToBoardingStop')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.stopName} numberOfLines={2}>
            {stop.name}
          </Text>
          <Text style={styles.duration}>
            {t('map.walkingDuration', { minutes: walkingMinutes })}
          </Text>
        </View>

        <Pressable
          style={styles.actionButton}
          onPress={handleOpenDirections}
          accessibilityRole="button"
          accessibilityLabel={t('map.openWalkingDirections')}
        >
          <MapGlassBackground variant="dark" />
          <Ionicons name="navigate-outline" size={15} color={colors.accent} />
          <Text style={styles.actionButtonText}>{t('map.openWalkingDirections')}</Text>
        </Pressable>
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
  title: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  stopName: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    lineHeight: 18,
  },
  duration: {
    ...typography.labelSmall,
    color: colors.textSecondary,
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
