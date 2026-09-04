import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

interface MapRecenterButtonProps {
  onPress: () => void;
  bottomOffset?: number;
  accessibilityLabel: string;
}

export function MapRecenterButton({
  onPress,
  bottomOffset = 120,
  accessibilityLabel,
}: MapRecenterButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, { bottom: bottomOffset }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="locate" size={22} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
});
