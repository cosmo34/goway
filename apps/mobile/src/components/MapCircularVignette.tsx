import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors } from '../theme';

const BG = colors.background;

interface MapCircularVignetteProps {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  clearRadius: number;
  fadeWidth: number;
}

/**
 * Cercle clair au centre, dégradé radial progressif vers le noir à l'extérieur.
 */
export function MapCircularVignette({
  width,
  height,
  centerX,
  centerY,
  clearRadius,
  fadeWidth,
}: MapCircularVignetteProps) {
  if (width <= 0 || height <= 0) return null;

  const maxRadius = Math.max(
    Math.hypot(centerX, centerY),
    Math.hypot(width - centerX, centerY),
    Math.hypot(centerX, height - centerY),
    Math.hypot(width - centerX, height - centerY)
  );

  const clearStop = clearRadius / maxRadius;
  const fadeEnd = Math.min(1, (clearRadius + fadeWidth) / maxRadius);
  const span = Math.max(0.001, fadeEnd - clearStop);

  const at = (ratio: number) => clearStop + span * ratio;

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id="gowayMapVignette"
            cx={centerX}
            cy={centerY}
            r={maxRadius}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={BG} stopOpacity={0} />
            <Stop offset={String(clearStop)} stopColor={BG} stopOpacity={0} />
            <Stop offset={String(at(0.1))} stopColor={BG} stopOpacity={0.12} />
            <Stop offset={String(at(0.22))} stopColor={BG} stopOpacity={0.28} />
            <Stop offset={String(at(0.36))} stopColor={BG} stopOpacity={0.45} />
            <Stop offset={String(at(0.5))} stopColor={BG} stopOpacity={0.62} />
            <Stop offset={String(at(0.64))} stopColor={BG} stopOpacity={0.76} />
            <Stop offset={String(at(0.78))} stopColor={BG} stopOpacity={0.88} />
            <Stop offset={String(at(0.9))} stopColor={BG} stopOpacity={0.96} />
            <Stop offset={String(fadeEnd)} stopColor={BG} stopOpacity={1} />
            <Stop offset="1" stopColor={BG} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#gowayMapVignette)" />
      </Svg>
    </View>
  );
}
