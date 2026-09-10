import { type ComponentType } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import type { AppViewStyle } from '../types/styles';
import { useTheme } from '../theme/ThemeContext';

type BlurTint = 'systemUltraThinMaterialDark' | 'systemUltraThinMaterialLight';

const BlurBackdrop = BlurView as unknown as ComponentType<{
  intensity: number;
  tint: BlurTint;
  style: typeof StyleSheet.absoluteFill;
}>;

const MAX_BLUR_INTENSITY = 19;
const VERTICAL_BAND_COUNT = 56;
const VERTICAL_FEATHER_POWER = 2.55;
const BAND_OVERLAP_PERCENT = 22;

export type BlurFadeDirection = 'towardBottom' | 'towardTop';

interface BlurBandLayout {
  key: string;
  style: AppViewStyle;
  intensity: number;
  opacity: number;
}

interface MapBlurBackdropProps {
  fadeDirection: BlurFadeDirection;
  bleed?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

function buildVerticalFadeBands(direction: BlurFadeDirection): BlurBandLayout[] {
  const bandHeight = 100 / VERTICAL_BAND_COUNT;

  return Array.from({ length: VERTICAL_BAND_COUNT }, (_, index) => {
    const y = (index + 0.5) / VERTICAL_BAND_COUNT;
    const fade =
      direction === 'towardBottom'
        ? (1 - y) ** VERTICAL_FEATHER_POWER
        : y ** VERTICAL_FEATHER_POWER;
    const intensity = Math.round(MAX_BLUR_INTENSITY * fade);
    const opacity = fade ** 1.75;

    return {
      key: `v-${index}`,
      style: {
        top: `${(index / VERTICAL_BAND_COUNT) * 100}%`,
        height: `${bandHeight + BAND_OVERLAP_PERCENT}%`,
        left: '0%',
        right: '0%',
      },
      intensity,
      opacity,
    };
  }).filter((band) => band.opacity > 0.025);
}

export function MapBlurBackdrop({ fadeDirection, bleed }: MapBlurBackdropProps) {
  const { colors, isDark } = useTheme();
  const tint: BlurTint = isDark
    ? 'systemUltraThinMaterialDark'
    : 'systemUltraThinMaterialLight';

  if (Platform.OS !== 'ios') {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.blurFallback }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.backdropBleed,
        bleed?.top != null && { top: bleed.top },
        bleed?.bottom != null && { bottom: bleed.bottom },
        bleed?.left != null && { left: bleed.left },
        bleed?.right != null && { right: bleed.right },
      ]}
      pointerEvents="none"
    >
      {buildVerticalFadeBands(fadeDirection).map((band) => (
        <View
          key={band.key}
          style={[styles.blurBand, band.style, { opacity: band.opacity }]}
        >
          <BlurBackdrop
            intensity={Math.max(1, band.intensity)}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdropBleed: {
    ...StyleSheet.absoluteFill,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  blurBand: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
