import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { TRANSPORT_MODES, type TransportMode } from '../config/tam';
import { useAppStore } from '../stores/appStore';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { colors, spacing, typography } from '../theme';

export function TransportModeFilters() {
  const { t } = useTranslation();
  const enabledTransportModes = useAppStore((s) => s.enabledTransportModes);
  const toggleTransportMode = useAppStore((s) => s.toggleTransportMode);
  const hapticFeedback = useAppStore((s) => s.accessibility.hapticFeedback);

  return (
    <View style={styles.row}>
      {TRANSPORT_MODES.map((mode) => {
        const selected = enabledTransportModes.includes(mode);

        return (
          <Pressable
            key={mode}
            onPress={() => {
              if (hapticFeedback) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              toggleTransportMode(mode);
            }}
            style={({ pressed }) => [styles.chipWrap, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`transportModes.${mode}`)}
            accessibilityHint={
              selected
                ? t('transportModes.deselectHint', { mode: t(`transportModes.${mode}`) })
                : t('transportModes.selectHint', { mode: t(`transportModes.${mode}`) })
            }
          >
            <View style={[mapGlassSurfaceStyles.panel, styles.chip]}>
              <MapGlassBackground />
              <Text style={[styles.chipText, !selected && styles.chipTextUnselected]}>
                {t(`transportModes.${mode}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  chipWrap: {
    flexShrink: 0,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {
    opacity: 0.88,
  },
  chipText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    zIndex: 1,
  },
  chipTextUnselected: {
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
