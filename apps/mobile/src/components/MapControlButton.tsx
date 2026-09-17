import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { darkColors } from '../theme';
import { MAP_CHROME_BORDER, MAP_CHROME_TINT } from './MapGlassSurface';

const SIZE = 44;

interface MapControlButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel: string;
  compact?: boolean;
}

export function MapControlButton({
  icon,
  onPress,
  active,
  accessibilityLabel,
  compact = false,
}: MapControlButtonProps) {
  const size = compact ? 36 : SIZE;
  return (
    <View
      style={[
        styles.circle,
        compact && styles.circleCompact,
        active && styles.circleActive,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {!compact && Platform.OS === 'ios' ? (
        <View style={[styles.fill, { borderRadius: size / 2 }]}>
          <BlurView intensity={32} tint="dark" />
        </View>
      ) : null}
      {!compact ? (
        <View style={[styles.fill, styles.tint, { borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.fill, styles.tintCompact, { borderRadius: size / 2 }]} />
      )}
      <Pressable
        onPress={onPress}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true, radius: size / 2 }}
      >
        <Ionicons
          name={icon}
          size={compact ? 18 : 20}
          color={active ? darkColors.accent : darkColors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
  },
  circleCompact: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circleActive: {
    borderColor: darkColors.accent,
  },
  fill: {
    ...StyleSheet.absoluteFill,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
  },
  tint: {
    backgroundColor: MAP_CHROME_TINT,
  },
  tintCompact: {
    backgroundColor: 'transparent',
  },
  hit: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
