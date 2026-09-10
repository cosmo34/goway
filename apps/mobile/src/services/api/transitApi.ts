import { api } from '../api/client';
import type { Departure, Stop, Route, PointOfInterest, SearchScope, SearchSuggestion, TransitLine, TransitLineDetail, Coordinates } from '../../stores/transitStore';
import { alignWalkingLegsToMapStreets } from '../routing/walkingGeometry';

export async function searchStopsApi(query: string): Promise<Stop[]> {
  return api.get<Stop[]>(`/api/stops/search?q=${encodeURIComponent(query)}`);
}

function parseDepartures(
  raw: Array<{
    lineId: string;
    lineName: string;
    lineColor: string;
    direction: string;
    scheduledTime: string;
    realtimeTime?: string;
    isRealtime: boolean;
    mode: 'tram' | 'bus' | 'tram_bus';
  }>
): Departure[] {
  return raw.map((d) => ({
    ...d,
    scheduledTime: new Date(d.scheduledTime),
    realtimeTime: d.realtimeTime ? new Date(d.realtimeTime) : undefined,
  }));
}

export async function getDeparturesApi(stopId: string, count = 5): Promise<Departure[]> {
  const raw = await api.get<
    Array<{
      lineId: string;
      lineName: string;
      lineColor: string;
      direction: string;
      scheduledTime: string;
      realtimeTime?: string;
      isRealtime: boolean;
      mode: 'tram' | 'bus' | 'tram_bus';
    }>
  >(`/api/stops/${stopId}/departures?count=${count}`);

  return parseDepartures(raw);
}

export async function buildRouteGeometryApi(
  route: Route,
  origin: Coordinates,
  destination: Coordinates
): Promise<Route> {
  const raw = await api.post<{
    id: string;
    legs: Route['legs'];
    totalDurationMinutes: number;
    departureTime: string;
    arrivalTime: string;
    walkingMinutes: number;
    geometry: Route['geometry'];
  }>('/api/routes/geometry', {
    route: {
      ...route,
      departureTime: route.departureTime.toISOString(),
      arrivalTime: route.arrivalTime.toISOString(),
    },
    originLat: origin.latitude,
    originLon: origin.longitude,
    destLat: destination.latitude,
    destLon: destination.longitude,
  });

  return alignWalkingLegsToMapStreets({
    ...raw,
    departureTime: new Date(raw.departureTime),
    arrivalTime: new Date(raw.arrivalTime),
    geometry: raw.geometry ?? [],
    legs: raw.legs.map((leg) => ({ ...leg, geometry: leg.geometry ?? [] })),
  });
}

export async function planRoutesApi(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  count = 3,
  allowedModes?: Array<'tram' | 'bus' | 'tram_bus'>,
  departureTime?: Date
): Promise<Route[]> {
  const raw = await api.post<{
    routes: Array<{
      id: string;
      legs: Array<Route['legs'][number] & { geometry?: Route['legs'][number]['geometry'] }>;
      totalDurationMinutes: number;
      departureTime: string;
      arrivalTime: string;
      walkingMinutes: number;
      geometry?: Route['geometry'];
      itineraryStopIds?: string[];
    }>;
  }>('/api/routes/plan', {
    originLat,
    originLon,
    destLat,
    destLon,
    count,
    allowedModes,
    departureTime: departureTime?.toISOString(),
  });

  return raw.routes.map((route) => ({
    ...route,
    departureTime: new Date(route.departureTime),
    arrivalTime: new Date(route.arrivalTime),
    geometry: route.geometry ?? [],
    itineraryStopIds: route.itineraryStopIds ?? [],
    legs: route.legs.map((leg) => ({
      ...leg,
      geometry: leg.geometry ?? [],
    })),
  }));
}

export async function planRouteApi(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<Route> {
  const routes = await planRoutesApi(originLat, originLon, destLat, destLon, 1);
  if (!routes[0]) throw new Error('No route found');
  return routes[0];
}

export async function getNearbyStopsApi(lat: number, lon: number, limit = 30): Promise<Stop[]> {
  return api.get<Stop[]>(`/api/stops/nearby?lat=${lat}&lon=${lon}&limit=${limit}`);
}

export async function getStopsInBboxApi(
  bbox: { north: number; south: number; east: number; west: number },
  limit = 250
): Promise<Stop[]> {
  const { north, south, east, west } = bbox;
  return api.get<Stop[]>(
    `/api/stops/in-bbox?north=${north}&south=${south}&east=${east}&west=${west}&limit=${limit}`
  );
}

export async function getStopByIdApi(stopId: string): Promise<Stop> {
  return api.get<Stop>(`/api/stops/${stopId}`);
}

export async function searchPlacesApi(
  query: string,
  options: { scope?: SearchScope; userLat?: number; userLon?: number; limit?: number } = {}
): Promise<SearchSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    scope: options.scope ?? 'local',
    limit: String(options.limit ?? 8),
  });
  if (options.userLat != null) params.set('lat', String(options.userLat));
  if (options.userLon != null) params.set('lon', String(options.userLon));
  return api.get<SearchSuggestion[]>(`/api/places/search?${params.toString()}`);
}

export interface NearbyStopDepartures {
  stop: Stop & { distanceMeters?: number };
  departures: Departure[];
}

export async function getNearbyStopDeparturesApi(
  lat: number,
  lon: number,
  stopLimit = 5,
  count = 4
): Promise<NearbyStopDepartures[]> {
  const raw = await api.get<
    Array<{
      stop: Stop & { distanceMeters?: number };
      departures: Array<{
        lineId: string;
        lineName: string;
        lineColor: string;
        direction: string;
        scheduledTime: string;
        realtimeTime?: string;
        isRealtime: boolean;
        mode: 'tram' | 'bus' | 'tram_bus';
      }>;
    }>
  >(`/api/stops/nearby/departures?lat=${lat}&lon=${lon}&stopLimit=${stopLimit}&count=${count}`);

  return raw.map((item) => ({
    stop: item.stop,
    departures: parseDepartures(item.departures),
  }));
}

export async function parseNlpApi(
  query: string,
  options: { scope?: SearchScope; userLat?: number; userLon?: number } = {}
): Promise<{
  destination?: string;
  destinationCoordinates?: { latitude: number; longitude: number };
  suggestions?: SearchSuggestion[];
  interpretedQuery?: string;
}> {
  return api.post('/api/nlp/parse', {
    query,
    scope: options.scope ?? 'local',
    userLat: options.userLat,
    userLon: options.userLon,
  });
}

export async function fetchPoiApi(lat: number, lon: number, radius = 500): Promise<PointOfInterest[]> {
  return api.get<PointOfInterest[]>(
    `/api/poi/nearby?lat=${lat}&lon=${lon}&radius=${radius}`
  );
}

export async function getWalkingTimeApi(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<number> {
  const result = await api.post<{ minutes: number }>('/api/routes/walking-time', {
    fromLat,
    fromLon,
    toLat,
    toLon,
  });
  return result.minutes;
}

export async function getWalkingRouteApi(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<{ path: Coordinates[]; minutes: number; distanceMeters: number }> {
  return api.post('/api/routes/walking', {
    fromLat,
    fromLon,
    toLat,
    toLon,
  });
}

export async function getWidgetDeparturesApi(stopId: string) {
  return api.get<
    Array<{
      lineName: string;
      lineColor: string;
      direction: string;
      minutesUntil: number;
      isRealtime: boolean;
    }>
  >(`/api/widget/departures?stopId=${stopId}`);
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    await api.get('/health');
    return true;
  } catch {
    return false;
  }
}

export async function listLinesApi(bbox?: {
  north: number;
  south: number;
  east: number;
  west: number;
}): Promise<TransitLine[]> {
  const params = bbox
    ? `?north=${bbox.north}&south=${bbox.south}&east=${bbox.east}&west=${bbox.west}`
    : '';
  return api.get<TransitLine[]>(`/api/lines${params}`);
}

export interface LineShape {
  id: string;
  segmentId?: string;
  shortName: string;
  longName: string;
  color: string;
  mode: 'tram' | 'bus' | 'tram_bus';
  coordinates: Array<{ latitude: number; longitude: number }>;
}

export async function listLineShapesApi(bbox?: {
  north: number;
  south: number;
  east: number;
  west: number;
}): Promise<LineShape[]> {
  const params = bbox
    ? `?north=${bbox.north}&south=${bbox.south}&east=${bbox.east}&west=${bbox.west}`
    : '';
  return api.get<LineShape[]>(`/api/lines/shapes${params}`);
}

export async function getLineDetailApi(
  lineId: string,
  directionId?: string
): Promise<TransitLineDetail> {
  const query = directionId ? `?direction=${encodeURIComponent(directionId)}` : '';
  return api.get<TransitLineDetail>(`/api/lines/${lineId}${query}`);
}
