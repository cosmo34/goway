import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';

interface NoRouteFoundCardProps {
  destinationLabel?: string | null;
  onClose: () => void;
}

export function NoRouteFoundCard({ destinationLabel, onClose }: NoRouteFoundCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground />

        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.accent} />
            <Text style={styles.title} numberOfLines={1}>
              {destinationLabel ?? t('map.noRouteFound')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.hint}>{t('map.noRouteFoundHint')}</Text>

        <Pressable
          style={styles.actionButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <MapGlassBackground />
          <Text style={styles.actionButtonText}>{t('common.close')}</Text>
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
  hint: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    lineHeight: 16,
    paddingHorizontal: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
