import { View, StyleSheet, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { AppViewStyle } from '../types/styles';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: AppViewStyle;
  intensity?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function GlassPanel({
  children,
  style,
  intensity = 40,
  onPress,
  accessibilityLabel,
}: GlassPanelProps) {
  const content = (
    <View style={[styles.inner, style]}>
      {Platform.OS === 'ios' ? (
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={intensity} tint="dark" />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidFallback]} />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }: { pressed: boolean }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  inner: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  androidFallback: {
    backgroundColor: colors.surfaceGlass,
  },
  content: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
});
