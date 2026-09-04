import { useEffect, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';
import { regionCenter } from '../utils/mapRegion';
import { fetchMapWeather, type MapWeather } from '../services/weather/weatherService';

const DEBOUNCE_MS = 450;
const REFRESH_MS = 10 * 60_000;
const COORD_PRECISION = 2;

function coordKey(lat: number, lon: number) {
  return `${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
}

export function useMapWeather(region: Region) {
  const [weather, setWeather] = useState<MapWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const center = regionCenter(region);
    const key = coordKey(center.latitude, center.longitude);

    const currentSeq = ++seq.current;
    const timer = setTimeout(async () => {
      const locationChanged = key !== lastKey.current;
      if (locationChanged) {
        setLoading(true);
      }

      try {
        const data = await fetchMapWeather(center.latitude, center.longitude);
        if (currentSeq !== seq.current) return;
        lastKey.current = key;
        setWeather(data);
      } catch {
        if (currentSeq === seq.current && locationChanged) {
          setWeather(null);
        }
      } finally {
        if (currentSeq === seq.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  useEffect(() => {
    const timer = setInterval(() => {
      const center = regionCenter(region);
      fetchMapWeather(center.latitude, center.longitude)
        .then((data) => setWeather(data))
        .catch(() => undefined);
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [region.latitude, region.longitude]);

  return { weather, loading };
}
