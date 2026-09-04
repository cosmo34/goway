import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { weatherIconName, weatherLabel, type MapWeather } from '../services/weather/weatherService';

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
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={28} tint="dark" />
        </View>
      ) : null}
      <View style={styles.tint} />

      <View style={styles.content}>
        {loading && !weather ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <>
            <Ionicons name={icon} size={18} color={colors.accent} />
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
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 30,
    elevation: 30,
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 20, 28, 0.78)',
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
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 15,
  },
  label: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    fontSize: 8,
    lineHeight: 10,
    textAlign: 'center',
  },
});
