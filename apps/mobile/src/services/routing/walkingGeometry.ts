import type { Coordinates, Route, RouteLeg } from '../../stores/transitStore';
import { getNativeWalkingRoute } from '../../../modules/goway-native';
import { haversineMeters } from '../../utils/geo';

function pathLengthMeters(path: Coordinates[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

function pointToSegmentDistanceMeters(
  point: Coordinates,
  start: Coordinates,
  end: Coordinates
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
  return Math.hypot((xp - mx) * 111_320, (yp - my) * 111_320);
}

function maxDeviationFromChordMeters(path: Coordinates[]): number {
  if (path.length < 3) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  let max = 0;
  for (let i = 1; i < path.length - 1; i++) {
    max = Math.max(max, pointToSegmentDistanceMeters(path[i], start, end));
  }
  return max;
}

/**
 * Places : ligne droite si quasi aligné (évite le tour du pourtour).
 * Rues : conserver tous les points (géométrie voirie).
 */
export function reshapeWalkingPathForMap(path: Coordinates[]): Coordinates[] {
  if (path.length <= 2) return path;

  const start = path[0];
  const end = path[path.length - 1];
  const crow = haversineMeters(start, end);
  const routed = pathLengthMeters(path);
  const deviation = maxDeviationFromChordMeters(path);

  if (crow >= 25 && crow <= 280 && deviation <= 12 && routed <= crow * 1.3) {
    return [start, end];
  }

  if (
    crow >= 40 &&
    crow <= 320 &&
    routed >= crow * 1.45 &&
    deviation <= Math.max(14, crow * 0.22)
  ) {
    return [start, end];
  }

  return path;
}

/**
 * Choisit le tracé le plus court entre MapKit et l’API, en gardant
 * la préférence MapKit tant que l’écart reste raisonnable (< 12 %).
 */
function pickShortestWalkPath(
  nativePath: Coordinates[] | null,
  apiPath: Coordinates[] | null,
  fallback: Coordinates[]
): Coordinates[] {
  const candidates = [nativePath, apiPath].filter(
    (path): path is Coordinates[] => !!path && path.length >= 2
  );
  if (!candidates.length) return fallback;

  const scored = candidates.map((path) => ({
    path: reshapeWalkingPathForMap(path),
    length: pathLengthMeters(reshapeWalkingPathForMap(path)),
    isNative: path === nativePath,
  }));

  scored.sort((a, b) => a.length - b.length || (a.isNative ? -1 : 1));
  const shortest = scored[0];
  const native = scored.find((entry) => entry.isNative);

  // Préférer MapKit s’il n’est que légèrement plus long (alignement rues Apple).
  if (native && native.length <= shortest.length * 1.12) {
    return native.path;
  }
  return shortest.path;
}

function walkEndpoints(leg: RouteLeg): { from: Coordinates; to: Coordinates } | null {
  const geometry = leg.geometry;
  if (geometry && geometry.length >= 2) {
    return { from: geometry[0], to: geometry[geometry.length - 1] };
  }
  return null;
}

function rebuildRouteGeometry(legs: RouteLeg[]): Coordinates[] {
  const path: Coordinates[] = [];
  for (const leg of legs) {
    const geometry = leg.geometry;
    if (!geometry?.length) continue;
    for (const point of geometry) {
      const prev = path[path.length - 1];
      if (
        !prev ||
        Math.abs(prev.latitude - point.latitude) > 0.00001 ||
        Math.abs(prev.longitude - point.longitude) > 0.00001
      ) {
        path.push(point);
      }
    }
  }
  return path;
}

/**
 * Sur iOS : remplace les jambe marche par MapKit (rues Apple Maps).
 * Sinon : garde la géométrie API et applique juste le reshape places.
 */
export async function alignWalkingLegsToMapStreets(route: Route): Promise<Route> {
  const legs = await Promise.all(
    route.legs.map(async (leg) => {
      if (leg.mode !== 'walk') return leg;

      const ends = walkEndpoints(leg);
      if (!ends) return leg;

      const nativePath = await getNativeWalkingRoute(
        ends.from.latitude,
        ends.from.longitude,
        ends.to.latitude,
        ends.to.longitude
      );

      const path = pickShortestWalkPath(
        nativePath,
        leg.geometry ?? null,
        [ends.from, ends.to]
      );
      const durationMinutes = Math.max(
        1,
        Math.ceil(pathLengthMeters(path) / 1.33 / 60)
      );
      return { ...leg, geometry: path, durationMinutes };
    })
  );

  return {
    ...route,
    legs,
    geometry: rebuildRouteGeometry(legs),
  };
}
