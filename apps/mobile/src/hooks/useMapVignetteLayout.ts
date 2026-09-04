import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Zone de fondu : s'étend du bord du cercle clair jusqu'aux coins de l'écran. */
const FADE_WIDTH_RATIO = 1.35;

export function useMapVignetteLayout(bottomClearance: number) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const topClearance = insets.top + 48;
    const availableHeight = height - topClearance - bottomClearance - insets.bottom;
    const clearDiameter = Math.min(width * 0.9, availableHeight * 0.86);
    const clearRadius = clearDiameter / 2;
    const centerX = width / 2;
    const centerY = topClearance + availableHeight / 2;
    const maxRadius = Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(width - centerX, centerY),
      Math.hypot(centerX, height - centerY),
      Math.hypot(width - centerX, height - centerY)
    );
    const fadeToEdge = Math.max(0, maxRadius - clearRadius);
    const fadeWidth = Math.max(clearRadius * FADE_WIDTH_RATIO, fadeToEdge);

    return { width, height, clearRadius, fadeWidth, centerX, centerY };
  }, [width, height, insets.top, insets.bottom, bottomClearance]);
}
