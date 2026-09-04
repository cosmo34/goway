import type { Coordinates } from '../stores/transitStore';

import type { NavigationStep } from '../services/routing/navigationSteps';

export function haversineMeters(from: Coordinates, to: Coordinates): number {
  const R = 6371e3;
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const ARRIVAL_RADIUS_METERS = 80;
export const NAVIGATION_AUTO_ADVANCE_COOLDOWN_MS = 5_000;

function arrivalRadiusForStep(step: NavigationStep): number {
  if (step.kind === 'transit') return 120;
  if (step.kind === 'walk') return 70;
  return 50;
}

function distanceToSegmentMeters(
  point: Coordinates,
  start: Coordinates,
  end: Coordinates
): number {
  const dx = end.longitude - start.longitude;
  const dy = end.latitude - start.latitude;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return haversineMeters(point, start);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.longitude - start.longitude) * dx + (point.latitude - start.latitude) * dy) /
        lengthSquared
    )
  );

  return haversineMeters(point, {
    latitude: start.latitude + t * dy,
    longitude: start.longitude + t * dx,
  });
}

export function distanceToPathMeters(point: Coordinates, path: Coordinates[]): number {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return haversineMeters(point, path[0]);

  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index++) {
    const segmentDistance = distanceToSegmentMeters(point, path[index], path[index + 1]);
    if (segmentDistance < minDistance) minDistance = segmentDistance;
  }

  return minDistance;
}

export function hasReachedNavigationStep(location: Coordinates, step: NavigationStep): boolean {
  const radius = arrivalRadiusForStep(step);
  const targetDistance = haversineMeters(location, step.to);
  if (targetDistance <= radius) return true;

  if (step.pathCoordinates.length === 0) return false;

  const endPoint = step.pathCoordinates[step.pathCoordinates.length - 1];
  const endDistance = haversineMeters(location, endPoint);
  if (endDistance <= radius) return true;

  if (step.kind === 'walk' && step.pathCoordinates.length >= 2) {
    const pathDistance = distanceToPathMeters(location, step.pathCoordinates);
    return pathDistance <= radius && endDistance <= radius * 1.5;
  }

  return false;
}

/** Au-delà de ces seuils, on compare marche vs transports. */
export const NEARBY_STOP_WALK_MAX_MINUTES = 15;
export const NEARBY_STOP_WALK_MAX_METERS = 1_200;
