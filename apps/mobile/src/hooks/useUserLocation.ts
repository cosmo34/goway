import { useEffect, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import type { Coordinates } from '../stores/transitStore';
import { normalizeUserCoordinates } from '../utils/location';

export function useUserLocation(watch = true, highAccuracy = false) {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyPosition = useCallback((coords: Coordinates) => {
    const normalized = normalizeUserCoordinates(coords);
    setLocation(normalized);
    return normalized;
  }, []);

  const refresh = useCallback(async (): Promise<Coordinates | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionGranted(status === 'granted');
      if (status !== 'granted') return null;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      return applyPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyPosition]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!watch || !permissionGranted) return;

    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      {
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
        distanceInterval: highAccuracy ? 5 : 25,
        timeInterval: highAccuracy ? 1_500 : 10_000,
      },
      (pos) => {
        applyPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      }
    ).then((sub) => {
      subscription = sub;
    });

    return () => subscription?.remove();
  }, [watch, permissionGranted, applyPosition, highAccuracy]);

  return { location, permissionGranted, loading, refresh };
}
