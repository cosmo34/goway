import type { ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius } from '../theme';
import type { AppViewStyle } from '../types/styles';

interface GlassCardProps {
  children: ReactNode;
  style?: AppViewStyle;
  intensity?: number;
}

export function GlassCard({ children, style, intensity = 36 }: GlassCardProps) {
  return (
    <View style={[styles.card, style]}>
      {Platform.OS === 'ios' ? (
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={intensity} tint="dark" />
        </View>
      ) : null}
      <View style={styles.tint} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 20, 28, 0.72)',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
