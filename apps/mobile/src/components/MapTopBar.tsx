import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import {
  mapGlassSurfaceStyles,
  mapChromeText,
} from './MapGlassSurface';
import { AppMenuButton } from './AppMenuButton';
import { spacing, typography } from '../theme';
import { weatherIconName, type MapWeather } from '../services/weather/weatherService';

/** Arrondis plus doux. */
const TOP_BAR_RADIUS = 29;
/** Opacité cible de la bulle haute. */
const TOP_BAR_TINT = 'rgba(12, 16, 24, 0.50)';

interface MapTopBarProps {
  top: number;
  weather: MapWeather | null;
  weatherLoading?: boolean;
  onRecenter?: () => void;
  onOpenLayers?: () => void;
  layersActive?: boolean;
  /** Trajet planifié enregistré (icône jusqu’au départ). */
  savedTripLabel?: string | null;
  savedTripUrgent?: boolean;
  onOpenSavedTrip?: () => void;
  onRemoveSavedTrip?: () => void;
  removeSavedTripLabel?: string;
}

/**
 * Bulle haute : même largeur que la recherche — météo + trajet sauvé + calques / menu.
 */
export function MapTopBar({
  top,
  weather,
  weatherLoading,
  onRecenter,
  onOpenLayers,
  layersActive,
  savedTripLabel,
  savedTripUrgent,
  onOpenSavedTrip,
  onRemoveSavedTrip,
  removeSavedTripLabel,
}: MapTopBarProps) {
  const styles = useMemo(() => createStyles(), []);
  const icon = weather ? weatherIconName(weather.weatherCode, weather.isDay) : 'cloud-outline';

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.bar]}>
        <View style={styles.glassClip} pointerEvents="none">
          {Platform.OS === 'ios' ? (
            <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: TOP_BAR_TINT }]} />
        </View>

        <View
          style={styles.weather}
          accessibilityRole="text"
          accessibilityLabel={
            weather
              ? `Météo locale, ${weather.temperature} degrés`
              : 'Météo locale, chargement'
          }
        >
          {weatherLoading && !weather ? (
            <ActivityIndicator size="small" color={mapChromeText.accent} />
          ) : (
            <>
              <Ionicons name={icon} size={16} color={mapChromeText.accent} />
              <Text style={styles.temp}>
                {weather != null ? `${weather.temperature}°` : '—'}
              </Text>
            </>
          )}
        </View>

        {savedTripLabel && onOpenSavedTrip ? (
          <View style={[styles.savedTrip, savedTripUrgent && styles.savedTripUrgent]}>
            <Pressable
              onPress={onOpenSavedTrip}
              style={styles.savedTripMain}
              accessibilityRole="button"
              accessibilityLabel={savedTripLabel}
              hitSlop={4}
            >
              <Ionicons
                name={savedTripUrgent ? 'alarm-outline' : 'bookmark'}
                size={15}
                color={savedTripUrgent ? '#FBBF24' : mapChromeText.accent}
              />
              <Text style={styles.savedTripText} numberOfLines={1}>
                {savedTripLabel}
              </Text>
            </Pressable>
            {onRemoveSavedTrip ? (
              <Pressable
                onPress={onRemoveSavedTrip}
                style={styles.savedTripRemove}
                accessibilityRole="button"
                accessibilityLabel={removeSavedTripLabel ?? 'Supprimer'}
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color={mapChromeText.secondary} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.actions}>
          <AppMenuButton
            embedded
            top={top}
            onRecenter={onRecenter}
            onOpenLayers={onOpenLayers}
            layersActive={layersActive}
          />
        </View>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 30,
      elevation: 30,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: TOP_BAR_RADIUS,
      overflow: 'hidden',
      minHeight: 48,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingVertical: spacing.xs + 2,
      gap: spacing.sm,
      // Pas de background ici : la teinte 0,50 est uniquement dans glassClip
      // (sinon double couche → trop opaque).
      backgroundColor: 'transparent',
    },
    glassClip: {
      ...StyleSheet.absoluteFill,
      borderRadius: TOP_BAR_RADIUS,
      overflow: 'hidden',
    },
    weather: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      zIndex: 1,
      minWidth: 44,
    },
    temp: {
      ...typography.labelMedium,
      color: mapChromeText.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    spacer: {
      flex: 1,
      zIndex: 1,
    },
    savedTrip: {
      flex: 1,
      zIndex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 0,
      paddingLeft: 8,
      paddingRight: 4,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: 'rgba(45, 212, 191, 0.12)',
    },
    savedTripUrgent: {
      backgroundColor: 'rgba(251, 191, 36, 0.16)',
    },
    savedTripMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      paddingVertical: 2,
    },
    savedTripText: {
      ...typography.labelMedium,
      flexShrink: 1,
      color: mapChromeText.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    savedTripRemove: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    actions: {
      zIndex: 1,
      flexShrink: 0,
    },
  });
}
