import type { Coordinates, Stop } from '../stores/transitStore';
import { distanceMeters } from './location';

export interface StopCluster {
  id: string;
  stops: Stop[];
  coordinates: Coordinates;
}

export function clusterId(stops: Stop[]): string {
  return stops
    .map((stop) => stop.id)
    .sort()
    .join('|');
}

export function clusterThresholdMeters(latitudeDelta: number): number {
  return Math.max(20, Math.min(50, latitudeDelta * 1400));
}

function centroid(stops: Stop[]): Coordinates {
  const total = stops.length;
  const latitude = stops.reduce((sum, stop) => sum + stop.coordinates.latitude, 0) / total;
  const longitude = stops.reduce((sum, stop) => sum + stop.coordinates.longitude, 0) / total;
  return { latitude, longitude };
}

export function clusterStops(stops: Stop[], latitudeDelta: number): StopCluster[] {
  if (stops.length === 0) return [];

  const threshold = clusterThresholdMeters(latitudeDelta);
  const parent = stops.map((_, index) => index);

  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };

  const union = (left: number, right: number) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };

  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const distance = distanceMeters(stops[i].coordinates, stops[j].coordinates);
      if (distance <= threshold) union(i, j);
    }
  }

  const groups = new Map<number, Stop[]>();
  for (let index = 0; index < stops.length; index++) {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(stops[index]);
    groups.set(root, group);
  }

  return Array.from(groups.values()).map((group) => ({
    id: clusterId(group),
    stops: group.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    coordinates: centroid(group),
  }));
}
