import {
  getGtfs,
  gtfsTimeToDate,
  getServiceDate,
  haversineMeters,
  routeTypeToMode,
  type GtfsStop,
} from './gtfsLoader.js';
import { getTripDelay } from './gtfsRtService.js';
import { LINE_COLORS } from '../config.js';

export interface ApiStop {
  id: string;
  name: string;
  coordinates: { latitude: number; longitude: number };
  modes: string[];
  distanceMeters?: number;
}

export interface ApiDeparture {
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  scheduledTime: string;
  realtimeTime?: string;
  isRealtime: boolean;
  mode: 'tram' | 'bus' | 'tram_bus';
  tripId: string;
  headsign: string;
}

export function searchStops(query: string, limit = 20): ApiStop[] {
  const gtfs = getGtfs();
  const q = normalize(query);
  if (!q) return [];

  const scored: { stop: ApiStop; score: number }[] = [];
  const seenNames = new Set<string>();

  for (const stop of gtfs.stops.values()) {
    if (stop.location_type === '1') continue;

    const score = scoreStopMatch(normalize(stop.stop_name), q);
    if (score <= 0) continue;

    const nameKey = normalize(stop.stop_name);
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    const modes = getStopModes(stop.stop_id);
    scored.push({ stop: stopToApi(stop, modes), score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.stop.name.localeCompare(b.stop.name, 'fr'))
    .slice(0, limit)
    .map((s) => s.stop);
}

function scoreStopMatch(name: string, query: string): number {
  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  if (name.includes(query)) return 75;

  const queryWords = query.split(/\s+/).filter(Boolean);
  if (queryWords.length > 1 && queryWords.every((w) => name.includes(w))) return 70;

  const nameWords = name.split(/\s+/).filter(Boolean);
  if (queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw) || nw.includes(qw)))) {
    return 62;
  }

  return 0;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function findNearestStops(
  lat: number,
  lon: number,
  limit = 5,
  maxDistanceM = 800,
  preferTram = false
): ApiStop[] {
  const gtfs = getGtfs();
  const results: ApiStop[] = [];

  for (const stop of gtfs.stops.values()) {
    if (stop.location_type === '1') continue;
    const dist = haversineMeters(lat, lon, stop.stop_lat, stop.stop_lon);
    if (dist > maxDistanceM) continue;
    results.push({ ...stopToApi(stop, getStopModes(stop.stop_id)), distanceMeters: Math.round(dist) });
  }

  return results
    .sort((a, b) => {
      const distA = a.distanceMeters ?? 0;
      const distB = b.distanceMeters ?? 0;
      if (!preferTram) return distA - distB;
      const tramBias = (stop: ApiStop) => (stop.modes.includes('tram') ? -40 : 0);
      return distA + tramBias(a) - (distB + tramBias(b));
    })
    .slice(0, limit);
}

export interface StopBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function findStopsInBbox(bbox: StopBbox, limit = 250): ApiStop[] {
  const gtfs = getGtfs();
  const results: ApiStop[] = [];
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLon = (bbox.east + bbox.west) / 2;

  for (const stop of gtfs.stops.values()) {
    if (stop.location_type === '1') continue;
    if (
      stop.stop_lat > bbox.north ||
      stop.stop_lat < bbox.south ||
      stop.stop_lon > bbox.east ||
      stop.stop_lon < bbox.west
    ) {
      continue;
    }
    const dist = haversineMeters(centerLat, centerLon, stop.stop_lat, stop.stop_lon);
    results.push({ ...stopToApi(stop, getStopModes(stop.stop_id)), distanceMeters: Math.round(dist) });
  }

  return results
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}

export function getStopById(stopId: string): ApiStop | null {
  const gtfs = getGtfs();
  const stop = gtfs.stops.get(stopId);
  if (!stop) return null;
  return stopToApi(stop, getStopModes(stopId));
}

export function getDepartures(stopId: string, count = 10): ApiDeparture[] {
  const gtfs = getGtfs();
  const now = new Date();
  const serviceDate = getServiceDate();
  const stopTimes = gtfs.stopTimesByStop.get(stopId) ?? [];
  const departures: ApiDeparture[] = [];

  for (const st of stopTimes) {
    const trip = gtfs.trips.get(st.trip_id);
    if (!trip) continue;

    const route = gtfs.routes.get(trip.route_id);
    if (!route) continue;

    const scheduled = gtfsTimeToDate(st.departure_time, serviceDate);
    if (scheduled < now) continue;

    const delay = getTripDelay(st.trip_id, stopId);
    const delaySeconds = delay?.delaySeconds ?? 0;
    const realtime = new Date(scheduled.getTime() + delaySeconds * 1000);
    const hasRt = delay !== undefined;

    const shortName = route.route_short_name;
    departures.push({
      lineId: route.route_id,
      lineName: `Ligne ${shortName}`,
      lineColor: route.route_color
        ? `#${route.route_color}`
        : LINE_COLORS[shortName] ?? '#5B8DEF',
      direction: trip.trip_headsign,
      scheduledTime: scheduled.toISOString(),
      realtimeTime: hasRt ? realtime.toISOString() : scheduled.toISOString(),
      isRealtime: hasRt,
      mode: routeTypeToMode(route.route_type),
      tripId: st.trip_id,
      headsign: trip.trip_headsign,
    });
  }

  return departures
    .filter((d) => {
      const t = new Date(d.realtimeTime ?? d.scheduledTime).getTime();
      return t - now.getTime() <= 3 * 60 * 60_000;
    })
    .sort(
      (a, b) =>
        new Date(a.realtimeTime ?? a.scheduledTime).getTime() -
        new Date(b.realtimeTime ?? b.scheduledTime).getTime()
    )
    .slice(0, count);
}

function getStopModes(stopId: string): string[] {
  const gtfs = getGtfs();
  const stopTimes = gtfs.stopTimesByStop.get(stopId) ?? [];
  const modes = new Set<string>();

  for (const st of stopTimes.slice(0, 50)) {
    const trip = gtfs.trips.get(st.trip_id);
    if (!trip) continue;
    const route = gtfs.routes.get(trip.route_id);
    if (!route) continue;
    modes.add(routeTypeToMode(route.route_type));
  }

  return Array.from(modes);
}

function stopToApi(stop: GtfsStop, modes: string[]): ApiStop {
  return {
    id: stop.stop_id,
    name: stop.stop_name,
    coordinates: { latitude: stop.stop_lat, longitude: stop.stop_lon },
    modes,
  };
}
