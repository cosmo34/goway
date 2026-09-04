import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinates, Departure, Stop } from '../stores/transitStore';
import { stopLiveActivityService } from '../services/liveActivity/stopLiveActivityService';
import { ARRIVAL_RADIUS_METERS, haversineMeters } from '../utils/geo';

export interface StopLinePage {
  id: string;
  stop: Stop;
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  departures: Departure[];
}

interface UseStopLiveActivityOptions {
  pages: StopLinePage[];
  currentPage?: StopLinePage;
  userLocation?: Coordinates | null;
  stopsKey: string;
}

const ARRIVAL_GRACE_PERIOD_MS = 15_000;

export function useStopLiveActivity({
  pages,
  currentPage,
  userLocation,
  stopsKey,
}: UseStopLiveActivityOptions) {
  const [trackedPageId, setTrackedPageId] = useState<string | null>(null);
  const [liveActivityEnabled, setLiveActivityEnabled] = useState(false);
  const trackingStartedAtRef = useRef<number | null>(null);

  const trackedPage = useMemo(() => {
    if (!trackedPageId) return null;
    return pages.find((page) => page.id === trackedPageId) ?? null;
  }, [pages, trackedPageId]);

  const tracking = trackedPageId != null && trackedPageId === currentPage?.id;

  const departuresSignature = useMemo(() => {
    if (!trackedPage) return '';
    return trackedPage.departures
      .map((departure) => (departure.realtimeTime ?? departure.scheduledTime).getTime())
      .join(',');
  }, [trackedPage]);

  const stopTracking = useCallback(() => {
    setTrackedPageId(null);
    setLiveActivityEnabled(false);
    trackingStartedAtRef.current = null;
    void stopLiveActivityService.end();
  }, []);

  const toggleTracking = useCallback(async () => {
    if (!currentPage) return;

    if (trackedPageId === currentPage.id) {
      stopTracking();
      return;
    }

    if (trackedPageId != null) return;

    setTrackedPageId(currentPage.id);
    trackingStartedAtRef.current = Date.now();

    const result = await stopLiveActivityService.start(currentPage);
    setLiveActivityEnabled(result.liveActivity);
  }, [currentPage, trackedPageId, stopTracking]);

  useEffect(() => {
    stopTracking();
  }, [stopsKey, stopTracking]);

  useEffect(() => {
    if (!trackedPage) return;
    void stopLiveActivityService.update(trackedPage);
  }, [trackedPage, departuresSignature]);

  useEffect(() => {
    if (!trackedPage) return;

    const timer = setInterval(() => {
      void stopLiveActivityService.update(trackedPage);
    }, 60_000);

    return () => clearInterval(timer);
  }, [trackedPage]);

  useEffect(() => {
    if (!trackedPage || !userLocation) return;

    const startedAt = trackingStartedAtRef.current;
    if (startedAt == null || Date.now() - startedAt < ARRIVAL_GRACE_PERIOD_MS) return;

    const distance = haversineMeters(userLocation, trackedPage.stop.coordinates);
    if (distance <= ARRIVAL_RADIUS_METERS) {
      stopTracking();
    }
  }, [trackedPage, userLocation, stopTracking]);

  return {
    tracking,
    liveActivityEnabled,
    toggleTracking,
    stopTracking,
  };
}
