import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography } from '../theme';
import { weatherIconName, weatherLabel, type MapWeather } from '../services/weather/weatherService';
import { MAP_CHROME_BORDER, MAP_CHROME_TINT, mapChromeText } from './MapGlassSurface';

const SIZE = Math.round(56 * 1.1); // +10 % vs. ancienne taille (56)
const RADIUS = SIZE / 2;

/** Exposé pour positionner les contrôles voisins (toggle Carte/Chat). */
export const MAP_WEATHER_WIDGET_SIZE = SIZE;

interface MapWeatherWidgetProps {
  top: number;
  left: number;
  weather: MapWeather | null;
  loading?: boolean;
}

export function MapWeatherWidget({ top, left, weather, loading }: MapWeatherWidgetProps) {
  const icon = weather ? weatherIconName(weather.weatherCode, weather.isDay) : 'cloud-outline';
  const label = weather ? weatherLabel(weather.weatherCode, weather.isDay) : '—';

  return (
    <View
      style={[styles.wrapper, { top, left }]}
      accessibilityRole="text"
      accessibilityLabel={
        weather
          ? `Météo locale, ${weather.temperature} degrés, ${label}`
          : 'Météo locale, chargement'
      }
    >
      {Platform.OS === 'ios' ? (
        <View style={styles.blurWrap}>
          <BlurView intensity={32} tint="dark" />
        </View>
      ) : null}
      <View style={styles.tint} />

      <View style={styles.content}>
        {loading && !weather ? (
          <ActivityIndicator size="small" color={mapChromeText.accent} />
        ) : (
          <>
            <Ionicons name={icon} size={18} color={mapChromeText.accent} />
            <Text style={styles.temperature}>
              {weather != null ? `${weather.temperature}°` : '—'}
            </Text>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
    zIndex: 30,
    elevation: 30,
  },
  blurWrap: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    backgroundColor: MAP_CHROME_TINT,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    gap: 1,
    zIndex: 1,
  },
  temperature: {
    ...typography.labelLarge,
    color: mapChromeText.primary,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 15,
  },
  label: {
    ...typography.labelSmall,
    color: mapChromeText.tertiary,
    fontSize: 8,
    lineHeight: 10,
    textAlign: 'center',
  },
});
