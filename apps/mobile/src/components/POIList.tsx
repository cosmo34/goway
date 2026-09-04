import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '../theme';
import type { PointOfInterest } from '../stores/transitStore';

interface POIListProps {
  pois: PointOfInterest[];
}

const CATEGORY_EMOJI: Record<PointOfInterest['category'], string> = {
  restaurant: 'R',
  shop: 'S',
  service: 'S',
  culture: 'C',
};

export function POIList({ pois }: POIListProps) {
  const { t } = useTranslation();

  if (pois.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('poi.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {pois.map((poi) => (
          <View key={poi.id} style={styles.card} accessibilityLabel={`${poi.name}, ${poi.distanceMeters} mètres`}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>{CATEGORY_EMOJI[poi.category]}</Text>
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {poi.name}
            </Text>
            <Text style={styles.distance}>{poi.distanceMeters} m</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.titleSmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    width: 100,
    marginLeft: spacing.lg,
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconText: {
    ...typography.labelLarge,
    color: colors.accent,
  },
  name: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  distance: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
