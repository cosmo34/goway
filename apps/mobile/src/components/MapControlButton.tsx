import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import { colors, radius } from '../theme';

interface MapControlButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel: string;
}

export function MapControlButton({
  icon,
  onPress,
  active,
  accessibilityLabel,
}: MapControlButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {Platform.OS === 'ios' ? (
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={32} tint="dark" />
        </View>
      ) : null}
      <View style={styles.buttonTint} />
      <Ionicons name={icon} size={20} color={active ? colors.accent : colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonActive: {
    borderColor: colors.accent,
  },
  buttonTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 20, 28, 0.75)',
  },
});
