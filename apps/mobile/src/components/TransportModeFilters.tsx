import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { TRANSPORT_MODES } from '../config/tam';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';

const DOT_SIZE = 18;

export function TransportModeFilters() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  // Sur la carte : blanc en thème clair, noir en thème sombre.
  const idleColor = isDark ? '#0F172A' : '#FFFFFF';
  const accentColor = colors.accent;
  const styles = useMemo(
    () => createStyles(idleColor, accentColor),
    [idleColor, accentColor]
  );
  const enabledTransportModes = useAppStore((s) => s.enabledTransportModes);
  const toggleTransportMode = useAppStore((s) => s.toggleTransportMode);
  const hapticFeedback = useAppStore((s) => s.accessibility.hapticFeedback);

  return (
    <View style={styles.row}>
      {TRANSPORT_MODES.map((mode) => {
        const selected = enabledTransportModes.includes(mode);
        const label = t(`transportModes.${mode}`);

        return (
          <View key={mode} style={styles.item}>
            <Pressable
              onPress={() => {
                if (hapticFeedback) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                toggleTransportMode(mode);
              }}
              style={({ pressed }) => [styles.dotHit, pressed && styles.dotPressed]}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={label}
              accessibilityHint={
                selected
                  ? t('transportModes.deselectHint', { mode: label })
                  : t('transportModes.selectHint', { mode: label })
              }
            >
              <View style={[styles.dot, selected && styles.dotSelected]}>
                {selected ? <View style={styles.dotCore} /> : null}
              </View>
            </Pressable>
            <Text style={styles.label}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(idleColor: string, accentColor: string) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.md,
      marginHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      zIndex: 50,
      elevation: 50,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      zIndex: 50,
    },
    dotHit: {
      width: DOT_SIZE + 4,
      height: DOT_SIZE + 4,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    dotPressed: {
      opacity: 0.7,
    },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      borderWidth: 2,
      borderColor: idleColor,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    dotSelected: {
      borderColor: accentColor,
    },
    dotCore: {
      width: DOT_SIZE - 8,
      height: DOT_SIZE - 8,
      borderRadius: (DOT_SIZE - 8) / 2,
      backgroundColor: accentColor,
    },
    label: {
      ...typography.bodyMedium,
      color: idleColor,
      fontWeight: '700',
      textShadowColor: idleColor === '#FFFFFF' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
  });
}
