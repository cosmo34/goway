import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import {
  getGtfs,
  haversineMeters,
  isTripServicePreferred,
  routeToMode,
  type GtfsRoute,
} from './gtfsLoader.js';
import type { ShapeCoordinate } from './shapeService.js';

const TRAM_LINES_URL =
  'https://data.montpellier3m.fr/sites/default/files/ressources/MMM_MMM_LigneTram.json';
const BUS_LINES_URL =
  'https://data.montpellier3m.fr/sites/default/files/ressources/MMM_MMM_BusLigne.json';
const BUSTRAM_LINES_URL =
  'https://data.montpellier3m.fr/sites/default/files/ressources/MMM_MMM_Bustram.json';

interface NetworkLineFeature {
  /** Numéro d’exploitation MMM (tram/bus). 0 si ligne lettre (Bustram). */
  lineNumber: number;
  /** Code lettre Bustram (A–E), si applicable. */
  lineCode?: string;
  mode: 'tram' | 'bus' | 'tram_bus';
  name: string;
  sens: string;
  coordinates: ShapeCoordinate[];
}

let networkFeatures: NetworkLineFeature[] | null = null;
const tripShapeContextCache = new Map<string, TripShapeContext>();
const tripLineShapeCache = new Map<string, ShapeCoordinate[]>();

interface TripShapeContext {
  shape: ShapeCoordinate[];
  matchedStops: number;
  totalStops: number;
}

const MAX_SNAP_DISTANCE_METERS = 220;
const MAX_SCORE_SNAP_DISTANCE_METERS = 550;
const MAX_SHAPE_GAP_METERS = 250;
/** Les GeoJSON MMM ont parfois des trous ~500 m (ex. L3 Picasso → Boirargues). */
const DENSE_SHAPE_GAP_METERS = 600;
const DENSE_SHAPE_MIN_POINTS = 12;
const SHAPE_SEARCH_WINDOW = 1200;

/** Bus de substitution / lignes sans tracé MMM dédié → tracés tram associés. */
const ROUTE_LINE_ALIASES: Record<string, number[]> = {
  '91': [91, 1],
  '92': [92, 2],
};

function appendShapePoints(path: ShapeCoordinate[], chunk: ShapeCoordinate[]) {
  for (const point of chunk) {
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

function maxSegmentJump(segment: ShapeCoordinate[]): number {
  let max = 0;
  for (let i = 1; i < segment.length; i++) {
    max = Math.max(
      max,
      haversineMeters(
        segment[i - 1].latitude,
        segment[i - 1].longitude,
        segment[i].latitude,
        segment[i].longitude
      )
    );
  }
  return max;
}

function longestContinuousChain(shape: ShapeCoordinate[]): ShapeCoordinate[] {
  if (shape.length < 2) return shape;

  const chains: ShapeCoordinate[][] = [];
  let current: ShapeCoordinate[] = [shape[0]];

  for (let i = 1; i < shape.length; i++) {
    const gap = haversineMeters(
      shape[i - 1].latitude,
      shape[i - 1].longitude,
      shape[i].latitude,
      shape[i].longitude
    );

    if (gap > MAX_SHAPE_GAP_METERS) {
      chains.push(current);
      current = [shape[i]];
    } else {
      current.push(shape[i]);
    }
  }

  chains.push(current);
  return chains.reduce((longest, chain) => (chain.length > longest.length ? chain : longest));
}

export async function loadNetworkShapes(force = false): Promise<void> {
  if (networkFeatures && !force) return;

  const cacheDir = CONFIG.gtfsCacheDir;
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const tramCachePath = path.join(cacheDir, 'tram-lines.json');
  const busCachePath = path.join(cacheDir, 'bus-lines.json');
  const bustramCachePath = path.join(cacheDir, 'bustram-lines.json');

  const loadJson = async (url: string, cachePath: string, label: string): Promise<string> => {
    const cacheFresh =
      !force &&
      fs.existsSync(cachePath) &&
      Date.now() - fs.statSync(cachePath).mtimeMs < CONFIG.gtfsRefreshHours * 3600_000;

    if (cacheFresh) return fs.readFileSync(cachePath, 'utf-8');

    console.log(`[NetworkShapes] Téléchargement ${label}…`, url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${label} download failed: ${response.status}`);
    }
    const raw = await response.text();
    fs.writeFileSync(cachePath, raw);
    console.log(`[NetworkShapes] ${label} →`, cachePath);
    return raw;
  };

  const [tramRaw, busRaw, bustramRaw] = await Promise.all([
    loadJson(TRAM_LINES_URL, tramCachePath, 'tram'),
    loadJson(BUS_LINES_URL, busCachePath, 'bus'),
    loadJson(BUSTRAM_LINES_URL, bustramCachePath, 'bustram'),
  ]);

  const parseFeatures = (
    raw: string,
    mode: NetworkLineFeature['mode']
  ): NetworkLineFeature[] => {
    const geojson = JSON.parse(raw) as {
      features?: Array<{
        properties?: {
          num_exploitation?: number;
          nom_ligne?: string;
          mode?: string;
          sens?: string;
        };
        geometry?: {
          type?: string;
          coordinates?: [number, number][];
        };
      }>;
    };

    return (geojson.features ?? [])
      .filter((feature) => feature.geometry?.type === 'LineString')
      .map((feature) => ({
        lineNumber: Number(feature.properties?.num_exploitation ?? 0),
        mode,
        name: feature.properties?.nom_ligne ?? '',
        sens: feature.properties?.sens ?? '',
        coordinates: (feature.geometry?.coordinates ?? []).map(([lon, lat]) => ({
          latitude: lat,
          longitude: lon,
        })),
      }))
      .filter((feature) => feature.lineNumber > 0 && feature.coordinates.length >= 2);
  };

  const parseBustramFeatures = (raw: string): NetworkLineFeature[] => {
    const geojson = JSON.parse(raw) as {
      features?: Array<{
        properties?: {
          nom_ligne?: string;
          sens?: string;
        };
        geometry?: {
          type?: string;
          coordinates?: [number, number][];
        };
      }>;
    };

    return (geojson.features ?? [])
      .filter((feature) => feature.geometry?.type === 'LineString')
      .map((feature) => {
        const name = feature.properties?.nom_ligne ?? '';
        const lineCode = lineCodeFromBustramName(name);
        return {
          lineNumber: 0,
          lineCode: lineCode ?? undefined,
          mode: 'tram_bus' as const,
          name,
          sens: feature.properties?.sens ?? '',
          coordinates: (feature.geometry?.coordinates ?? []).map(([lon, lat]) => ({
            latitude: lat,
            longitude: lon,
          })),
        };
      })
      .filter((feature) => Boolean(feature.lineCode) && feature.coordinates.length >= 2);
  };

  networkFeatures = [
    ...parseFeatures(tramRaw, 'tram'),
    ...parseFeatures(busRaw, 'bus'),
    ...parseBustramFeatures(bustramRaw),
  ];

  tripShapeContextCache.clear();
  tripLineShapeCache.clear();
  console.log(`[NetworkShapes] ${networkFeatures.length} tracés officiels chargés`);
}

/** Recharge les GeoJSON si le module a été hot-reloadé (networkFeatures remis à null). */
export async function ensureNetworkShapesLoaded(): Promise<boolean> {
  if (networkFeatures && networkFeatures.length > 0) return false;
  await loadNetworkShapes(true);
  return true;
}

/** @deprecated Utiliser loadNetworkShapes */
export const loadTramShapes = loadNetworkShapes;

export function lineNumberFromRoute(route: GtfsRoute): number | null {
  const direct = parseInt(route.route_short_name, 10);
  if (!Number.isNaN(direct)) return direct;

  const paren = route.route_short_name.match(/\((\d+)\)/);
  if (paren) return parseInt(paren[1], 10);

  const leading = route.route_short_name.match(/^L?\s*(\d+)/i);
  if (leading) return parseInt(leading[1], 10);

  return null;
}

/** Code lettre Bustram (A–E) depuis le short_name GTFS. */
export function lineCodeFromRoute(route: GtfsRoute): string | null {
  const short = route.route_short_name.trim().toUpperCase();
  if (/^[A-E]$/.test(short)) return short;
  const fromLong = lineCodeFromBustramName(route.route_long_name ?? '');
  return fromLong;
}

function lineCodeFromBustramName(name: string): string | null {
  const match =
    name.match(/\bBustram\s+([A-E])\b/i) ??
    name.match(/\bLigne\s+([A-E])\b/i) ??
    name.match(/^([A-E])\b/);
  return match ? match[1].toUpperCase() : null;
}

export function officialLineNumbersForRoute(route: GtfsRoute): number[] {
  const shortName = route.route_short_name.trim();
  const alias = ROUTE_LINE_ALIASES[shortName];
  if (alias?.length) return [...new Set(alias)];

  const direct = lineNumberFromRoute(route);
  return direct != null ? [direct] : [];
}

function pathLengthMeters(segment: ShapeCoordinate[]): number {
  let total = 0;
  for (let i = 1; i < segment.length; i++) {
    total += haversineMeters(
      segment[i - 1].latitude,
      segment[i - 1].longitude,
      segment[i].latitude,
      segment[i].longitude
    );
  }
  return total;
}

/** Préférer un tronçon officiel (même avec un trou) à une corde arrêt→arrêt. */
function preferOfficialHop(
  hop: ShapeCoordinate[],
  fromPoint: ShapeCoordinate,
  toPoint: ShapeCoordinate,
  gapLimit: number
): boolean {
  if (hop.length < 2) return false;
  if (maxSegmentJump(hop) <= gapLimit) return true;
  if (hop.length < 3) return false;

  const crow = haversineMeters(
    fromPoint.latitude,
    fromPoint.longitude,
    toPoint.latitude,
    toPoint.longitude
  );
  // Suburbain : les corridors MMM peuvent serpentir (ratio plus large sur longues distances).
  const maxRatio = crow >= 8_000 ? 4.5 : crow >= 3_000 ? 3.5 : 2.5;
  return pathLengthMeters(hop) <= crow * maxRatio;
}

function maxAllowedSegmentGap(slice: ShapeCoordinate[]): number {
  if (slice.length >= DENSE_SHAPE_MIN_POINTS) return DENSE_SHAPE_GAP_METERS;
  return MAX_SHAPE_GAP_METERS;
}

export function shapeNeedsRoadRouting(
  shape: ShapeCoordinate[],
  stopPointCount: number
): boolean {
  if (stopPointCount < 2) return false;
  if (shape.length < 3) return true;
  if (shape.length <= stopPointCount) return true;
  if (shape.length >= Math.max(4, stopPointCount + 2)) return false;
  return maxSegmentJump(shape) > maxAllowedSegmentGap(shape);
}

function effectiveRouteId(tripId: string, routeId?: string): string | null {
  const trip = getGtfs().trips.get(tripId);
  if (trip) return trip.route_id;
  return routeId ?? null;
}

function nearestIndexForward(
  shape: ShapeCoordinate[],
  point: ShapeCoordinate,
  searchFrom = 0,
  maxSnapMeters = MAX_SNAP_DISTANCE_METERS
): number {
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = searchFrom; i < shape.length; i++) {
    const dist = haversineMeters(
      point.latitude,
      point.longitude,
      shape[i].latitude,
      shape[i].longitude
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestDist <= maxSnapMeters ? bestIdx : -1;
}

function nearestIndexOnShape(
  shape: ShapeCoordinate[],
  point: ShapeCoordinate,
  searchFrom = 0,
  searchWindow = SHAPE_SEARCH_WINDOW
): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  const searchEnd = Math.min(shape.length, searchFrom + searchWindow);

  for (let i = searchFrom; i < searchEnd; i++) {
    const dist = haversineMeters(
      point.latitude,
      point.longitude,
      shape[i].latitude,
      shape[i].longitude
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestDist <= MAX_SNAP_DISTANCE_METERS ? bestIdx : -1;
}

function scoreTripOnShape(tripId: string, shape: ShapeCoordinate[]): number {
  const gtfs = getGtfs();
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  let lastIdx = 0;
  let matched = 0;

  for (const stopTime of tripStops) {
    const stop = gtfs.stops.get(stopTime.stop_id);
    if (!stop) continue;

    const point = { latitude: stop.stop_lat, longitude: stop.stop_lon };
    const idx = nearestIndexForward(shape, point, lastIdx, MAX_SCORE_SNAP_DISTANCE_METERS);
    if (idx < 0 || idx < lastIdx) continue;

    matched += 1;
    lastIdx = idx;
  }

  return matched;
}

function candidatesForRoute(routeId: string): NetworkLineFeature[] {
  if (!networkFeatures?.length) return [];

  const route = getGtfs().routes.get(routeId);
  if (!route) return [];

  const lineNumbers = officialLineNumbersForRoute(route);
  const lineCode = lineCodeFromRoute(route);

  return networkFeatures.filter((feature) => {
    if (lineCode && feature.lineCode === lineCode) return true;
    if (lineNumbers.length > 0 && lineNumbers.includes(feature.lineNumber)) return true;
    return false;
  });
}

function directionPreferenceScore(tripId: string, candidate: NetworkLineFeature): number {
  const trip = getGtfs().trips.get(tripId);
  if (!trip) return 0;

  const sens = candidate.sens.toLowerCase();
  if (trip.direction_id === '0') {
    return sens.includes('aller') ? 2 : sens.includes('retour') ? 0 : 1;
  }
  if (trip.direction_id === '1') {
    return sens.includes('retour') ? 2 : sens.includes('aller') ? 0 : 1;
  }

  return directionProgressScore(tripId, candidate.coordinates);
}

function directionProgressScore(tripId: string, shape: ShapeCoordinate[]): number {
  const gtfs = getGtfs();
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  if (tripStops.length < 2) return 0;

  const firstStop = gtfs.stops.get(tripStops[0].stop_id);
  const lastStop = gtfs.stops.get(tripStops[tripStops.length - 1].stop_id);
  if (!firstStop || !lastStop) return 0;

  const firstPoint = { latitude: firstStop.stop_lat, longitude: firstStop.stop_lon };
  const lastPoint = { latitude: lastStop.stop_lat, longitude: lastStop.stop_lon };
  const firstIdx = nearestIndexForward(shape, firstPoint, 0);
  const lastIdx = nearestIndexForward(shape, lastPoint, Math.max(0, firstIdx));
  if (firstIdx < 0 || lastIdx < 0 || lastIdx <= firstIdx) return 0;
  return lastIdx - firstIdx;
}

function orientedShapeForCandidate(candidate: NetworkLineFeature, tripId: string): {
  shape: ShapeCoordinate[];
  score: number;
} {
  const forwardScore = scoreTripOnShape(tripId, candidate.coordinates);
  const reverseScore = scoreTripOnShape(
    tripId,
    [...candidate.coordinates].reverse()
  );

  if (reverseScore > forwardScore) {
    return { shape: [...candidate.coordinates].reverse(), score: reverseScore };
  }

  return { shape: candidate.coordinates, score: forwardScore };
}

function resolveTripShapeContext(tripId: string, routeId?: string): TripShapeContext | null {
  const resolvedRouteId = effectiveRouteId(tripId, routeId);
  if (!resolvedRouteId) return null;

  const cached = tripShapeContextCache.get(tripId);
  if (cached) return cached;

  const candidates = candidatesForRoute(resolvedRouteId);
  if (!candidates.length) return null;

  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const totalStops = tripStops.filter((stopTime) => getGtfs().stops.get(stopTime.stop_id)).length;

  let bestContext: TripShapeContext | null = null;
  let bestScore = -1;
  let bestDirectionScore = -1;

  for (const candidate of candidates) {
    const { shape, score } = orientedShapeForCandidate(candidate, tripId);
    const preferenceScore = directionPreferenceScore(tripId, candidate);

    if (
      score > bestScore ||
      (score === bestScore && preferenceScore > bestDirectionScore)
    ) {
      bestScore = score;
      bestDirectionScore = preferenceScore;
      bestContext = { shape, matchedStops: score, totalStops };
    }
  }

  if (!bestContext && candidates.length) {
    bestContext = {
      shape: candidates[0].coordinates,
      matchedStops: 0,
      totalStops,
    };
  }

  if (bestContext) {
    tripShapeContextCache.set(tripId, bestContext);
  }

  return bestContext;
}

function shapeForTrip(tripId: string, routeId: string): ShapeCoordinate[] | null {
  return resolveTripShapeContext(tripId, routeId)?.shape ?? null;
}

function minimumMatchedStops(totalStops: number): number {
  if (totalStops < 2) return 0;
  // Suburbain : arrêts parfois éloignés du corridor digitalisé → seuil un peu plus bas.
  return Math.max(2, Math.ceil(totalStops * 0.45));
}

function buildOfficialTripShape(tripId: string, routeId: string): ShapeCoordinate[] | null {
  const context = resolveTripShapeContext(tripId, routeId);
  if (!context || context.matchedStops < minimumMatchedStops(context.totalStops)) {
    return null;
  }

  const gtfs = getGtfs();
  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  let firstIdx = -1;
  let lastIdx = -1;
  let searchFrom = 0;

  for (const stopTime of tripStops) {
    const stop = gtfs.stops.get(stopTime.stop_id);
    if (!stop) continue;

    const point = { latitude: stop.stop_lat, longitude: stop.stop_lon };
    const idx = nearestIndexForward(
      context.shape,
      point,
      searchFrom,
      MAX_SCORE_SNAP_DISTANCE_METERS
    );
    if (idx < 0) continue;

    if (firstIdx < 0) firstIdx = idx;
    lastIdx = idx;
    searchFrom = idx;
  }

  if (firstIdx < 0 || lastIdx <= firstIdx) return null;

  const slice = context.shape.slice(firstIdx, lastIdx + 1);
  if (slice.length < 2) return null;

  // Ne pas jeter tout le tracé MMM pour un trou local (ex. L3 Picasso–Boirargues).
  return slice;
}

function sliceShapeBetweenPoints(
  shape: ShapeCoordinate[],
  fromPoint: ShapeCoordinate,
  toPoint: ShapeCoordinate
): ShapeCoordinate[] | null {
  const fromIdx = nearestIndexForward(
    shape,
    fromPoint,
    0,
    MAX_SCORE_SNAP_DISTANCE_METERS
  );
  const toIdx =
    fromIdx >= 0
      ? nearestIndexForward(shape, toPoint, fromIdx, MAX_SCORE_SNAP_DISTANCE_METERS)
      : -1;

  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return null;

  const slice = shape.slice(fromIdx, toIdx + 1);
  if (slice.length < 2) return null;

  const gapLimit = Math.max(maxAllowedSegmentGap(slice), maxAllowedSegmentGap(shape));
  if (preferOfficialHop(slice, fromPoint, toPoint, gapLimit)) return slice;
  return null;
}

function sliceOfficialTripShapeSegment(
  tripId: string,
  fromStopId: string,
  toStopId: string
): ShapeCoordinate[] | null {
  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  if (!trip) return null;

  const from = gtfs.stops.get(fromStopId);
  const to = gtfs.stops.get(toStopId);
  if (!from || !to) return null;

  const fromPoint = { latitude: from.stop_lat, longitude: from.stop_lon };
  const toPoint = { latitude: to.stop_lat, longitude: to.stop_lon };

  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  const fromTripIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === fromStopId);
  const toTripIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === toStopId);
  if (fromTripIdx < 0 || toTripIdx < 0 || fromTripIdx >= toTripIdx) return null;

  const routeId = trip.route_id;
  const fullShape = buildOfficialTripShape(tripId, routeId);
  if (fullShape && fullShape.length >= 2) {
    const sliced = sliceShapeBetweenPoints(fullShape, fromPoint, toPoint);
    if (sliced && sliced.length >= 2) {
      return snapSegmentEndpoints(sliced, fromPoint, toPoint);
    }
  }

  const context = resolveTripShapeContext(tripId, routeId);
  if (context?.shape.length) {
    const sliced = sliceShapeBetweenPoints(context.shape, fromPoint, toPoint);
    if (sliced && sliced.length >= 2) {
      return snapSegmentEndpoints(sliced, fromPoint, toPoint);
    }
  }

  const fullLineShape = buildTripLineShape(tripId, routeId);
  if (fullLineShape.length >= 2) {
    const sliced = sliceShapeBetweenPoints(fullLineShape, fromPoint, toPoint);
    if (sliced && sliced.length >= 2) {
      return snapSegmentEndpoints(sliced, fromPoint, toPoint);
    }
  }

  const stopIds = tripStops.slice(fromTripIdx, toTripIdx + 1).map((stopTime) => stopTime.stop_id);
  const segment = fallbackPolylineFromStopIds(stopIds);
  if (segment.length < 2) return null;

  return snapSegmentEndpoints(segment, fromPoint, toPoint);
}

function snapSegmentEndpoints(
  segment: ShapeCoordinate[],
  fromPoint: ShapeCoordinate,
  toPoint: ShapeCoordinate
): ShapeCoordinate[] {
  if (segment.length < 2) return [fromPoint, toPoint];

  const snapped = [...segment];
  snapped[0] = fromPoint;

  const last = snapped[snapped.length - 1];
  const endGap = haversineMeters(
    last.latitude,
    last.longitude,
    toPoint.latitude,
    toPoint.longitude
  );
  if (endGap > 25) {
    snapped.push(toPoint);
  } else {
    snapped[snapped.length - 1] = toPoint;
  }

  return snapped;
}

function fallbackPolylineFromStopIds(stopIds: string[]): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const segment: ShapeCoordinate[] = [];

  for (const stopId of stopIds) {
    const stop = gtfs.stops.get(stopId);
    if (!stop) continue;
    segment.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
  }

  return segment;
}

function buildShapeAlongStopIds(
  tripId: string,
  routeId: string,
  stopIds: string[]
): ShapeCoordinate[] {
  if (stopIds.length < 2) return [];

  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  if (stopIds.length === tripStops.length) {
    const officialShape = buildOfficialTripShape(tripId, routeId);
    if (officialShape && officialShape.length >= 2) return officialShape;
  }

  const slicedShape = sliceShapeBetweenPoints(
    buildOfficialTripShape(tripId, routeId) ?? resolveTripShapeContext(tripId, routeId)?.shape ?? [],
    { latitude: getGtfs().stops.get(stopIds[0])!.stop_lat, longitude: getGtfs().stops.get(stopIds[0])!.stop_lon },
    {
      latitude: getGtfs().stops.get(stopIds[stopIds.length - 1])!.stop_lat,
      longitude: getGtfs().stops.get(stopIds[stopIds.length - 1])!.stop_lon,
    }
  );
  if (slicedShape && slicedShape.length >= 2 && !shapeNeedsRoadRouting(slicedShape, stopIds.length)) {
    const firstStop = getGtfs().stops.get(stopIds[0]);
    const lastStop = getGtfs().stops.get(stopIds[stopIds.length - 1]);
    if (firstStop && lastStop) {
      return snapSegmentEndpoints(
        slicedShape,
        { latitude: firstStop.stop_lat, longitude: firstStop.stop_lon },
        { latitude: lastStop.stop_lat, longitude: lastStop.stop_lon }
      );
    }
    return slicedShape;
  }

  const shape = shapeForTrip(tripId, routeId);
  if (!shape) return fallbackPolylineFromStopIds(stopIds);

  const gtfs = getGtfs();
  const segment: ShapeCoordinate[] = [];
  let searchFrom = 0;

  for (let i = 0; i < stopIds.length - 1; i++) {
    const stopA = gtfs.stops.get(stopIds[i]);
    const stopB = gtfs.stops.get(stopIds[i + 1]);
    if (!stopA || !stopB) continue;

    const pointA = { latitude: stopA.stop_lat, longitude: stopA.stop_lon };
    const pointB = { latitude: stopB.stop_lat, longitude: stopB.stop_lon };

    const fromIdx = nearestIndexOnShape(shape, pointA, searchFrom);
    const toIdx =
      fromIdx >= 0
        ? nearestIndexOnShape(shape, pointB, fromIdx)
        : nearestIndexForward(shape, pointB, searchFrom);

    if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) {
      if (!segment.length) segment.push(pointA);
      segment.push(pointB);
      continue;
    }

    const hop = shape.slice(fromIdx, toIdx + 1);
    const gapLimit = Math.max(maxAllowedSegmentGap(hop), maxAllowedSegmentGap(shape));
    if (preferOfficialHop(hop, pointA, pointB, gapLimit)) {
      appendShapePoints(segment, hop);
    } else {
      if (!segment.length) segment.push(pointA);
      segment.push(pointB);
    }

    searchFrom = toIdx;
  }

  return segment;
}

export function buildTripLineShape(tripId: string, routeId: string): ShapeCoordinate[] {
  const cached = tripLineShapeCache.get(tripId);
  if (cached) return cached;

  const trip = getGtfs().trips.get(tripId);
  const resolvedRouteId = trip?.route_id ?? routeId;

  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const stopIds = tripStops.map((stopTime) => stopTime.stop_id);
  const shape = buildShapeAlongStopIds(tripId, resolvedRouteId, stopIds);

  tripLineShapeCache.set(tripId, shape);
  return shape;
}

function stopPointsFromIds(stopIds: string[]): ShapeCoordinate[] {
  const gtfs = getGtfs();
  const points: ShapeCoordinate[] = [];

  for (const stopId of stopIds) {
    const stop = gtfs.stops.get(stopId);
    if (!stop || stop.location_type === '1') continue;
    points.push({ latitude: stop.stop_lat, longitude: stop.stop_lon });
  }

  return points;
}

export async function buildTripLineShapeAsync(
  tripId: string,
  routeId: string
): Promise<ShapeCoordinate[]> {
  const tripStops = getGtfs().stopTimesByTrip.get(tripId) ?? [];
  const stopIds = tripStops.map((stopTime) => stopTime.stop_id);
  const stopPoints = stopPointsFromIds(stopIds);
  const route = getGtfs().routes.get(routeId);
  const mode = route ? routeToMode(route) : 'bus';

  const officialShape = buildOfficialTripShape(tripId, routeId);
  if (officialShape && officialShape.length >= 2) {
    cacheTripLineShape(tripId, routeId, officialShape);
    return officialShape;
  }

  const syncShape = buildShapeAlongStopIds(tripId, routeId, stopIds);
  if (syncShape.length >= 2 && !shapeNeedsRoadRouting(syncShape, stopPoints.length)) {
    cacheTripLineShape(tripId, routeId, syncShape);
    return syncShape;
  }

  if (mode === 'bus' || mode === 'tram_bus') {
    const { getTransitRoadPath } = await import('./osrmService.js');
    const roadShape = await getTransitRoadPath(stopPoints);
    cacheTripLineShape(tripId, routeId, roadShape);
    return roadShape;
  }

  const fallback =
    syncShape.length >= 2 ? syncShape : fallbackPolylineFromStopIds(stopIds);
  cacheTripLineShape(tripId, routeId, fallback);
  return fallback;
}

function cacheTripLineShape(tripId: string, _routeId: string, shape: ShapeCoordinate[]) {
  const trip = getGtfs().trips.get(tripId);
  const directionKey = trip ? `${trip.route_id}:${trip.direction_id}` : null;
  tripLineShapeCache.set(tripId, shape);
  if (directionKey) tripLineShapeCache.set(directionKey, shape);
}

export function officialShapeQuality(tripId: string, routeId: string): number {
  const context = resolveTripShapeContext(tripId, routeId);
  if (!context) return 0;
  return context.matchedStops * 10_000 + context.shape.length;
}

export function getRepresentativeTripIds(routeId: string, directionId?: string): string[] {
  const gtfs = getGtfs();
  const bestByDirection = new Map<string, { tripId: string; score: number }>();

  for (const trip of gtfs.trips.values()) {
    if (trip.route_id !== routeId) continue;
    if (directionId != null && trip.direction_id !== directionId) continue;
    if (!isTripServicePreferred(trip.trip_id)) continue;

    const stopCount = gtfs.stopTimesByTrip.get(trip.trip_id)?.length ?? 0;
    // Motif préféré déjà filtré : parmi ceux-là, un trip avec un corridor dense.
    const score = stopCount;
    const current = bestByDirection.get(trip.direction_id);
    if (!current || score > current.score) {
      bestByDirection.set(trip.direction_id, { tripId: trip.trip_id, score });
    }
  }

  if (bestByDirection.size) {
    return [...bestByDirection.values()].map((entry) => entry.tripId);
  }

  // Fallback : un trip du motif préféré même hors calendrier du jour.
  for (const trip of gtfs.trips.values()) {
    if (trip.route_id !== routeId) continue;
    if (directionId != null && trip.direction_id !== directionId) continue;
    const preferred = gtfs.preferredPatternByRouteDir.get(`${trip.route_id}:${trip.direction_id}`);
    if (preferred && gtfs.tripPatternByTrip.get(trip.trip_id) !== preferred) continue;
    const stopCount = gtfs.stopTimesByTrip.get(trip.trip_id)?.length ?? 0;
    const current = bestByDirection.get(trip.direction_id);
    if (!current || stopCount > current.score) {
      bestByDirection.set(trip.direction_id, { tripId: trip.trip_id, score: stopCount });
    }
  }

  return [...bestByDirection.values()].map((entry) => entry.tripId);
}

function findBestTripId(routeId: string, directionId?: string): string | null {
  return getRepresentativeTripIds(routeId, directionId)[0] ?? null;
}

export function getNetworkShapeSegment(
  tripId: string,
  routeId: string,
  fromStopId: string,
  toStopId: string
): ShapeCoordinate[] | null {
  const gtfs = getGtfs();
  const trip = gtfs.trips.get(tripId);
  if (!trip) return null;

  const tripStops = gtfs.stopTimesByTrip.get(tripId) ?? [];
  const fromIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === fromStopId);
  const toIdx = tripStops.findIndex((stopTime) => stopTime.stop_id === toStopId);
  if (fromIdx < 0 || toIdx <= fromIdx) return null;
  const stopPointCount = toIdx - fromIdx + 1;

  const sliced = sliceOfficialTripShapeSegment(tripId, fromStopId, toStopId);
  if (sliced && sliced.length >= 2) {
    if (!shapeNeedsRoadRouting(sliced, stopPointCount)) {
      return sliced;
    }
    // Corridor MMM densifié : le garder même avec un trou local (évite les cordes suburbaines).
    if (sliced.length >= Math.max(6, stopPointCount + 2)) {
      return sliced;
    }
  }

  const from = gtfs.stops.get(fromStopId);
  const to = gtfs.stops.get(toStopId);
  if (from && to) {
    const fromPoint = { latitude: from.stop_lat, longitude: from.stop_lon };
    const toPoint = { latitude: to.stop_lat, longitude: to.stop_lon };
    const fullTripShape = buildTripLineShape(tripId, trip.route_id);
    const slicedFull = sliceShapeBetweenPoints(fullTripShape, fromPoint, toPoint);
    if (slicedFull && slicedFull.length >= 2) {
      return snapSegmentEndpoints(slicedFull, fromPoint, toPoint);
    }
  }

  const stopIds = tripStops.slice(fromIdx, toIdx + 1).map((stopTime) => stopTime.stop_id);
  const alongStops = buildShapeAlongStopIds(tripId, trip.route_id, stopIds);
  return alongStops.length >= 2 ? alongStops : sliced;
}

export function getNetworkLineShape(routeId: string, directionId?: string): ShapeCoordinate[] {
  const bestTripId = findBestTripId(routeId, directionId);
  if (bestTripId) {
    const officialShape = buildOfficialTripShape(bestTripId, routeId);
    if (officialShape && officialShape.length >= 2) return officialShape;

    const tripShape = buildTripLineShape(bestTripId, routeId);
    if (tripShape.length >= 2) return tripShape;
  }

  const candidates = candidatesForRoute(routeId);
  if (!candidates.length) return [];

  const longest = candidates.reduce((best, candidate) =>
    candidate.coordinates.length > best.coordinates.length ? candidate : best
  );
  return longest.coordinates;
}

/** Aller/retour MMM : extrémités proches à quelques dizaines de mètres près. */
const MAP_CORRIDOR_ENDPOINT_TOLERANCE_M = 120;

function sameCorridorEndpoints(a: ShapeCoordinate[], b: ShapeCoordinate[]): boolean {
  const a0 = a[0];
  const a1 = a[a.length - 1];
  const b0 = b[0];
  const b1 = b[b.length - 1];
  const sameOrientation =
    haversineMeters(a0.latitude, a0.longitude, b0.latitude, b0.longitude) <=
      MAP_CORRIDOR_ENDPOINT_TOLERANCE_M &&
    haversineMeters(a1.latitude, a1.longitude, b1.latitude, b1.longitude) <=
      MAP_CORRIDOR_ENDPOINT_TOLERANCE_M;
  const reversed =
    haversineMeters(a0.latitude, a0.longitude, b1.latitude, b1.longitude) <=
      MAP_CORRIDOR_ENDPOINT_TOLERANCE_M &&
    haversineMeters(a1.latitude, a1.longitude, b0.latitude, b0.longitude) <=
      MAP_CORRIDOR_ENDPOINT_TOLERANCE_M;
  return sameOrientation || reversed;
}

/**
 * Tracés carte : toutes les branches officielles distinctes (ex. L3 Lattes + Pérols),
 * sans les aller/retour en double.
 */
export function getNetworkLineShapesForMap(routeId: string): ShapeCoordinate[][] {
  const candidates = candidatesForRoute(routeId);
  if (candidates.length > 0) {
    const corridors: ShapeCoordinate[][] = [];
    for (const candidate of candidates) {
      if (candidate.coordinates.length < 2) continue;
      const coords = candidate.coordinates;
      const matchIndex = corridors.findIndex((existing) =>
        sameCorridorEndpoints(existing, coords)
      );
      if (matchIndex < 0) {
        corridors.push(coords);
        continue;
      }
      if (coords.length > corridors[matchIndex].length) {
        corridors[matchIndex] = coords;
      }
    }
    if (corridors.length > 0) return corridors;
  }

  const single = getNetworkLineShape(routeId);
  return single.length >= 2 ? [single] : [];
}

/** @deprecated Utiliser getNetworkShapeSegment */
export const getTramShapeSegment = getNetworkShapeSegment;

/** @deprecated Utiliser getNetworkLineShape */
export const getTramLineShape = getNetworkLineShape;
