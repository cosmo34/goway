import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius, darkColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';

/** Verre sombre des contrôles carte (+/−, recentrer) — indépendant du thème clair/sombre. */
export const MAP_CHROME_TINT = 'rgba(12, 16, 24, 0.88)';
export const MAP_CHROME_BORDER = 'rgba(255, 255, 255, 0.12)';
/** Overlay plus léger pour les menus flottants (horaire, modes). */
export const MAP_CHROME_SOFT_TINT = 'rgba(15, 20, 28, 0.55)';

interface MapGlassBackgroundProps {
  /** `mapChrome` = contrôles carte ; `dark` = feuille sombre même en thème clair ; `mapChromeSoft` = popup léger */
  variant?: 'theme' | 'mapChrome' | 'mapChromeSoft' | 'dark';
}

export function MapGlassBackground({ variant = 'theme' }: MapGlassBackgroundProps) {
  const { colors, isDark } = useTheme();

  if (variant === 'mapChrome' || variant === 'mapChromeSoft') {
    const soft = variant === 'mapChromeSoft';
    return (
      <>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={soft ? 22 : 48}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: soft ? MAP_CHROME_SOFT_TINT : MAP_CHROME_TINT },
          ]}
        />
      </>
    );
  }

  const useDarkGlass = variant === 'dark' || isDark;

  return (
    <>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={useDarkGlass ? 28 : 48}
          tint={useDarkGlass ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
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
  /** Menus flottants (horaire, modes) — plus transparents, coins très arrondis. */
  mapChromePopup: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
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
