import { useEffect, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';
import { regionCenter } from '../utils/mapRegion';
import { fetchMapWeather, type MapWeather } from '../services/weather/weatherService';

const DEBOUNCE_MS = 500;
const REFRESH_MS = 10 * 60_000;
/** ~1 km — ignore les micro-mouvements de caméra. */
const COORD_PRECISION = 2;

function coordKey(lat: number, lon: number) {
  return `${lat.toFixed(COORD_PRECISION)},${lon.toFixed(COORD_PRECISION)}`;
}

export function useMapWeather(region: Region) {
  const [weather, setWeather] = useState<MapWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const lastKey = useRef<string | null>(null);
  const weatherRef = useRef<MapWeather | null>(null);
  const regionRef = useRef(region);
  regionRef.current = region;
  weatherRef.current = weather;

  const centerKey = coordKey(region.latitude, region.longitude);

  useEffect(() => {
    // Même cellule : ne relance pas (sinon le debounce est sans cesse annulé par la caméra).
    if (centerKey === lastKey.current) {
      setLoading(false);
      return;
    }

    const currentSeq = ++seq.current;
    const timer = setTimeout(async () => {
      const center = regionCenter(regionRef.current);
      const key = coordKey(center.latitude, center.longitude);
      if (key === lastKey.current) {
        setLoading(false);
        return;
      }

      if (!weatherRef.current) setLoading(true);

      try {
        const data = await fetchMapWeather(center.latitude, center.longitude);
        if (currentSeq !== seq.current) return;
        lastKey.current = key;
        weatherRef.current = data;
        setWeather(data);
      } catch {
        if (currentSeq === seq.current && !weatherRef.current) {
          setWeather(null);
        }
      } finally {
        if (currentSeq === seq.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [centerKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const center = regionCenter(regionRef.current);
      fetchMapWeather(center.latitude, center.longitude)
        .then((data) => {
          lastKey.current = coordKey(center.latitude, center.longitude);
          weatherRef.current = data;
          setWeather(data);
          setLoading(false);
        })
        .catch(() => undefined);
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, []);

  return { weather, loading };
}
