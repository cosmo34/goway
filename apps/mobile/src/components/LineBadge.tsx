import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { useThemeColors } from '../theme/ThemeContext';

export function lineBadgeColors(lineColor?: string, accentFallback?: string) {
  const color = lineColor ?? accentFallback ?? '#2DD4BF';
  return {
    backgroundColor: `${color}48`,
    borderColor: `${color}88`,
  };
}

export function formatLineBadgeLabel(lineName?: string, lineShortName?: string): string {
  if (lineShortName) return lineShortName;
  if (!lineName) return '?';
  const stripped = lineName.replace(/^Ligne\s+/i, '').trim();
  const match = stripped.match(/\d+/);
  return match ? match[0] : stripped;
}

interface LineBadgeProps {
  label: string;
  lineColor?: string;
  size?: 'default' | 'large' | 'station';
}

export const STATION_LARGE_SCALE = 0.85;

export function LineBadge({ label, lineColor, size = 'default' }: LineBadgeProps) {
  const colors = useThemeColors();
  const large = size === 'large';
  const station = size === 'station';

  return (
    <View
      style={[
        styles.badge,
        large && styles.badgeLarge,
        station && styles.badgeStation,
        lineBadgeColors(lineColor, colors.accent),
      ]}
    >
      <View
        style={[
          styles.dot,
          large && styles.dotLarge,
          station && styles.dotStation,
          { backgroundColor: lineColor ?? colors.accent },
        ]}
      />
      <Text
        style={[
          styles.text,
          { color: colors.textPrimary },
          large && styles.textLarge,
          station && styles.textStation,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeLarge: {
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeStation: {
    gap: Math.round(8 * STATION_LARGE_SCALE),
    borderRadius: radius.md,
    paddingHorizontal: Math.round(12 * STATION_LARGE_SCALE),
    paddingVertical: Math.round(6 * STATION_LARGE_SCALE),
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotStation: {
    width: Math.round(12 * STATION_LARGE_SCALE),
    height: Math.round(12 * STATION_LARGE_SCALE),
    borderRadius: Math.round(6 * STATION_LARGE_SCALE),
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    maxWidth: 40,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  textLarge: {
    fontSize: 22,
    maxWidth: 80,
  },
  textStation: {
    fontSize: Math.round(22 * STATION_LARGE_SCALE),
    maxWidth: Math.round(80 * STATION_LARGE_SCALE),
  },
});
