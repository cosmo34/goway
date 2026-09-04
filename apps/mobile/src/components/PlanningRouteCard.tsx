import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, spacing, typography } from '../theme';

export function PlanningRouteCard() {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground />
        <View style={styles.content}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.text}>{t('map.planningRoute')}</Text>
        </View>
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
    paddingVertical: spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  text: {
    ...typography.labelMedium,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
