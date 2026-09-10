import { getGtfs, getStationStopIds, haversineMeters } from './gtfsLoader.js';
import type { ApiRoute, ApiRouteLeg } from './routingService.js';
import { getWalkingSegment, getTransitRoadPath } from './osrmService.js';
import {
  getNetworkShapeSegment,
  shapeNeedsRoadRouting,
} from './networkShapeService.js';

export interface ShapeCoordinate {
  latitude: number;
  longitude: number;
}

/** Map a transfer quay to the stop actually served by this trip (same station). */
function resolveStopIdOnTrip(
  tripId: string,
  stopId: string,
  prefer: 'first' | 'last' = 'first'
): string {
  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  if (tripStops.some((stopTime) => stopTime.stop_id === stopId)) return stopId;

  const stationStops = new Set(getStationStopIds(stopId));
  const matches = tripStops.filter((stopTime) => stationStops.has(stopTime.stop_id));
  if (!matches.length) return stopId;
  return prefer === 'last' ? matches[matches.length - 1].stop_id : matches[0].stop_id;
}

function resolveTripEndpoints(
  tripId: string,
  fromStopId: string,
  toStopId: string
): { fromStopId: string; toStopId: string } {
  const from = resolveStopIdOnTrip(tripId, fromStopId, 'first');
  const to = resolveStopIdOnTrip(tripId, toStopId, 'last');
  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const fromIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === from);
  const toIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === to);
  if (fromIdx >= 0 && toIdx > fromIdx) {
    return { fromStopId: from, toStopId: to };
  }
  return { fromStopId, toStopId };
}

function stopCoordinates(stopId: string): ShapeCoordinate | null {
  const stop = getGtfs().stops.get(stopId);
  if (!stop) return null;
  return { latitude: stop.stop_lat, longitude: stop.stop_lon };
}

function appendPath(path: ShapeCoordinate[], segment: ShapeCoordinate[]) {
  for (const point of segment) {
    const prev = path[path.length - 1];
    if (
      !prev ||
      Math.abs(prev.latitude - point.latitude) > 0.000005 ||
      Math.abs(prev.longitude - point.longitude) > 0.000005
    ) {
      path.push(point);
    }
  }
}

function isUndergroundTrip(tripId?: string): boolean {
  if (!tripId) return false;
  const trip = getGtfs().trips.get(tripId);
  if (!trip) return false;
  const route = getGtfs().routes.get(trip.route_id);
  if (!route) return false;
  const routeType = parseInt(route.route_type, 10);
  return routeType === 1;
}

function isSurfaceTransitMode(mode: string): boolean {
  return mode === 'tram' || mode === 'bus' || mode === 'tram_bus';
}

function isOfficialShapeMode(mode: string): boolean {
  return isSurfaceTransitMode(mode);
}

function stopCountBetween(tripId: string, fromStopId: string, toStopId: string): number {
  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const fromIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === fromStopId);
  const toIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === toStopId);
  if (fromIdx < 0 || toIdx <= fromIdx) return 2;
  return toIdx - fromIdx + 1;
}

function isUsableOfficialSegment(
  segment: ShapeCoordinate[],
  tripId: string,
  fromStopId: string,
  toStopId: string
): boolean {
  if (segment.length < 2) return false;
  return !shapeNeedsRoadRouting(segment, stopCountBetween(tripId, fromStopId, toStopId));
}

function shapeIndicesForTripStops(
  shapePoints: { lat: number; lon: number }[],
  tripStopIds: string[]
): Map<string, number> {
  const indices = new Map<string, number>();
  let searchFrom = 0;
  const gtfs = getGtfs();

  for (const stopId of tripStopIds) {
    const stop = gtfs.stops.get(stopId);
    if (!stop) continue;

    let bestIdx = searchFrom;
    let bestDist = Infinity;

    for (let i = searchFrom; i < shapePoints.length; i++) {
      const dist = haversineMeters(stop.stop_lat, stop.stop_lon, shapePoints[i].lat, shapePoints[i].lon);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    indices.set(stopId, bestIdx);
    searchFrom = bestIdx;
  }

  return indices;
}

export function getTripShapeSegment(
  tripId: string,
  fromStopId: string,
  toStopId: string,
  mode = 'tram',
  routeId?: string
): ShapeCoordinate[] {
  const resolved = resolveTripEndpoints(tripId, fromStopId, toStopId);
  fromStopId = resolved.fromStopId;
  toStopId = resolved.toStopId;

  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  const resolvedRouteId = trip?.route_id ?? routeId;

  if (isOfficialShapeMode(mode) && resolvedRouteId) {
    const officialSegment = getNetworkShapeSegment(tripId, resolvedRouteId, fromStopId, toStopId);
    if (officialSegment && isUsableOfficialSegment(officialSegment, tripId, fromStopId, toStopId)) {
      return officialSegment;
    }
  }

  return getTripStopPoints(tripId, fromStopId, toStopId);
}

function getTripStopPoints(
  tripId: string,
  fromStopId: string,
  toStopId: string
): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];

  const fromIdx = tripStops.findIndex((st) => st.stop_id === fromStopId);
  const toIdx = tripStops.findIndex((st) => st.stop_id === toStopId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
    return fallbackStopSegment(fromStopId, toStopId, tripStops, fromIdx, toIdx);
  }

  const shapeId = trip?.shape_id;
  const shapePoints = shapeId ? gtfs.shapes.get(shapeId) : undefined;

  if (!shapePoints?.length) {
    return fallbackStopSegment(fromStopId, toStopId, tripStops, fromIdx, toIdx);
  }

  const stopIds = tripStops.slice(fromIdx, toIdx + 1).map((st) => st.stop_id);
  const shapeIndices = shapeIndicesForTripStops(shapePoints, stopIds);
  const startShapeIdx = shapeIndices.get(fromStopId);
  const endShapeIdx = shapeIndices.get(toStopId);

  if (startShapeIdx == null || endShapeIdx == null || startShapeIdx >= endShapeIdx) {
    return fallbackStopSegment(fromStopId, toStopId, tripStops, fromIdx, toIdx);
  }

  return shapePoints.slice(startShapeIdx, endShapeIdx + 1).map((point) => ({
    latitude: point.lat,
    longitude: point.lon,
  }));
}

function fallbackStopSegment(
  fromStopId: string,
  toStopId: string,
  tripStops: { stop_id: string }[],
  fromIdx: number,
  toIdx: number
): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const segment: ShapeCoordinate[] = [];

  if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
    for (const st of tripStops.slice(fromIdx, toIdx + 1)) {
      const stop = gtfs.stops.get(st.stop_id);
      if (stop) segment.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
    }
    if (segment.length >= 2) return segment;
  }

  const from = stopCoordinates(fromStopId);
  const to = stopCoordinates(toStopId);
  if (from && to) return [from, to];
  return from ? [from] : to ? [to] : [];
}

export function getTripFullShape(tripId: string): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  const shapeId = trip?.shape_id;
  const shapePoints = shapeId ? gtfs.shapes.get(shapeId) : undefined;

  if (shapePoints?.length) {
    return shapePoints.map((point) => ({
      latitude: point.lat,
      longitude: point.lon,
    }));
  }

  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  const segment: ShapeCoordinate[] = [];
  for (const st of tripStops) {
    const stop = gtfs.stops.get(st.stop_id);
    if (stop) segment.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
  }
  return segment;
}

function stopPointsForTripSegment(
  tripId: string,
  fromStopId: string,
  toStopId: string
): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  const fromIdx = tripStops.findIndex((st) => st.stop_id === fromStopId);
  const toIdx = tripStops.findIndex((st) => st.stop_id === toStopId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) return [];

  const points: ShapeCoordinate[] = [];
  for (const stopTime of tripStops.slice(fromIdx, toIdx + 1)) {
    const stop = gtfs.stops.get(stopTime.stop_id);
    if (!stop || stop.location_type === '1') continue;
    points.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
  }
  return points;
}

async function roadRoutedTripSegment(
  tripId: string,
  fromStopId: string,
  toStopId: string,
  mode: string,
  fallback: ShapeCoordinate[]
): Promise<ShapeCoordinate[]> {
  if (mode === 'tram') {
    return fallback;
  }

  const stopPoints = stopPointsForTripSegment(tripId, fromStopId, toStopId);
  if (stopPoints.length < 2) return fallback;

  if (fallback.length >= 2 && !shapeNeedsRoadRouting(fallback, stopPoints.length)) {
    return fallback;
  }

  // Prefer a denser official/GTFS corridor (matches the map line) over OSRM roads.
  if (fallback.length >= Math.max(8, stopPoints.length * 2)) {
    return fallback;
  }

  return getTransitRoadPath(stopPoints);
}

export async function getTripShapeSegmentAsync(
  tripId: string,
  fromStopId: string,
  toStopId: string,
  mode: string,
  routeId?: string
): Promise<ShapeCoordinate[]> {
  const resolved = resolveTripEndpoints(tripId, fromStopId, toStopId);
  fromStopId = resolved.fromStopId;
  toStopId = resolved.toStopId;

  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  const resolvedRouteId = trip?.route_id ?? routeId;

  let officialSegment: ShapeCoordinate[] | null = null;
  if (isOfficialShapeMode(mode) && resolvedRouteId) {
    officialSegment = getNetworkShapeSegment(tripId, resolvedRouteId, fromStopId, toStopId);
    if (officialSegment && isUsableOfficialSegment(officialSegment, tripId, fromStopId, toStopId)) {
      return officialSegment;
    }
  }

  const tripSegment = getTripStopPoints(tripId, fromStopId, toStopId);
  // Prefer a denser official corridor (even with gaps) over sparse GTFS/stop chords.
  const candidate =
    officialSegment && officialSegment.length > tripSegment.length
      ? officialSegment
      : tripSegment;

  if (isUndergroundTrip(tripId)) {
    return candidate;
  }

  // Densify sparse suburban/bus segments via OSRM when GTFS shapes exist but are
  // only stop-to-stop chords (previously skipped OSRM as soon as shape_id was set).
  if (isSurfaceTransitMode(mode)) {
    return roadRoutedTripSegment(tripId, fromStopId, toStopId, mode, candidate);
  }

  return candidate;
}

export function buildLegGeometry(
  leg: {
    mode: string;
    fromStopId?: string;
    toStopId?: string;
    tripId?: string;
    lineId?: string;
  },
  origin: ShapeCoordinate,
  destination: ShapeCoordinate
): ShapeCoordinate[] {
  if (leg.mode === 'walk') {
    const start = leg.fromStopId ? stopCoordinates(leg.fromStopId) ?? origin : origin;
    const end = leg.toStopId ? stopCoordinates(leg.toStopId) : destination;
    return end ? [start, end] : [start];
  }

  if (leg.tripId && leg.fromStopId && leg.toStopId) {
    const segment = getTripShapeSegment(
      leg.tripId,
      leg.fromStopId,
      leg.toStopId,
      leg.mode,
      leg.lineId
    );
    if (segment.length >= 2) return segment;
  }

  const from = leg.fromStopId ? stopCoordinates(leg.fromStopId) : null;
  const to = leg.toStopId ? stopCoordinates(leg.toStopId) : null;
  const fallback: ShapeCoordinate[] = [];
  if (from) fallback.push(from);
  if (to) fallback.push(to);
  return fallback.length >= 2 ? fallback : fallback;
}

export function buildRouteGeometry(
  legs: Array<{
    mode: string;
    fromStopId?: string;
    toStopId?: string;
    tripId?: string;
    geometry?: ShapeCoordinate[];
  }>,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): ShapeCoordinate[] {
  const path: ShapeCoordinate[] = [{ latitude: originLat, longitude: originLon }];
  const destination = { latitude: destLat, longitude: destLon };

  for (const leg of legs) {
    if (leg.geometry?.length) {
      appendPath(path, leg.geometry);
      continue;
    }

    const cursor = path[path.length - 1];
    const segment = buildLegGeometry(leg, cursor, destination);
    if (segment.length) appendPath(path, segment);
  }

  const last = path[path.length - 1];
  if (
    last &&
    haversineMeters(last.latitude, last.longitude, destination.latitude, destination.longitude) > 15
  ) {
    appendPath(path, [destination]);
  }
  return path;
}

async function buildLegGeometryAsync(
  leg: {
    mode: string;
    fromStopId?: string;
    toStopId?: string;
    tripId?: string;
    lineId?: string;
  },
  origin: ShapeCoordinate,
  destination: ShapeCoordinate
): Promise<ShapeCoordinate[]> {
  if (leg.mode === 'walk') {
    const start = leg.fromStopId ? stopCoordinates(leg.fromStopId) ?? origin : origin;
    const end = leg.toStopId ? stopCoordinates(leg.toStopId) : destination;
    if (!end) return [start];
    return getWalkingSegment(start, end);
  }

  if (leg.tripId && leg.fromStopId && leg.toStopId) {
    const segment = await getTripShapeSegmentAsync(
      leg.tripId,
      leg.fromStopId,
      leg.toStopId,
      leg.mode,
      leg.lineId
    );
    if (segment.length >= 2) return segment;
  }

  const from = leg.fromStopId ? stopCoordinates(leg.fromStopId) : null;
  const to = leg.toStopId ? stopCoordinates(leg.toStopId) : null;
  if (from && to) {
    if (isSurfaceTransitMode(leg.mode) && leg.mode === 'bus' && !isUndergroundTrip(leg.tripId)) {
      return getTransitRoadPath([from, to]);
    }
    return [from, to];
  }
  return from ? [from] : to ? [to] : [];
}

export async function attachRouteGeometriesAsync(
  route: ApiRoute,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<ApiRoute> {
  const destination = { latitude: destLat, longitude: destLon };
  let cursor = { latitude: originLat, longitude: originLon };

  const legs: ApiRouteLeg[] = [];
  for (const leg of route.legs) {
    const geometry = await buildLegGeometryAsync(leg, cursor, destination);
    if (geometry.length) cursor = geometry[geometry.length - 1];
    legs.push({ ...leg, geometry });
  }

  return {
    ...route,
    legs,
    geometry: buildRouteGeometry(legs, originLat, originLon, destLat, destLon),
  };
}

export function attachRouteGeometries(
  route: ApiRoute,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): ApiRoute {
  const destination = { latitude: destLat, longitude: destLon };
  const origin = { latitude: originLat, longitude: originLon };
  let cursor = origin;

  const legs: ApiRouteLeg[] = route.legs.map((leg) => {
    const geometry = buildLegGeometry(leg, cursor, destination);
    if (geometry.length) cursor = geometry[geometry.length - 1];
    return { ...leg, geometry };
  });

  return {
    ...route,
    legs,
    geometry: buildRouteGeometry(legs, originLat, originLon, destLat, destLon),
  };
}
