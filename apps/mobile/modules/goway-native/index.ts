import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export interface LiveActivityData {
  lineName: string;
  lineColor: string;
  direction: string;
  minutesUntil: number;
  stopName: string;
  isRealtime: boolean;
  isNavigation?: boolean;
  stepIndex?: number;
  totalSteps?: number;
  distanceMeters?: number;
  isStopTracking?: boolean;
}

export interface WalkingRouteCoordinate {
  latitude: number;
  longitude: number;
}

let GowayNative: {
  startLiveActivity: (data: LiveActivityData) => Promise<void>;
  updateLiveActivity: (data: LiveActivityData) => Promise<void>;
  endLiveActivity: () => Promise<void>;
  setAppGroupValue: (key: string, value: string) => Promise<void>;
  getWalkingRoute?: (
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number
  ) => Promise<WalkingRouteCoordinate[]>;
} | null = null;

try {
  GowayNative = requireNativeModule('GowayNative');
} catch {
  GowayNative = null;
}

/** Tracé marche MapKit (iOS) — null si module absent / Android / rebuild requis. */
export async function getNativeWalkingRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<WalkingRouteCoordinate[] | null> {
  if (Platform.OS !== 'ios' || !GowayNative?.getWalkingRoute) return null;
  try {
    const path = await GowayNative.getWalkingRoute(fromLat, fromLon, toLat, toLon);
    if (!path || path.length < 2) return null;
    return path.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
  } catch {
    return null;
  }
}

export default GowayNative;
