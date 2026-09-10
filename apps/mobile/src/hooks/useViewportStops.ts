import { useEffect, useRef } from 'react';
import type { Region } from 'react-native-maps';
import type { Stop } from '../stores/transitStore';
import { getStopsInBboxApi } from '../services/api/transitApi';
import { regionToBbox, type MapBbox } from '../utils/mapRegion';

const DEBOUNCE_MS = 280;
const BBOX_PADDING = 0.12;

function expandBbox(bbox: MapBbox, ratio = BBOX_PADDING): MapBbox {
  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east - bbox.west;
  return {
    north: bbox.north + latSpan * ratio,
    south: bbox.south - latSpan * ratio,
    east: bbox.east + lonSpan * ratio,
    west: bbox.west - lonSpan * ratio,
  };
}

function stopInBbox(stop: Stop, bbox: MapBbox): boolean {
  const { latitude, longitude } = stop.coordinates;
  return (
    latitude <= bbox.north &&
    latitude >= bbox.south &&
    longitude <= bbox.east &&
    longitude >= bbox.west
  );
}

function mergeStops(existing: Stop[], incoming: Stop[]): Stop[] {
  const byId = new Map(existing.map((stop) => [stop.id, stop]));
  for (const stop of incoming) {
    byId.set(stop.id, stop);
  }
  return Array.from(byId.values());
}

export function useViewportStops(
  region: Region,
  enabled: boolean,
  onUpdate: (stops: Stop[]) => void
) {
  const seq = useRef(0);
  const stopsRef = useRef<Stop[]>([]);

  useEffect(() => {
    if (!enabled) {
      stopsRef.current = [];
      onUpdate([]);
      return;
    }

    const currentSeq = ++seq.current;
    const timer = setTimeout(async () => {
      const bbox = regionToBbox(region);
      try {
        const fetched = await getStopsInBboxApi(bbox);
        if (currentSeq !== seq.current) return;

        const merged = mergeStops(stopsRef.current, fetched);
        const keepZone = expandBbox(bbox);
        const pruned = merged.filter((stop) => stopInBbox(stop, keepZone));

        stopsRef.current = pruned;
        onUpdate(pruned);
      } catch {
        // Garder les stations déjà chargées si l’API est temporairement indisponible.
        if (currentSeq !== seq.current) return;
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [region, enabled, onUpdate]);

  useEffect(() => {
    if (!enabled) {
      stopsRef.current = [];
    }
  }, [enabled]);
}
