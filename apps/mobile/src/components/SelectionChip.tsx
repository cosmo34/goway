import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { spacing, typography } from '../theme';
import { useThemeColors } from '../theme/ThemeContext';
import { useAppStore } from '../stores/appStore';

interface SelectionChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Chip de sélection glass — même finesse que les filtres modes sur la carte. */
export function SelectionChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: SelectionChipProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hapticFeedback = useAppStore((s) => s.accessibility.hapticFeedback);

  return (
    <Pressable
      onPress={() => {
        if (hapticFeedback) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={[mapGlassSurfaceStyles.panel, styles.chip]}>
        <MapGlassBackground />
        <Text style={[styles.text, !selected && styles.textUnselected]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    wrap: {
      flexShrink: 0,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.88,
    },
    text: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
      fontWeight: '600',
      zIndex: 1,
    },
    textUnselected: {
      color: colors.textTertiary,
      fontWeight: '500',
    },
  });
}
