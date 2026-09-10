import { CONFIG } from '../config.js';
import { haversineMeters } from './gtfsLoader.js';
import type { ShapeCoordinate } from './shapeService.js';

const segmentCache = new Map<string, ShapeCoordinate[]>();
const walkingRouteCache = new Map<string, WalkingRouteResult>();

/** Routeur foot OSM fiable uniquement — project-osrm.org/foot renvoie souvent des détours absurdes. */
const WALKING_ROUTERS = [
  CONFIG.walkingRouterUrl,
  'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
];

export interface WalkingRouteResult {
  path: ShapeCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

function cacheKey(from: ShapeCoordinate, to: ShapeCoordinate): string {
  // v5 : alternatives OSRM + choix du plus court.
  return `v5:${from.latitude.toFixed(5)},${from.longitude.toFixed(5)}->${to.latitude.toFixed(5)},${to.longitude.toFixed(5)}`;
}

function pathLengthMeters(path: ShapeCoordinate[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(
      path[i - 1].latitude,
      path[i - 1].longitude,
      path[i].latitude,
      path[i].longitude
    );
  }
  return total;
}

/** Distance point → segment (approx. équirectangulaire, OK < 2 km). */
function pointToSegmentDistanceMeters(
  point: ShapeCoordinate,
  start: ShapeCoordinate,
  end: ShapeCoordinate
): number {
  const lat0 = ((start.latitude + end.latitude) / 2) * (Math.PI / 180);
  const x0 = start.longitude * Math.cos(lat0);
  const y0 = start.latitude;
  const x1 = end.longitude * Math.cos(lat0);
  const y1 = end.latitude;
  const xp = point.longitude * Math.cos(lat0);
  const yp = point.latitude;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-12) {
    t = Math.max(0, Math.min(1, ((xp - x0) * dx + (yp - y0) * dy) / len2));
  }
  const mx = x0 + t * dx;
  const my = y0 + t * dy;
  const metersPerDeg = 111_320;
  return Math.hypot((xp - mx) * metersPerDeg, (yp - my) * metersPerDeg);
}

function maxDeviationFromChordMeters(path: ShapeCoordinate[]): number {
  if (path.length < 3) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  let max = 0;
  for (let i = 1; i < path.length - 1; i++) {
    max = Math.max(max, pointToSegmentDistanceMeters(path[i], start, end));
  }
  return max;
}

function dedupeClosePoints(path: ShapeCoordinate[], minGapMeters = 2.5): ShapeCoordinate[] {
  if (path.length <= 2) return path;
  const result: ShapeCoordinate[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    if (
      haversineMeters(prev.latitude, prev.longitude, path[i].latitude, path[i].longitude) >=
      minGapMeters
    ) {
      result.push(path[i]);
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

function snapEndpoints(
  path: ShapeCoordinate[],
  from: ShapeCoordinate,
  to: ShapeCoordinate
): ShapeCoordinate[] {
  if (path.length < 2) return [from, to];
  return [from, ...path.slice(1, -1), to];
}

/**
 * Collapse uniquement les sous-segments « place » (quasi-alignés).
 * Les virages de rue sont conservés.
 */
function collapsePlazaSpans(path: ShapeCoordinate[]): ShapeCoordinate[] {
  if (path.length <= 3) return path;

  const keep = new Array(path.length).fill(true);
  const minSpan = 8;
  const maxSpanMeters = 200;
  const minSpanMeters = 35;

  for (let i = 0; i < path.length - 2; i++) {
    if (!keep[i]) continue;
    let bestJ = -1;
    for (let j = i + minSpan; j < path.length; j++) {
      const span = path.slice(i, j + 1);
      const crow = haversineMeters(
        path[i].latitude,
        path[i].longitude,
        path[j].latitude,
        path[j].longitude
      );
      if (crow < minSpanMeters) continue;
      if (crow > maxSpanMeters) break;
      const routed = pathLengthMeters(span);
      const deviation = maxDeviationFromChordMeters(span);
      if (deviation <= 7 && routed <= crow * 1.2) {
        bestJ = j;
      }
    }
    if (bestJ > i + 1) {
      for (let k = i + 1; k < bestJ; k++) keep[k] = false;
      i = bestJ - 1;
    }
  }

  return path.filter((_, index) => keep[index]);
}

/**
 * Rues : géométrie OSRM complète (suit la voirie).
 * Places : corde si le trajet entier (ou un span) est un croisement d’esplanade.
 */
function reshapeWalkingPath(
  path: ShapeCoordinate[],
  from: ShapeCoordinate,
  to: ShapeCoordinate
): ShapeCoordinate[] {
  if (path.length <= 2) return snapEndpoints(path.length ? path : [from, to], from, to);

  const cleaned = dedupeClosePoints(snapEndpoints(path, from, to), 1.2);
  const start = cleaned[0];
  const end = cleaned[cleaned.length - 1];
  const crow = haversineMeters(start.latitude, start.longitude, end.latitude, end.longitude);
  const routed = pathLengthMeters(cleaned);
  const deviation = maxDeviationFromChordMeters(cleaned);

  // Place / esplanade courte : presque une droite → corde.
  if (
    crow >= 30 &&
    crow <= 220 &&
    deviation <= 8 &&
    routed <= crow * 1.22
  ) {
    return [start, end];
  }

  return collapsePlazaSpans(cleaned);
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
  const url = `${routerBaseUrl}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&alternatives=true`;
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

  const routes = (data.routes ?? []).filter(
    (route) => route.geometry?.coordinates && route.geometry.coordinates.length > 0
  );
  if (!routes.length) return null;

  // Plus court parmi les alternatives OSRM.
  routes.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const route = routes[0];
  const coordinates = route.geometry!.coordinates!;

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
  if (straightMeters < 25) return true;

  // Centre historique : détours piétons fréquents — ne pas rejeter trop tôt.
  const maxRatio = straightMeters < 250 ? 4.5 : straightMeters < 800 ? 3.5 : 2.8;
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
  const uniqueRouters = [...new Set(WALKING_ROUTERS.filter(Boolean))];

  const attempts = await Promise.all(
    uniqueRouters.map(async (routerBaseUrl) => {
      try {
        const result = await fetchWalkingRouteFrom(routerBaseUrl, from, to);
        if (!result || !isReasonableWalkingRoute(result, from, to)) return null;
        return result;
      } catch {
        return null;
      }
    })
  );

  // Préférer le tracé le plus court parmi les réponses raisonnables (moins de détours foireux).
  const candidates = attempts.filter((result): result is WalkingRouteResult => result != null);
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const best = candidates[0];

  if (best) {
    const reshapedPath = reshapeWalkingPath(best.path, from, to);
    const reshaped: WalkingRouteResult = {
      ...best,
      path: reshapedPath,
      distanceMeters:
        reshapedPath.length === 2
          ? haversineMeters(
              reshapedPath[0].latitude,
              reshapedPath[0].longitude,
              reshapedPath[1].latitude,
              reshapedPath[1].longitude
            )
          : Math.min(best.distanceMeters, pathLengthMeters(reshapedPath)),
    };
    walkingRouteCache.set(key, reshaped);
    segmentCache.set(`foot:${key}`, reshaped.path);
    return reshaped;
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
