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
}

export function MapControlButton({
  icon,
  onPress,
  active,
  accessibilityLabel,
}: MapControlButtonProps) {
  return (
    <View style={[styles.circle, active && styles.circleActive]}>
      {Platform.OS === 'ios' ? (
        <View style={styles.fill}>
          <BlurView intensity={32} tint="dark" />
        </View>
      ) : null}
      <View style={[styles.fill, styles.tint]} />
      <Pressable
        onPress={onPress}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true, radius: SIZE / 2 }}
      >
        <Ionicons
          name={icon}
          size={20}
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
  hit: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
