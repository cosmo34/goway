import type {
  Coordinates,
  PointOfInterest,
  Route,
  SearchScope,
  SearchSuggestion,
  Stop,
} from '../../stores/transitStore';
import type { TransportMode } from '../../config/tam';
import { haversineMeters } from '../../utils/geo';
import { KNOWN_PLACES } from '../../config/places';
import {
  planRoutesApi,
  parseNlpApi,
  fetchPoiApi,
  getWalkingTimeApi,
  getWalkingRouteApi,
  getNearbyStopsApi,
  getStopByIdApi,
  getLineDetailApi,
} from '../api/transitApi';
import { LEG_ARRIVAL_LABEL } from './navigationSteps';

export interface NaturalLanguageQuery {
  raw: string;
  destination?: string;
  destinationCoordinates?: Coordinates;
  suggestions?: SearchSuggestion[];
  interpretedQuery?: string;
}

export class NaturalLanguageService {
  async parseQuery(
    raw: string,
    options: { scope?: SearchScope; userLocation?: Coordinates | null } = {}
  ): Promise<NaturalLanguageQuery> {
    try {
      const result = await parseNlpApi(raw, {
        scope: options.scope ?? 'local',
        userLat: options.userLocation?.latitude,
        userLon: options.userLocation?.longitude,
      });
      return { raw, ...result };
    } catch {
      return this.parseLocal(raw);
    }
  }

  private parseLocal(raw: string): NaturalLanguageQuery {
    const normalized = raw.toLowerCase().trim();
    for (const [keyword, place] of Object.entries(KNOWN_PLACES)) {
      if (normalized.includes(keyword)) {
        return {
          raw,
          destination: place.name,
          destinationCoordinates: { latitude: place.lat, longitude: place.lon },
        };
      }
    }
    return { raw };
  }
}

export const nlpService = new NaturalLanguageService();

export class RoutingService {
  async planRoutes(
    origin: Coordinates,
    destination: Coordinates,
    count = 3,
    departureTime: Date = new Date(),
    allowedModes?: TransportMode[]
  ): Promise<Route[]> {
    return planRoutesApi(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
      count,
      allowedModes,
      departureTime
    );
  }

  async planRoute(
    origin: Coordinates,
    destination: Coordinates,
    departureTime: Date = new Date()
  ): Promise<Route | null> {
    const routes = await this.planRoutes(origin, destination, 1, departureTime);
    return routes[0] ?? null;
  }

  estimateWalkingTime(from: Coordinates, to: Coordinates): number {
    const R = 6371e3;
    const φ1 = (from.latitude * Math.PI) / 180;
    const φ2 = (to.latitude * Math.PI) / 180;
    const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
    const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return Math.ceil((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 80);
  }

  async estimateWalkingTimeAsync(from: Coordinates, to: Coordinates): Promise<number> {
    try {
      return await getWalkingTimeApi(from.latitude, from.longitude, to.latitude, to.longitude);
    } catch {
      return this.estimateWalkingTime(from, to);
    }
  }

  async fetchWalkingRoute(
    from: Coordinates,
    to: Coordinates
  ): Promise<{ path: Coordinates[]; minutes: number; distanceMeters: number }> {
    try {
      return await getWalkingRouteApi(from.latitude, from.longitude, to.latitude, to.longitude);
    } catch {
      const minutes = this.estimateWalkingTime(from, to);
      return {
        path: [from, to],
        minutes,
        distanceMeters: Math.round(haversineMeters(from, to)),
      };
    }
  }

}

export const routingService = new RoutingService();

export async function fetchNearbyPOIs(
  destination: Coordinates,
  radius = 500
): Promise<PointOfInterest[]> {
  try {
    return await fetchPoiApi(destination.latitude, destination.longitude, radius);
  } catch {
    return [];
  }
}

export async function loadMapContext(location: Coordinates): Promise<{
  stops: Awaited<ReturnType<typeof getNearbyStopsApi>>;
  pois: PointOfInterest[];
}> {
  const [stops, pois] = await Promise.all([
    getNearbyStopsApi(location.latitude, location.longitude, 25).catch(() => []),
    fetchPoiApi(location.latitude, location.longitude, 1500).catch(() => []),
  ]);
  return { stops, pois };
}

export function buildRouteCoordinates(
  origin: Coordinates,
  destination: Coordinates,
  route?: Route,
  stops: Stop[] = []
): Coordinates[] {
  const findStop = (stopId?: string, stopName?: string): Stop | undefined => {
    if (stopId) {
      const byId = stops.find((stop) => stop.id === stopId);
      if (byId) return byId;
    }
    if (!stopName) return undefined;
    const normalized = stopName.toLowerCase();
    return stops.find(
      (stop) =>
        stop.name.toLowerCase() === normalized ||
        normalized.includes(stop.name.toLowerCase()) ||
        stop.name.toLowerCase().includes(normalized)
    );
  };

  const points: Coordinates[] = [origin];

  if (route?.legs.length) {
    for (const leg of route.legs) {
      if (leg.mode === 'walk') {
        if (leg.geometry && leg.geometry.length >= 2) {
          for (const point of leg.geometry) points.push(point);
          continue;
        }
        const end =
          leg.to === LEG_ARRIVAL_LABEL
            ? destination
            : findStop(leg.toStopId, leg.to)?.coordinates;
        if (end) points.push(end);
        continue;
      }

      if (leg.geometry && leg.geometry.length >= 2) {
        for (const point of leg.geometry) points.push(point);
        continue;
      }

      const boardStop = findStop(leg.fromStopId, leg.from);
      const alightStop = findStop(leg.toStopId, leg.to);
      if (boardStop) points.push(boardStop.coordinates);
      if (alightStop) points.push(alightStop.coordinates);
    }
  }

  points.push(destination);
  return dedupeCoordinates(points);
}

const lineDetailCache = new Map<string, Awaited<ReturnType<typeof getLineDetailApi>>>();

async function getCachedLineDetail(lineId: string) {
  const cached = lineDetailCache.get(lineId);
  if (cached) return cached;
  const detail = await getLineDetailApi(lineId);
  lineDetailCache.set(lineId, detail);
  return detail;
}

const MAX_SHAPE_SNAP_METERS = 250;

function nearestShapeIndex(
  shape: Coordinates[],
  point: Coordinates,
  searchFrom = 0
): number {
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = searchFrom; i < shape.length; i++) {
    const dist = haversineMeters(point, shape[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestDist <= MAX_SHAPE_SNAP_METERS ? bestIdx : -1;
}

function sliceLineShape(
  shape: Coordinates[],
  stops: Stop[],
  fromStopId: string,
  toStopId: string
): Coordinates[] {
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const toStop = stops.find((stop) => stop.id === toStopId);
  if (!fromStop || !toStop) return [];

  const fromIdx = nearestShapeIndex(shape, fromStop.coordinates, 0);
  const toIdx =
    fromIdx >= 0
      ? nearestShapeIndex(shape, toStop.coordinates, fromIdx)
      : nearestShapeIndex(shape, toStop.coordinates, 0);

  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return [];
  return shape.slice(fromIdx, toIdx + 1);
}

function dedupeCoordinates(points: Coordinates[]): Coordinates[] {
  const deduped: Coordinates[] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (
      !prev ||
      Math.abs(prev.latitude - point.latitude) > 0.00001 ||
      Math.abs(prev.longitude - point.longitude) > 0.00001
    ) {
      deduped.push(point);
    }
  }
  return deduped.length >= 2 ? deduped : points;
}

function appendSegment(path: Coordinates[], segment: Coordinates[]) {
  for (const point of segment) {
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

export async function buildRoutePathCoordinates(
  origin: Coordinates,
  destination: Coordinates,
  route: Route,
  stops: Stop[]
): Promise<Coordinates[]> {
  const findStop = (stopId?: string, stopName?: string): Stop | undefined => {
    if (stopId) {
      const byId = stops.find((stop) => stop.id === stopId);
      if (byId) return byId;
    }
    if (!stopName) return undefined;
    const normalized = stopName.toLowerCase();
    return stops.find(
      (stop) =>
        stop.name.toLowerCase() === normalized ||
        normalized.includes(stop.name.toLowerCase()) ||
        stop.name.toLowerCase().includes(normalized)
    );
  };

  const path: Coordinates[] = [origin];

  for (const leg of route.legs) {
    if (leg.mode === 'walk') {
      if (leg.geometry && leg.geometry.length >= 2) {
        appendSegment(path, leg.geometry);
        continue;
      }
      const end =
        leg.to === LEG_ARRIVAL_LABEL
          ? destination
          : findStop(leg.toStopId, leg.to)?.coordinates ?? destination;
      appendSegment(path, [end]);
      continue;
    }

    const fromStopId = leg.fromStopId;
    const toStopId = leg.toStopId;

    if (leg.geometry && leg.geometry.length >= 2) {
      appendSegment(path, leg.geometry);
      continue;
    }

    if (leg.lineId && fromStopId && toStopId) {
      try {
        const detail = await getCachedLineDetail(leg.lineId);
        const segment = sliceLineShape(detail.shape, detail.stops, fromStopId, toStopId);
        if (segment.length >= 2) {
          appendSegment(path, segment);
          continue;
        }
      } catch {
        // Fallback sur les arrêts.
      }
    }

    const boardStop = findStop(fromStopId, leg.from);
    const alightStop = findStop(toStopId, leg.to);
    const fallback: Coordinates[] = [];
    if (boardStop) fallback.push(boardStop.coordinates);
    if (alightStop) fallback.push(alightStop.coordinates);
    appendSegment(path, fallback);
  }

  appendSegment(path, [destination]);
  return dedupeCoordinates(path);
}

function getRouteStopIds(route: Route): Set<string> {
  if (route.itineraryStopIds?.length) {
    return new Set(route.itineraryStopIds);
  }

  const stopIds = new Set<string>();
  for (const leg of route.legs) {
    if (leg.fromStopId) stopIds.add(leg.fromStopId);
    if (leg.toStopId) stopIds.add(leg.toStopId);
  }
  return stopIds;
}

export async function collectRouteStops(route: Route, mapStops: Stop[]): Promise<Stop[]> {
  const stopIds = getRouteStopIds(route);
  const byId = new Map<string, Stop>();

  for (const stopId of stopIds) {
    const cached = mapStops.find((stop) => stop.id === stopId);
    if (cached) byId.set(stopId, cached);
  }

  const missing = [...stopIds].filter((stopId) => !byId.has(stopId));
  await Promise.all(
    missing.map(async (stopId) => {
      try {
        const stop = await getStopByIdApi(stopId);
        byId.set(stopId, stop);
      } catch {
        // Arrêt hors cache — ignoré.
      }
    })
  );

  return [...stopIds]
    .map((stopId) => byId.get(stopId))
    .filter((stop): stop is Stop => stop != null);
}

export function collectRouteStopsSync(route: Route, mapStops: Stop[]): Stop[] {
  const stopIds = getRouteStopIds(route);
  const byId = new Map(mapStops.map((stop) => [stop.id, stop]));
  const matched: Stop[] = [];

  for (const stopId of stopIds) {
    const stop = byId.get(stopId);
    if (stop) matched.push(stop);
  }

  return matched;
}

export function mergeRouteStops(route: Route, routeStops: Stop[], mapStops: Stop[]): Stop[] {
  const stopIds = getRouteStopIds(route);
  const byId = new Map<string, Stop>();

  for (const stop of routeStops) {
    if (stopIds.has(stop.id)) byId.set(stop.id, stop);
  }
  for (const stop of mapStops) {
    if (stopIds.has(stop.id) && !byId.has(stop.id)) {
      byId.set(stop.id, stop);
    }
  }

  return [...stopIds]
    .map((stopId) => byId.get(stopId))
    .filter((stop): stop is Stop => stop != null);
}

export interface RouteMapSegment {
  coordinates: Coordinates[];
  dashed?: boolean;
  color?: string;
}

export function buildRouteMapSegments(route: Route | null | undefined): RouteMapSegment[] {
  if (!route?.legs?.length) return [];

  const segments: RouteMapSegment[] = [];
  for (const leg of route.legs) {
    if (!leg.geometry || leg.geometry.length < 2) continue;
    segments.push({
      coordinates: leg.geometry,
      dashed: leg.mode === 'walk',
      color: leg.mode === 'walk' ? undefined : leg.lineColor,
    });
  }

  return segments;
}

export function findBoardingStop(route: Route, stops: Stop[]): Stop | null {
  const transitLeg = route.legs.find((leg) => leg.mode !== 'walk');
  if (!transitLeg) return null;

  // Strict : l’ID de montée du leg — pas de fuzzy name (évite Peyrou pour L1, etc.).
  if (transitLeg.fromStopId) {
    const byId = stops.find((stop) => stop.id === transitLeg.fromStopId);
    if (byId) return byId;
  }

  return null;
}
