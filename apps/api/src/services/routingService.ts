import {
  getGtfs,
  gtfsTimeToDate,
  getServiceDate,
  haversineMeters,
  routeTypeToMode,
  getStationId,
  getStationStopIds,
} from './gtfsLoader.js';
import { getTripDelay } from './gtfsRtService.js';
import { findNearestStops } from './stopService.js';
import { CONFIG, LINE_COLORS } from '../config.js';
import { attachRouteGeometriesAsync } from './shapeService.js';
import { getLineMetaForTrip } from './lineService.js';

export type TransitFilterMode = 'tram' | 'bus' | 'tram_bus';
const ALL_TRANSIT_FILTER_MODES: TransitFilterMode[] = ['tram', 'bus', 'tram_bus'];

export interface ApiRouteLeg {
  mode: 'walk' | 'tram' | 'bus' | 'tram_bus';
  from: string;
  to: string;
  durationMinutes: number;
  lineName?: string;
  lineShortName?: string;
  lineColor?: string;
  lineId?: string;
  tripId?: string;
  fromStopId?: string;
  toStopId?: string;
  headsign?: string;
  geometry?: { latitude: number; longitude: number }[];
}

export interface ApiRoute {
  id: string;
  legs: ApiRouteLeg[];
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  walkingMinutes: number;
  geometry: { latitude: number; longitude: number }[];
  itineraryStopIds: string[];
}

const MIN_TRANSFER_MINUTES = 4;
const MAX_TRANSIT_LEG_MINUTES = 90;
const MAX_SCAN_DEPARTURES = 120;
const ORIGIN_STOP_RADIUS_METERS = 600;
const DESTINATION_STOP_RADIUS_METERS = 800;

type StopRef = {
  id: string;
  name: string;
  coordinates: { latitude: number; longitude: number };
};

interface StationHub {
  stationId: string;
  name: string;
  stopIds: string[];
  coordinates: { latitude: number; longitude: number };
  distanceMeters: number;
}

interface DepartureCandidate {
  trip_id: string;
  departure_time: string;
  boardStopId: string;
}

const tripStopIndexCache = new Map<string, Map<string, number>>();
const departuresCache = new Map<string, DepartureCandidate[]>();

function buildWalkToStopMinutesMap(
  stopIds: Iterable<string>,
  originLat: number,
  originLon: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const stopId of stopIds) {
    const ref = stopRefFromId(stopId);
    if (!ref) continue;
    map.set(
      stopId,
      walkMinutes(originLat, originLon, ref.coordinates.latitude, ref.coordinates.longitude)
    );
  }
  return map;
}

function sortDeparturesByLeaveTime(
  departures: DepartureCandidate[],
  walkToStopMin: Map<string, number>,
  serviceDate: Date
): DepartureCandidate[] {
  if (departures.length <= 1) return departures;

  const scored = departures.map((dep) => {
    const walk = walkToStopMin.get(dep.boardStopId) ?? 999;
    const board = actualTime(dep.trip_id, dep.boardStopId, dep.departure_time, serviceDate, true);
    return {
      dep,
      leaveAt: board.getTime() - walk * 60_000,
      walk,
    };
  });

  scored.sort(
    (a, b) =>
      a.leaveAt - b.leaveAt ||
      a.walk - b.walk ||
      a.dep.departure_time.localeCompare(b.dep.departure_time)
  );

  return scored.map((entry) => entry.dep);
}

function earliestWalkMinutes(walkToStopMin: Map<string, number>): number {
  let min = Infinity;
  for (const minutes of walkToStopMin.values()) {
    if (minutes < min) min = minutes;
  }
  return Number.isFinite(min) ? min : 0;
}

function getStopIndex(tripId: string, stopId: string): number {
  let map = tripStopIndexCache.get(tripId);
  if (!map) {
    const stops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
    map = new Map(stops.map((stopTime, index) => [stopTime.stop_id, index]));
    tripStopIndexCache.set(tripId, map);
  }
  return map.get(stopId) ?? -1;
}

function routeLineMeta(routeId: string) {
  const route = getGtfs().routes.get(routeId);
  if (!route) return null;

  const shortName = route.route_short_name;
  return {
    lineName: `Ligne ${shortName}`,
    lineColor: route.route_color ? `#${route.route_color}` : LINE_COLORS[shortName] ?? '#5B8DEF',
    mode: routeTypeToMode(route.route_type),
    lineId: routeId,
  };
}

function normalizeAllowedModes(modes?: TransitFilterMode[]): Set<TransitFilterMode> {
  return new Set(modes?.length ? modes : ALL_TRANSIT_FILTER_MODES);
}

function tripModeFromId(tripId: string): TransitFilterMode | null {
  const trip = getGtfs().trips.get(tripId);
  if (!trip) return null;
  return routeLineMeta(trip.route_id)?.mode ?? null;
}

function isTripAllowed(tripId: string, allowedModes: Set<TransitFilterMode>): boolean {
  const mode = tripModeFromId(tripId);
  if (mode == null) return false;
  if (allowedModes.has(mode)) return true;
  if (
    mode === 'tram_bus' &&
    (allowedModes.has('tram') || allowedModes.has('bus'))
  ) {
    return true;
  }
  return false;
}

function buildReachableStopIds(
  lat: number,
  lon: number,
  hubStopIds: string[],
  radiusMeters: number
): Set<string> {
  const ids = new Set(hubStopIds);
  for (const stop of findNearestStops(lat, lon, 50, radiusMeters, false)) {
    ids.add(stop.id);
  }
  return ids;
}

function walkMinutes(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  return Math.ceil(haversineMeters(fromLat, fromLon, toLat, toLon) / 80);
}

function stopRefFromId(stopId: string): StopRef | null {
  const stop = getGtfs().stops.get(stopId);
  if (!stop || stop.location_type === '1') return null;
  return {
    id: stop.stop_id,
    name: stop.stop_name,
    coordinates: { latitude: stop.stop_lat, longitude: stop.stop_lon },
  };
}

function getNearestStationHubs(lat: number, lon: number, limit: number): StationHub[] {
  const nearest = findNearestStops(lat, lon, 20, 1500, false);
  const hubs = new Map<string, StationHub>();

  for (const stop of nearest) {
    const stationId = getStationId(stop.id);
    const existing = hubs.get(stationId);
    const distance = stop.distanceMeters ?? haversineMeters(lat, lon, stop.coordinates.latitude, stop.coordinates.longitude);

    if (!existing || distance < existing.distanceMeters) {
      hubs.set(stationId, {
        stationId,
        name: stop.name,
        stopIds: getStationStopIds(stop.id),
        coordinates: stop.coordinates,
        distanceMeters: Math.round(distance),
      });
    }
  }

  return [...hubs.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

function collectDepartures(
  stopIds: string[],
  allowedModes?: Set<TransitFilterMode>
): DepartureCandidate[] {
  const modeKey = allowedModes
    ? [...allowedModes].sort().join(',')
    : ALL_TRANSIT_FILTER_MODES.join(',');
  const cacheKey = `${stopIds.slice().sort().join(',')}|${modeKey}`;
  const cached = departuresCache.get(cacheKey);
  if (cached) return cached;

  const gtfs = getGtfs();
  const departures: DepartureCandidate[] = [];
  const filterByMode = allowedModes != null && allowedModes.size < ALL_TRANSIT_FILTER_MODES.length;

  for (const stopId of stopIds) {
    for (const stopTime of gtfs.stopTimesByStop.get(stopId) ?? []) {
      if (filterByMode && !isTripAllowed(stopTime.trip_id, allowedModes)) continue;
      departures.push({
        trip_id: stopTime.trip_id,
        departure_time: stopTime.departure_time,
        boardStopId: stopId,
      });
    }
  }

  const sorted = departures.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  departuresCache.set(cacheKey, sorted);
  return sorted;
}

function findDestOnTrip(
  tripId: string,
  originStopId: string,
  destStopIds: Set<string>,
  destLat: number,
  destLon: number
): { stopId: string; index: number } | null {
  const gtfs = getGtfs();
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  const originIdx = getStopIndex(tripId, originStopId);
  if (originIdx === -1) return null;

  let best: { stopId: string; index: number } | null = null;
  let bestDistance = Infinity;

  for (let i = originIdx + 1; i < tripStops.length; i++) {
    const stopId = tripStops[i].stop_id;
    if (!destStopIds.has(stopId)) continue;

    const stop = gtfs.stops.get(stopId);
    if (!stop) continue;

    const distance = haversineMeters(destLat, destLon, stop.stop_lat, stop.stop_lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { stopId, index: i };
    }
  }

  return best;
}

function isLongWayAroundTrip(
  tripId: string,
  fromStopId: string,
  toStopId: string
): boolean {
  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const fromIdx = getStopIndex(tripId, fromStopId);
  const toIdx = getStopIndex(tripId, toStopId);
  if (fromIdx < 0 || toIdx <= fromIdx) return true;

  const span = toIdx - fromIdx;
  const maxDirectSpan = Math.max(3, Math.floor(tripStops.length * 0.52));
  return span > maxDirectSpan;
}

function filterBoardableDepartures(
  departures: DepartureCandidate[],
  departureTime: Date,
  walkToStopMin: Map<string, number>,
  serviceDate: Date
): DepartureCandidate[] {
  return departures.filter((candidate) => {
    const walkToBoardMin = walkToStopMin.get(candidate.boardStopId) ?? 999;
    const minBoard = new Date(departureTime.getTime() + walkToBoardMin * 60_000);
    const actualBoard = actualTime(
      candidate.trip_id,
      candidate.boardStopId,
      candidate.departure_time,
      serviceDate,
      true
    );
    return actualBoard >= minBoard;
  });
}

function isRouteDominated(candidate: ApiRoute, baseline: ApiRoute): boolean {
  if (candidate.id === baseline.id) return false;

  const candidateLeave = new Date(candidate.departureTime).getTime();
  const baselineLeave = new Date(baseline.departureTime).getTime();
  const candidateArrive = new Date(candidate.arrivalTime).getTime();
  const baselineArrive = new Date(baseline.arrivalTime).getTime();

  const arrivesLaterOrEqual = candidateArrive >= baselineArrive;
  const walksMore = candidate.walkingMinutes > baseline.walkingMinutes;
  const leavesEarlierOrSame = candidateLeave <= baselineLeave;

  return (
    arrivesLaterOrEqual &&
    walksMore &&
    leavesEarlierOrSame &&
    candidate.totalDurationMinutes >= baseline.totalDurationMinutes
  );
}

function filterDominatedRoutes(routes: ApiRoute[]): ApiRoute[] {
  return routes.filter(
    (candidate) => !routes.some((baseline) => isRouteDominated(candidate, baseline))
  );
}

function actualTime(
  tripId: string,
  stopId: string,
  timeStr: string,
  serviceDate: Date,
  useDeparture: boolean
): Date {
  const scheduled = gtfsTimeToDate(timeStr, serviceDate);
  const delay = getTripDelay(tripId, stopId)?.delaySeconds ?? 0;
  return new Date(scheduled.getTime() + delay * 1000);
}

function routeSignature(route: ApiRoute): string {
  const leaveMinute = new Date(route.departureTime).toISOString().slice(0, 16);
  const lines = route.legs
    .filter((leg) => leg.mode !== 'walk')
    .map((leg) => leg.lineId ?? leg.lineName ?? leg.mode)
    .join('+');
  return `${leaveMinute}|${lines}`;
}

function transitPattern(route: ApiRoute): string {
  return route.legs
    .filter((leg) => leg.mode !== 'walk')
    .map((leg) => `${leg.mode}:${leg.lineId ?? leg.lineName ?? leg.mode}`)
    .join('|');
}

function sortRoutesByDeparture(routes: ApiRoute[]): ApiRoute[] {
  return [...routes].sort(
    (a, b) =>
      new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime() ||
      a.walkingMinutes - b.walkingMinutes ||
      a.totalDurationMinutes - b.totalDurationMinutes
  );
}

function dedupeRoutes(routes: ApiRoute[], count: number): ApiRoute[] {
  const sorted = sortRoutesByDeparture(routes);
  const seen = new Set<string>();
  const unique: ApiRoute[] = [];

  const earliestByPattern = new Map<string, ApiRoute>();
  for (const route of sorted) {
    const pattern = transitPattern(route);
    const existing = earliestByPattern.get(pattern);
    if (!existing) {
      earliestByPattern.set(pattern, route);
      continue;
    }
    const existingLeave = new Date(existing.departureTime).getTime();
    const routeLeave = new Date(route.departureTime).getTime();
    if (
      routeLeave < existingLeave ||
      (routeLeave === existingLeave && route.walkingMinutes < existing.walkingMinutes)
    ) {
      earliestByPattern.set(pattern, route);
    }
  }

  for (const route of sortRoutesByDeparture([...earliestByPattern.values()])) {
    const key = routeSignature(route);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
    if (unique.length >= count) return unique;
  }

  for (const route of sorted) {
    const key = routeSignature(route);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
    if (unique.length >= count) break;
  }

  return unique;
}

function buildWalkLeg(
  from: string,
  to: string,
  durationMinutes: number,
  fromStopId?: string,
  toStopId?: string
): ApiRouteLeg {
  return {
    mode: 'walk',
    from,
    to,
    durationMinutes,
    fromStopId,
    toStopId,
  };
}

function buildTransitLeg(
  tripId: string,
  fromStop: StopRef,
  toStop: StopRef,
  durationMinutes: number,
  headsign: string
): ApiRouteLeg | null {
  const trip = getGtfs().trips.get(tripId);
  if (!trip) return null;

  const meta = getLineMetaForTrip(tripId);
  if (!meta) return null;

  return {
    mode: meta.mode,
    from: fromStop.name,
    to: toStop.name,
    durationMinutes,
    lineName: meta.lineName,
    lineShortName: meta.shortName,
    lineColor: meta.lineColor,
    lineId: trip.route_id,
    tripId,
    fromStopId: fromStop.id,
    toStopId: toStop.id,
    headsign,
  };
}

function buildRoute(
  legs: ApiRouteLeg[],
  leaveAt: Date,
  arrivalAt: Date,
  walkingMinutes: number
): ApiRoute {
  const totalDurationMinutes = Math.max(
    1,
    Math.round((arrivalAt.getTime() - leaveAt.getTime()) / 60_000)
  );

  const transitKey = legs
    .filter((leg) => leg.mode !== 'walk')
    .map((leg) => leg.tripId ?? leg.lineId)
    .join('-');

  return {
    id: `gtfs-${transitKey}-${leaveAt.getTime()}`,
    legs,
    totalDurationMinutes,
    departureTime: leaveAt.toISOString(),
    arrivalTime: arrivalAt.toISOString(),
    walkingMinutes,
    geometry: [],
    itineraryStopIds: getItineraryStopIds(legs),
  };
}

export function getItineraryStopIds(legs: ApiRouteLeg[]): string[] {
  const gtfs = getGtfs();
  const ids = new Set<string>();

  for (const leg of legs) {
    if (leg.mode === 'walk') {
      if (leg.fromStopId) ids.add(leg.fromStopId);
      if (leg.toStopId) ids.add(leg.toStopId);
      continue;
    }

    if (!leg.tripId || !leg.fromStopId || !leg.toStopId) {
      if (leg.fromStopId) ids.add(leg.fromStopId);
      if (leg.toStopId) ids.add(leg.toStopId);
      continue;
    }

    const tripStops = gtfs.stopTimesByTrip.get(leg.tripId) ?? [];
    const fromIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === leg.fromStopId);
    const toIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === leg.toStopId);

    if (fromIdx >= 0 && toIdx > fromIdx) {
      for (let i = fromIdx; i <= toIdx; i++) {
        ids.add(tripStops[i].stop_id);
      }
      continue;
    }

    ids.add(leg.fromStopId);
    ids.add(leg.toStopId);
  }

  return [...ids];
}

export async function planRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date = new Date()
): Promise<ApiRoute | null> {
  const routes = await planRoutes(originLat, originLon, destLat, destLon, departureTime, 1);
  return routes[0] ?? null;
}

export async function planRoutes(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date = new Date(),
  count = 3,
  allowedModes?: TransitFilterMode[]
): Promise<ApiRoute[]> {
  const gtfsRoutes = planGtfsRoutes(
    originLat,
    originLon,
    destLat,
    destLon,
    departureTime,
    getServiceDate(),
    count,
    allowedModes
  );
  if (gtfsRoutes.length > 0) return gtfsRoutes;

  return tryOtpRoutes(originLat, originLon, destLat, destLon, departureTime, count, allowedModes);
}

export async function buildRouteGeometryForRoute(
  route: ApiRoute,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<ApiRoute> {
  return attachRouteGeometriesAsync(route, originLat, originLon, destLat, destLon);
}

async function tryOtpRoutes(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date,
  count: number,
  allowedModes?: TransitFilterMode[]
): Promise<ApiRoute[]> {
  const allowed = normalizeAllowedModes(allowedModes);
  try {
    const url = new URL('/otp/routers/default/plan', CONFIG.otpUrl);
    url.searchParams.set('fromPlace', `${originLat},${originLon}`);
    url.searchParams.set('toPlace', `${destLat},${destLon}`);
    url.searchParams.set('mode', 'WALK,TRANSIT');
    url.searchParams.set('date', departureTime.toISOString().split('T')[0]);
    url.searchParams.set('time', departureTime.toTimeString().slice(0, 5));
    url.searchParams.set('arriveBy', 'false');
    url.searchParams.set('numItineraries', String(count));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    const itineraries = data.plan?.itineraries ?? [];
    if (!itineraries.length) return [];

    return itineraries
      .slice(0, count)
      .map(
        (
          itinerary: {
            duration: number;
            startTime: number;
            endTime: number;
            legs: Array<{
              mode: string;
              from: { name: string };
              to: { name: string };
              duration: number;
              route?: string;
              routeColor?: string;
            }>;
          },
          index: number
        ): ApiRoute | null => {
          const legs: ApiRouteLeg[] = itinerary.legs.map((leg) => ({
            mode: leg.mode === 'WALK' ? 'walk' : ('tram' as const),
            from: leg.from.name,
            to: leg.to.name,
            durationMinutes: Math.round(leg.duration / 60),
            lineName: leg.route,
            lineColor: leg.routeColor ? `#${leg.routeColor}` : undefined,
          }));

          const route: ApiRoute = {
            id: `otp-${itinerary.startTime}-${index}`,
            legs,
            totalDurationMinutes: Math.round(itinerary.duration / 60),
            departureTime: new Date(itinerary.startTime).toISOString(),
            arrivalTime: new Date(itinerary.endTime).toISOString(),
            walkingMinutes: legs
              .filter((leg) => leg.mode === 'walk')
              .reduce((sum, leg) => sum + leg.durationMinutes, 0),
            geometry: [],
            itineraryStopIds: getItineraryStopIds(legs),
          };

          const usesOnlyAllowedModes = route.legs.every(
            (leg) => leg.mode === 'walk' || allowed.has(leg.mode)
          );
          return usesOnlyAllowedModes ? route : null;
        }
      )
      .filter((route: ApiRoute | null): route is ApiRoute => route != null);
  } catch {
    return [];
  }
}

function planGtfsRoutes(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date,
  serviceDate: Date,
  count: number,
  allowedModes?: TransitFilterMode[]
): ApiRoute[] {
  const allowed = normalizeAllowedModes(allowedModes);
  const originHubs = getNearestStationHubs(originLat, originLon, 2);
  const destHubs = getNearestStationHubs(destLat, destLon, 2);

  if (originHubs.length === 0 || destHubs.length === 0) return [];

  const candidates: ApiRoute[] = [];
  const perSearchLimit = count * 3;

  for (const originHub of originHubs) {
    for (const destHub of destHubs) {
      if (originHub.stationId === destHub.stationId) continue;

      const originStopIds = [...buildReachableStopIds(
        originLat,
        originLon,
        originHub.stopIds,
        ORIGIN_STOP_RADIUS_METERS
      )];
      const destStopIds = buildReachableStopIds(
        destLat,
        destLon,
        destHub.stopIds,
        DESTINATION_STOP_RADIUS_METERS
      );

      candidates.push(
        ...findDirectRoutes(
          originHub,
          destHub,
          originStopIds,
          destStopIds,
          originLat,
          originLon,
          destLat,
          destLon,
          departureTime,
          serviceDate,
          perSearchLimit,
          allowed
        ),
        ...findOneTransferRoutes(
          originHub,
          destHub,
          originStopIds,
          destStopIds,
          originLat,
          originLon,
          destLat,
          destLon,
          departureTime,
          serviceDate,
          perSearchLimit,
          allowed
        )
      );
    }
  }

  const filtered = filterDominatedRoutes(candidates);
  return dedupeRoutes(filtered, count);
}

function findDirectRoutes(
  originHub: StationHub,
  destHub: StationHub,
  originStopIds: string[],
  destStopIds: Set<string>,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date,
  serviceDate: Date,
  limit: number,
  allowedModes: Set<TransitFilterMode>
): ApiRoute[] {
  const walkToStopMin = buildWalkToStopMinutesMap(originStopIds, originLat, originLon);
  if (walkToStopMin.size === 0) return [];

  const departures = collectDepartures(originStopIds, allowedModes);
  const minWalkMin = earliestWalkMinutes(walkToStopMin);
  const earliestBoard = new Date(departureTime.getTime() + minWalkMin * 60_000);
  const startIndex = firstDepartureIndex(departures, departureTime, serviceDate);
  const scanDepartures = sortDeparturesByLeaveTime(
    filterBoardableDepartures(
      departuresReachingDestination(
        departuresWithinScanWindow(departures, startIndex, departureTime, 45, serviceDate),
        destStopIds,
        destLat,
        destLon
      ),
      departureTime,
      walkToStopMin,
      serviceDate
    ),
    walkToStopMin,
    serviceDate
  ).slice(0, MAX_SCAN_DEPARTURES);
  const routes: ApiRoute[] = [];

  for (let i = 0; i < scanDepartures.length; i++) {
    const candidate = scanDepartures[i];
    const trip = getGtfs().trips.get(candidate.trip_id);
    if (!trip) continue;
    if (!isTripAllowed(candidate.trip_id, allowedModes)) continue;

    const boardRef = stopRefFromId(candidate.boardStopId);
    if (!boardRef) continue;

    const walkToBoardMin = walkToStopMin.get(candidate.boardStopId) ?? 999;
    const minBoard = new Date(departureTime.getTime() + walkToBoardMin * 60_000);

    const actualBoard = actualTime(
      candidate.trip_id,
      candidate.boardStopId,
      candidate.departure_time,
      serviceDate,
      true
    );
    if (actualBoard < minBoard) continue;

    const destOnTrip = findDestOnTrip(
      candidate.trip_id,
      candidate.boardStopId,
      destStopIds,
      destLat,
      destLon
    );
    if (!destOnTrip) continue;

    if (isLongWayAroundTrip(candidate.trip_id, candidate.boardStopId, destOnTrip.stopId)) {
      continue;
    }

    const alightRef = stopRefFromId(destOnTrip.stopId);
    if (!alightRef) continue;

    const walkFromDestMin = walkMinutes(
      destLat,
      destLon,
      alightRef.coordinates.latitude,
      alightRef.coordinates.longitude
    );

    const tripStops = getGtfs().stopTimesByTrip.get(candidate.trip_id) ?? [];
    const alightStopTime = tripStops[destOnTrip.index];
    const actualAlight = actualTime(
      candidate.trip_id,
      destOnTrip.stopId,
      alightStopTime.arrival_time,
      serviceDate,
      false
    );

    const transitMin = Math.round((actualAlight.getTime() - actualBoard.getTime()) / 60_000);
    if (transitMin <= 0 || transitMin > MAX_TRANSIT_LEG_MINUTES) continue;

    const transitLeg = buildTransitLeg(
      candidate.trip_id,
      boardRef,
      alightRef,
      transitMin,
      trip.trip_headsign
    );
    if (!transitLeg) continue;

    const leaveAt = new Date(actualBoard.getTime() - walkToBoardMin * 60_000);
    const arrivalAt = new Date(actualAlight.getTime() + walkFromDestMin * 60_000);

    routes.push(
      buildRoute(
        [
          buildWalkLeg('Départ', boardRef.name, walkToBoardMin, undefined, boardRef.id),
          transitLeg,
          buildWalkLeg(alightRef.name, 'Arrivée', walkFromDestMin, alightRef.id),
        ],
        leaveAt,
        arrivalAt,
        walkToBoardMin + walkFromDestMin
      )
    );
  }

  return routes
    .sort(
      (a, b) =>
        a.walkingMinutes - b.walkingMinutes ||
        a.totalDurationMinutes - b.totalDurationMinutes ||
        new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime()
    )
    .slice(0, limit);
}

function departuresReachingDestination(
  departures: DepartureCandidate[],
  destStopIds: Set<string>,
  destLat: number,
  destLon: number
): DepartureCandidate[] {
  const reachable: DepartureCandidate[] = [];

  for (const departure of departures) {
    if (
      findDestOnTrip(
        departure.trip_id,
        departure.boardStopId,
        destStopIds,
        destLat,
        destLon
      )
    ) {
      reachable.push(departure);
    }
  }

  return reachable;
}

function departuresWithinScanWindow(
  departures: DepartureCandidate[],
  startIndex: number,
  departureTime: Date,
  windowMinutes: number,
  serviceDate: Date
): DepartureCandidate[] {
  const end = new Date(departureTime.getTime() + windowMinutes * 60_000);
  const slice: DepartureCandidate[] = [];

  for (let i = startIndex; i < departures.length; i++) {
    const board = gtfsTimeToDate(departures[i].departure_time, serviceDate);
    if (board > end) break;
    slice.push(departures[i]);
  }

  return slice;
}

function firstDepartureIndex(
  departures: DepartureCandidate[],
  minBoard: Date,
  serviceDate: Date
): number {
  let lo = 0;
  let hi = departures.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const board = gtfsTimeToDate(departures[mid].departure_time, serviceDate);
    if (board < minBoard) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findOneTransferRoutes(
  originHub: StationHub,
  destHub: StationHub,
  originStopIds: string[],
  destStopIds: Set<string>,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  departureTime: Date,
  serviceDate: Date,
  limit: number,
  allowedModes: Set<TransitFilterMode>
): ApiRoute[] {
  const walkToStopMin = buildWalkToStopMinutesMap(originStopIds, originLat, originLon);
  if (walkToStopMin.size === 0) return [];

  const originStopIdSet = new Set(originStopIds);
  const departures = collectDepartures(originStopIds, allowedModes);
  const minWalkMin = earliestWalkMinutes(walkToStopMin);
  const startIndex = firstDepartureIndex(departures, departureTime, serviceDate);
  const scanDepartures = sortDeparturesByLeaveTime(
    filterBoardableDepartures(
      departuresWithinScanWindow(departures, startIndex, departureTime, 45, serviceDate),
      departureTime,
      walkToStopMin,
      serviceDate
    ),
    walkToStopMin,
    serviceDate
  ).slice(0, MAX_SCAN_DEPARTURES);
  const routes: ApiRoute[] = [];

  for (let i = 0; i < scanDepartures.length && routes.length < limit; i++) {
    const leg1 = scanDepartures[i];
    const trip1 = getGtfs().trips.get(leg1.trip_id);
    if (!trip1) continue;
    if (!isTripAllowed(leg1.trip_id, allowedModes)) continue;

    const boardRef = stopRefFromId(leg1.boardStopId);
    if (!boardRef) continue;

    const walkToBoardMin = walkToStopMin.get(leg1.boardStopId) ?? 999;
    const minBoard = new Date(departureTime.getTime() + walkToBoardMin * 60_000);

    const actualBoard1 = actualTime(
      leg1.trip_id,
      leg1.boardStopId,
      leg1.departure_time,
      serviceDate,
      true
    );
    if (actualBoard1 < minBoard) continue;

    if (findDestOnTrip(leg1.trip_id, leg1.boardStopId, destStopIds, destLat, destLon)) continue;

    const trip1Stops = getGtfs().stopTimesByTrip.get(leg1.trip_id) ?? [];
    const originIdx = getStopIndex(leg1.trip_id, leg1.boardStopId);
    if (originIdx === -1) continue;

    for (let transferIdx = originIdx + 1; transferIdx < trip1Stops.length; transferIdx++) {
      const transferStopId = trip1Stops[transferIdx].stop_id;
      if (originStopIdSet.has(transferStopId) || destStopIds.has(transferStopId)) continue;

      const transferRef = stopRefFromId(transferStopId);
      if (!transferRef) continue;

      const transferArrival = actualTime(
        leg1.trip_id,
        transferStopId,
        trip1Stops[transferIdx].arrival_time,
        serviceDate,
        false
      );
      const minConnection = new Date(
        transferArrival.getTime() + MIN_TRANSFER_MINUTES * 60_000
      );

      const leg2Candidates = collectDepartures(getStationStopIds(transferStopId), allowedModes);
      const leg2Start = firstDepartureIndex(leg2Candidates, minConnection, serviceDate);
      const leg2End = Math.min(leg2Candidates.length, leg2Start + 20);

      for (let j = leg2Start; j < leg2End; j++) {
        const leg2 = leg2Candidates[j];
        if (leg2.trip_id === leg1.trip_id) continue;

        const trip2 = getGtfs().trips.get(leg2.trip_id);
        if (!trip2) continue;
        if (!isTripAllowed(leg2.trip_id, allowedModes)) continue;

        if (leg2.boardStopId !== transferStopId) {
          const boardIdx = getStopIndex(leg2.trip_id, leg2.boardStopId);
          const transferIdx2 = getStopIndex(leg2.trip_id, transferStopId);
          if (transferIdx2 === -1 || boardIdx !== transferIdx2) continue;
        }

        const actualBoard2 = actualTime(
          leg2.trip_id,
          leg2.boardStopId,
          leg2.departure_time,
          serviceDate,
          true
        );
        if (actualBoard2 < minConnection) continue;

        const destOnTrip = findDestOnTrip(
          leg2.trip_id,
          leg2.boardStopId,
          destStopIds,
          destLat,
          destLon
        );
        if (!destOnTrip) continue;

        if (isLongWayAroundTrip(leg2.trip_id, leg2.boardStopId, destOnTrip.stopId)) {
          continue;
        }

        const alightRef = stopRefFromId(destOnTrip.stopId);
        if (!alightRef) continue;

        const walkFromDestMin = walkMinutes(
          destLat,
          destLon,
          alightRef.coordinates.latitude,
          alightRef.coordinates.longitude
        );

        const trip2Stops = getGtfs().stopTimesByTrip.get(leg2.trip_id) ?? [];
        const leg1Min = Math.round(
          (transferArrival.getTime() - actualBoard1.getTime()) / 60_000
        );
        const leg2Alight = actualTime(
          leg2.trip_id,
          destOnTrip.stopId,
          trip2Stops[destOnTrip.index].arrival_time,
          serviceDate,
          false
        );
        const leg2Min = Math.round((leg2Alight.getTime() - actualBoard2.getTime()) / 60_000);
        if (leg1Min <= 0 || leg2Min <= 0) continue;
        if (leg1Min + leg2Min > MAX_TRANSIT_LEG_MINUTES * 2) continue;

        const transitLeg1 = buildTransitLeg(
          leg1.trip_id,
          boardRef,
          transferRef,
          leg1Min,
          trip1.trip_headsign
        );
        const transitLeg2 = buildTransitLeg(
          leg2.trip_id,
          transferRef,
          alightRef,
          leg2Min,
          trip2.trip_headsign
        );
        if (!transitLeg1 || !transitLeg2) continue;

        const leaveAt = new Date(actualBoard1.getTime() - walkToBoardMin * 60_000);
        const arrivalAt = new Date(leg2Alight.getTime() + walkFromDestMin * 60_000);

        routes.push(
          buildRoute(
            [
              buildWalkLeg('Départ', boardRef.name, walkToBoardMin, undefined, boardRef.id),
              transitLeg1,
              transitLeg2,
              buildWalkLeg(alightRef.name, 'Arrivée', walkFromDestMin, alightRef.id),
            ],
            leaveAt,
            arrivalAt,
            walkToBoardMin + walkFromDestMin
          )
        );

        if (routes.length >= limit) return routes;
        break;
      }
    }
  }

  return routes;
}

export function estimateWalkingMinutes(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  return walkMinutes(fromLat, fromLon, toLat, toLon);
}
