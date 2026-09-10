import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius, darkColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';

/** Verre sombre des contrôles carte (+/−, recentrer) — indépendant du thème clair/sombre. */
export const MAP_CHROME_TINT = 'rgba(15, 20, 28, 0.75)';
export const MAP_CHROME_BORDER = 'rgba(255, 255, 255, 0.12)';

interface MapGlassBackgroundProps {
  /** `mapChrome` = contrôles carte ; `dark` = feuille sombre même en thème clair */
  variant?: 'theme' | 'mapChrome' | 'dark';
}

export function MapGlassBackground({ variant = 'theme' }: MapGlassBackgroundProps) {
  const { colors, isDark } = useTheme();

  if (variant === 'mapChrome') {
    return (
      <>
        {Platform.OS === 'ios' ? (
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={32} tint="dark" />
          </View>
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: MAP_CHROME_TINT }]} />
      </>
    );
  }

  const useDarkGlass = variant === 'dark' || isDark;

  return (
    <>
      {Platform.OS === 'ios' ? (
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={useDarkGlass ? 28 : 48} tint={useDarkGlass ? 'dark' : 'light'} />
        </View>
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: useDarkGlass ? darkColors.glassTint : colors.glassTint },
        ]}
      />
    </>
  );
}

export const mapGlassSurfaceStyles = StyleSheet.create({
  panel: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  mapChromePanel: {
    borderRadius: radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
});

export function useMapGlassPanelStyle() {
  const { colors } = useTheme();
  return [mapGlassSurfaceStyles.panel, { borderColor: colors.glassBorder }] as const;
}

/** Couleurs de texte pour surfaces mapChrome (toujours sur fond sombre). */
export const mapChromeText = {
  primary: darkColors.textPrimary,
  secondary: darkColors.textSecondary,
  tertiary: darkColors.textTertiary,
  accent: darkColors.accent,
  accentMuted: darkColors.accentMuted,
} as const;
