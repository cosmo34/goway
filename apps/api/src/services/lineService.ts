import { buildTripLineShapeAsync, getRepresentativeTripIds, officialShapeQuality } from './networkShapeService.js';
import {
  getGtfs,
  routeTypeToMode,
  type GtfsRoute,
  type GtfsStop,
} from './gtfsLoader.js';
import { LINE_COLORS } from '../config.js';
import type { ApiStop } from './stopService.js';

export interface ApiLine {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  mode: 'tram' | 'bus' | 'tram_bus';
}

export interface ApiLineDirection {
  id: string;
  headsign: string;
}

export interface ApiLineDetail extends ApiLine {
  directions: ApiLineDirection[];
  stops: ApiStop[];
  shape: { latitude: number; longitude: number }[];
}

export interface LineBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

let routeStopIds: Map<string, Set<string>> | null = null;
const lineDetailCache = new Map<string, ApiLineDetail>();

function getRouteStopIds(): Map<string, Set<string>> {
  if (routeStopIds) return routeStopIds;

  const gtfs = getGtfs();
  routeStopIds = new Map();

  for (const trip of gtfs.trips.values()) {
    if (!routeStopIds.has(trip.route_id)) {
      routeStopIds.set(trip.route_id, new Set());
    }
    const times = gtfs.stopTimesByTrip.get(trip.trip_id) ?? [];
    for (const st of times) {
      routeStopIds.get(trip.route_id)!.add(st.stop_id);
    }
  }

  return routeStopIds;
}

export function routeColor(route: GtfsRoute): string {
  const shortName = route.route_short_name;
  return route.route_color ? `#${route.route_color}` : LINE_COLORS[shortName] ?? '#5B8DEF';
}

export function getLineMetaForRoute(routeId: string) {
  const route = getGtfs().routes.get(routeId);
  if (!route) return null;

  return {
    routeId: route.route_id,
    shortName: route.route_short_name,
    lineName: `Ligne ${route.route_short_name}`,
    lineColor: routeColor(route),
    mode: routeTypeToMode(route.route_type),
  };
}

export function getLineMetaForTrip(tripId: string) {
  const trip = getGtfs().trips.get(tripId);
  if (!trip) return null;
  return getLineMetaForRoute(trip.route_id);
}

function routeToApi(route: GtfsRoute): ApiLine {
  return {
    id: route.route_id,
    shortName: route.route_short_name,
    longName: route.route_long_name,
    color: routeColor(route),
    mode: routeTypeToMode(route.route_type),
  };
}

function compareLines(a: ApiLine, b: ApiLine): number {
  const modeOrder = { tram: 0, bus: 1, tram_bus: 2 };
  const modeDiff = modeOrder[a.mode] - modeOrder[b.mode];
  if (modeDiff !== 0) return modeDiff;

  const aNum = parseInt(a.shortName, 10);
  const bNum = parseInt(b.shortName, 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return a.shortName.localeCompare(b.shortName, 'fr', { numeric: true });
}

function stopInBbox(stop: GtfsStop, bbox: LineBbox): boolean {
  return (
    stop.stop_lat <= bbox.north &&
    stop.stop_lat >= bbox.south &&
    stop.stop_lon <= bbox.east &&
    stop.stop_lon >= bbox.west
  );
}

function routeIntersectsBbox(routeId: string, bbox: LineBbox): boolean {
  const gtfs = getGtfs();
  const stopIds = getRouteStopIds().get(routeId);
  if (!stopIds) return false;

  for (const stopId of stopIds) {
    const stop = gtfs.stops.get(stopId);
    if (!stop || stop.location_type === '1') continue;
    if (stopInBbox(stop, bbox)) return true;
  }
  return false;
}

export function listLines(bbox?: LineBbox): ApiLine[] {
  const gtfs = getGtfs();
  const lines: ApiLine[] = [];

  for (const route of gtfs.routes.values()) {
    if (bbox && !routeIntersectsBbox(route.route_id, bbox)) continue;
    lines.push(routeToApi(route));
  }

  return lines.sort(compareLines);
}

function stopToApi(stop: GtfsStop, mode: ApiLine['mode']): ApiStop {
  return {
    id: stop.stop_id,
    name: stop.stop_name,
    coordinates: { latitude: stop.stop_lat, longitude: stop.stop_lon },
    modes: [mode],
  };
}

export async function getLineDetail(routeId: string, directionId?: string): Promise<ApiLineDetail | null> {
  const cacheKey = `${routeId}:${directionId ?? 'all'}`;
  const cached = lineDetailCache.get(cacheKey);
  if (cached) return cached;

  const gtfs = getGtfs();
  const route = gtfs.routes.get(routeId);
  if (!route) return null;

  const mode = routeTypeToMode(route.route_type);
  const directions = new Map<string, string>();

  for (const trip of gtfs.trips.values()) {
    if (trip.route_id !== routeId) continue;
    directions.set(trip.direction_id, trip.trip_headsign);
  }

  let bestTripId: string | null = null;
  let bestQuality = 0;
  let bestShape: { latitude: number; longitude: number }[] = [];

  for (const tripId of getRepresentativeTripIds(routeId, directionId)) {
    const trip = gtfs.trips.get(tripId);
    if (!trip) continue;

    const candidateShape = await buildTripLineShapeAsync(tripId, routeId);
    const quality = officialShapeQuality(tripId, routeId) + candidateShape.length;

    if (quality > bestQuality) {
      bestShape = candidateShape;
      bestQuality = quality;
      bestTripId = tripId;
    }
  }

  const shape: { latitude: number; longitude: number }[] = [...bestShape];
  const stops: ApiStop[] = [];
  const seenStops = new Set<string>();

  if (bestTripId) {
    const times = gtfs.stopTimesByTrip.get(bestTripId) ?? [];
    for (const st of times) {
      const stop = gtfs.stops.get(st.stop_id);
      if (!stop || stop.location_type === '1') continue;

      if (shape.length === 0) {
        shape.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
      }

      if (!seenStops.has(stop.stop_id)) {
        seenStops.add(stop.stop_id);
        stops.push(stopToApi(stop, mode));
      }
    }
  }

  const result = {
    ...routeToApi(route),
    directions: Array.from(directions.entries()).map(([id, headsign]) => ({ id, headsign })),
    stops,
    shape,
  };

  lineDetailCache.set(cacheKey, result);
  return result;
}

export function getLineById(routeId: string): ApiLine | null {
  const gtfs = getGtfs();
  const route = gtfs.routes.get(routeId);
  return route ? routeToApi(route) : null;
}

export function stopBelongsToLine(stopId: string, routeId: string): boolean {
  return getRouteStopIds().get(routeId)?.has(stopId) ?? false;
}
