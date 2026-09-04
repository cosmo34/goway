import { CONFIG } from '../config.js';
import { haversineMeters } from './gtfsLoader.js';
import type { ShapeCoordinate } from './shapeService.js';

const segmentCache = new Map<string, ShapeCoordinate[]>();
const walkingRouteCache = new Map<string, WalkingRouteResult>();

const WALKING_ROUTERS = [
  CONFIG.walkingRouterUrl,
  'https://router.project-osrm.org/route/v1/foot',
];

export interface WalkingRouteResult {
  path: ShapeCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

function cacheKey(from: ShapeCoordinate, to: ShapeCoordinate): string {
  return `${from.latitude.toFixed(5)},${from.longitude.toFixed(5)}->${to.latitude.toFixed(5)},${to.longitude.toFixed(5)}`;
}

function straightLineRoute(from: ShapeCoordinate, to: ShapeCoordinate): WalkingRouteResult {
  const distanceMeters = haversineMeters(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude
  );
  return {
    path: [from, to],
    distanceMeters,
    durationSeconds: distanceMeters / 1.33,
  };
}

async function fetchWalkingRouteFrom(
  routerBaseUrl: string,
  from: ShapeCoordinate,
  to: ShapeCoordinate
): Promise<WalkingRouteResult | null> {
  const url = `${routerBaseUrl}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.walkingRouterTimeoutMs);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) return null;

  const data = (await response.json()) as {
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
    }>;
  };

  if (data.code !== 'Ok') return null;

  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates?.length) return null;

  return {
    path: coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    })),
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
  };
}

function isReasonableWalkingRoute(
  result: WalkingRouteResult,
  from: ShapeCoordinate,
  to: ShapeCoordinate
): boolean {
  if (result.path.length < 2) return false;

  const straightMeters = haversineMeters(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude
  );
  if (straightMeters < 30) return true;

  // Le routeur OSRM public renvoie parfois un tracé voiture (détour x3).
  const maxRatio = straightMeters < 200 ? 2.8 : 2.2;
  return result.distanceMeters <= straightMeters * maxRatio;
}

const transitRoadCache = new Map<string, ShapeCoordinate[]>();

export async function getTransitRoadPath(points: ShapeCoordinate[]): Promise<ShapeCoordinate[]> {
  if (points.length < 2) return points;

  const key = `transit:${points
    .map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
    .join('|')}`;
  const cached = transitRoadCache.get(key);
  if (cached) return cached;

  try {
    const path = await getRoadPath(points, 'driving');
    if (path.length >= 2) {
      transitRoadCache.set(key, path);
      return path;
    }
  } catch {
    // Fallback sur la polyligne d'arrêts.
  }

  transitRoadCache.set(key, points);
  return points;
}

export async function getWalkingRoute(
  from: ShapeCoordinate,
  to: ShapeCoordinate
): Promise<WalkingRouteResult> {
  const key = cacheKey(from, to);
  const cached = walkingRouteCache.get(key);
  if (cached) return cached;

  const fallback = straightLineRoute(from, to);

  const attempts = await Promise.all(
    WALKING_ROUTERS.map(async (routerBaseUrl) => {
      try {
        const result = await fetchWalkingRouteFrom(routerBaseUrl, from, to);
        if (!result || !isReasonableWalkingRoute(result, from, to)) return null;
        return result;
      } catch {
        return null;
      }
    })
  );

  const best = attempts.find((result) => result != null);
  if (best) {
    walkingRouteCache.set(key, best);
    segmentCache.set(`foot:${key}`, best.path);
    return best;
  }

  walkingRouteCache.set(key, fallback);
  segmentCache.set(`foot:${key}`, fallback.path);
  return fallback;
}

export async function getWalkingSegment(
  from: ShapeCoordinate,
  to: ShapeCoordinate
): Promise<ShapeCoordinate[]> {
  return (await getWalkingRoute(from, to)).path;
}

/** @deprecated Utiliser getWalkingSegment pour la marche */
export async function getRoadSegment(
  from: ShapeCoordinate,
  to: ShapeCoordinate,
  profile: 'driving' | 'foot' = 'foot'
): Promise<ShapeCoordinate[]> {
  if (profile === 'foot') {
    return getWalkingSegment(from, to);
  }

  const key = `driving:${cacheKey(from, to)}`;
  const cached = segmentCache.get(key);
  if (cached) return cached;

  const straight: ShapeCoordinate[] = [from, to];

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      segmentCache.set(key, straight);
      return straight;
    }

    const data = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };

    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!coordinates?.length) {
      segmentCache.set(key, straight);
      return straight;
    }

    const path = coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));

    segmentCache.set(key, path);
    return path;
  } catch {
    segmentCache.set(key, straight);
    return straight;
  }
}

export async function getRoadPath(
  points: ShapeCoordinate[],
  profile: 'driving' | 'foot' = 'foot'
): Promise<ShapeCoordinate[]> {
  if (points.length < 2) return points;

  if (profile === 'foot') {
    const route = await getWalkingRoute(points[0], points[points.length - 1]);
    return route.path;
  }

  const key = `driving:${points
    .map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
    .join('|')}`;
  const cached = segmentCache.get(key);
  if (cached) return cached;

  const straight = points;

  try {
    const coordString = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      segmentCache.set(key, straight);
      return straight;
    }

    const data = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };

    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!coordinates?.length) {
      segmentCache.set(key, straight);
      return straight;
    }

    const path = coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));

    segmentCache.set(key, path);
    return path;
  } catch {
    segmentCache.set(key, straight);
    return straight;
  }
}
