import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import { CONFIG, TAM } from '../config.js';

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type?: string;
  parent_station?: string;
}

export interface GtfsRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  route_color?: string;
}

export interface GtfsTrip {
  trip_id: string;
  route_id: string;
  trip_headsign: string;
  direction_id: string;
  shape_id?: string;
}

export interface GtfsShapePoint {
  lat: number;
  lon: number;
  sequence: number;
}

export interface GtfsStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

export interface GtfsData {
  stops: Map<string, GtfsStop>;
  routes: Map<string, GtfsRoute>;
  trips: Map<string, GtfsTrip>;
  shapes: Map<string, GtfsShapePoint[]>;
  stopTimesByStop: Map<string, GtfsStopTime[]>;
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  /** station (parent_station ou stop_id) → quais / arrêts enfants */
  stopsByStation: Map<string, string[]>;
  loadedAt: Date;
}

let cachedData: GtfsData | null = null;

function parseCsv<T extends Record<string, string>>(content: string): T[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as T[];
}

function readZipCsv(zip: AdmZip, filename: string): string | null {
  const entry = zip.getEntry(filename);
  if (!entry) return null;
  const content = entry.getData().toString('utf-8');
  // Supprimer BOM UTF-8
  return content.replace(/^\uFEFF/, '');
}

export async function loadGtfs(force = false): Promise<GtfsData> {
  if (
    cachedData &&
    !force &&
    Date.now() - cachedData.loadedAt.getTime() < CONFIG.gtfsRefreshHours * 3600_000
  ) {
    return cachedData;
  }

  const cacheDir = CONFIG.gtfsCacheDir;
  const zipPath = path.join(cacheDir, 'gtfs.zip');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const needsDownload =
    force || !fs.existsSync(zipPath) || Date.now() - fs.statSync(zipPath).mtimeMs > CONFIG.gtfsRefreshHours * 3600_000;

  if (needsDownload) {
    console.log('[GTFS] Téléchargement…', TAM.gtfs.combined);
    const response = await fetch(TAM.gtfs.combined);
    if (!response.ok) {
      // Fallback urbain + suburban
      console.log('[GTFS] Fallback urbain…');
      const urban = await fetch(TAM.gtfs.urban);
      if (!urban.ok) throw new Error(`GTFS download failed: ${urban.status}`);
      const buffer = Buffer.from(await urban.arrayBuffer());
      fs.writeFileSync(zipPath, buffer);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(zipPath, buffer);
    }
    console.log('[GTFS] Téléchargé →', zipPath);
  }

  const zip = new AdmZip(zipPath);

  const stopsRaw = parseCsv<Record<string, string>>(readZipCsv(zip, 'stops.txt') ?? '');
  const routesRaw = parseCsv<Record<string, string>>(readZipCsv(zip, 'routes.txt') ?? '');
  const tripsRaw = parseCsv<Record<string, string>>(readZipCsv(zip, 'trips.txt') ?? '');
  const stopTimesRaw = parseCsv<Record<string, string>>(readZipCsv(zip, 'stop_times.txt') ?? '');
  const shapesRaw = parseCsv<Record<string, string>>(readZipCsv(zip, 'shapes.txt') ?? '');

  const stops = new Map<string, GtfsStop>();
  for (const s of stopsRaw) {
    stops.set(s.stop_id, {
      stop_id: s.stop_id,
      stop_name: s.stop_name,
      stop_lat: parseFloat(s.stop_lat),
      stop_lon: parseFloat(s.stop_lon),
      location_type: s.location_type,
      parent_station: s.parent_station,
    });
  }

  const routes = new Map<string, GtfsRoute>();
  for (const r of routesRaw) {
    routes.set(r.route_id, {
      route_id: r.route_id,
      route_short_name: r.route_short_name,
      route_long_name: r.route_long_name,
      route_type: r.route_type,
      route_color: r.route_color,
    });
  }

  const trips = new Map<string, GtfsTrip>();
  for (const t of tripsRaw) {
    trips.set(t.trip_id, {
      trip_id: t.trip_id,
      route_id: t.route_id,
      trip_headsign: t.trip_headsign,
      direction_id: t.direction_id,
      shape_id: t.shape_id || undefined,
    });
  }

  const shapes = new Map<string, GtfsShapePoint[]>();
  for (const row of shapesRaw) {
    const shapeId = row.shape_id;
    if (!shapeId) continue;
    if (!shapes.has(shapeId)) shapes.set(shapeId, []);
    shapes.get(shapeId)!.push({
      lat: parseFloat(row.shape_pt_lat),
      lon: parseFloat(row.shape_pt_lon),
      sequence: parseInt(row.shape_pt_sequence, 10),
    });
  }
  for (const points of shapes.values()) {
    points.sort((a, b) => a.sequence - b.sequence);
  }

  const stopTimesByStop = new Map<string, GtfsStopTime[]>();
  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();

  for (const st of stopTimesRaw) {
    const entry: GtfsStopTime = {
      trip_id: st.trip_id,
      arrival_time: st.arrival_time,
      departure_time: st.departure_time,
      stop_id: st.stop_id,
      stop_sequence: parseInt(st.stop_sequence, 10),
    };

    if (!stopTimesByStop.has(st.stop_id)) stopTimesByStop.set(st.stop_id, []);
    stopTimesByStop.get(st.stop_id)!.push(entry);

    if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
    stopTimesByTrip.get(st.trip_id)!.push(entry);
  }

  // Trier par séquence
  for (const [, times] of stopTimesByTrip) {
    times.sort((a, b) => a.stop_sequence - b.stop_sequence);
  }

  const stopsByStation = new Map<string, string[]>();
  for (const stop of stops.values()) {
    if (stop.location_type === '1') {
      if (!stopsByStation.has(stop.stop_id)) stopsByStation.set(stop.stop_id, []);
      continue;
    }
    const stationId = stop.parent_station || stop.stop_id;
    if (!stopsByStation.has(stationId)) stopsByStation.set(stationId, []);
    stopsByStation.get(stationId)!.push(stop.stop_id);
  }

  cachedData = {
    stops,
    routes,
    trips,
    shapes,
    stopTimesByStop,
    stopTimesByTrip,
    stopsByStation,
    loadedAt: new Date(),
  };

  console.log(
    `[GTFS] Chargé: ${stops.size} arrêts, ${routes.size} lignes, ${trips.size} trajets, ${shapes.size} tracés`
  );

  return cachedData;
}

export function getGtfs(): GtfsData {
  if (!cachedData) throw new Error('GTFS not loaded — call loadGtfs() first');
  return cachedData;
}

/** Identifiant de station (parent GTFS ou stop seul) */
export function getStationId(stopId: string): string {
  const stop = getGtfs().stops.get(stopId);
  if (!stop) return stopId;
  return stop.parent_station || stop.stop_id;
}

/** Tous les quais / arrêts équivalents d'une même station */
export function getStationStopIds(stopId: string): string[] {
  const stationId = getStationId(stopId);
  return getGtfs().stopsByStation.get(stationId) ?? [stopId];
}

/** Minuit du jour de service à Paris (timestamp UTC ms) */
const parisMidnightCache = new Map<string, number>();

function getParisMidnightMs(refDate = new Date()): number {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(refDate);

  const cached = parisMidnightCache.get(dateKey);
  if (cached !== undefined) return cached;

  const [y, mo, d] = dateKey.split('-').map(Number);

  const parisDateKey = (utcMs: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(utcMs));

  const parisHour = (utcMs: number) =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(utcMs))
    );

  let midnightMs = Date.UTC(y, mo - 1, d - 1, 22, 0, 0);

  for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
    for (let hour = 0; hour < 24; hour++) {
      const candidate = Date.UTC(y, mo - 1, d + dayOffset, hour, 0, 0);
      if (parisDateKey(candidate) === dateKey && parisHour(candidate) === 0) {
        midnightMs = candidate;
        break;
      }
    }
  }

  parisMidnightCache.set(dateKey, midnightMs);
  return midnightMs;
}

/** Convertit HH:MM:SS GTFS en Date (fuseau Europe/Paris, heures > 24h) */
export function gtfsTimeToDate(timeStr: string, refDate = new Date()): Date {
  const [h, m, s] = timeStr.split(':').map(Number);
  const totalSeconds = h * 3600 + m * 60 + (s ?? 0);
  const midnightMs = getParisMidnightMs(refDate);
  return new Date(midnightMs + totalSeconds * 1000);
}

/** Date de référence service (minuit Paris) */
export function getServiceDate(): Date {
  return new Date(getParisMidnightMs());
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function routeTypeToMode(routeType: string): 'tram' | 'bus' | 'tram_bus' {
  const t = parseInt(routeType, 10);
  if (t === 0) return 'tram';
  if (t === 3) return 'bus';
  return 'tram_bus';
}
