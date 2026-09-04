import { MONTPELLIER_BOUNDS } from '../config/tam';
import type { Coordinates } from '../stores/transitStore';

const SERVICE_RADIUS_METERS = 50_000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function isInMontpellierServiceArea(lat: number, lon: number): boolean {
  const { center } = MONTPELLIER_BOUNDS;
  return haversineMeters(center.latitude, center.longitude, lat, lon) <= SERVICE_RADIUS_METERS;
}

/** Corrige la position simulateur (ex. San Francisco) vers Montpellier */
export function normalizeUserCoordinates(coords: Coordinates): Coordinates {
  if (isInMontpellierServiceArea(coords.latitude, coords.longitude)) {
    return coords;
  }
  return { ...MONTPELLIER_BOUNDS.center };
}
