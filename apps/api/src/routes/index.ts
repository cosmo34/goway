import type { FastifyInstance } from 'fastify';
import { searchStops, getStopById, getDepartures, findNearestStops, findStopsInBbox } from '../services/stopService.js';
import {
  planRoutes,
  buildRouteGeometryForRoute,
  estimateWalkingMinutes,
  getItineraryStopIds,
} from '../services/routingService.js';
import { getWalkingRoute } from '../services/osrmService.js';
import { parseNaturalLanguage } from '../services/nlpService.js';
import { searchPlaces } from '../services/placesService.js';
import { geocodePlace, rankGeocodingResults } from '../services/geocodingService.js';
import { fetchNearbyPois } from '../services/poiService.js';
import { getServiceAlerts, getVehiclePositions, getLastRtFetch } from '../services/gtfsRtService.js';
import { listLines, getLineDetail } from '../services/lineService.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    gtfsRtLastFetch: getLastRtFetch()?.toISOString() ?? null,
  }));

  // --- Arrêts ---
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/stops/search',
    async (req) => {
      const q = req.query.q ?? '';
      const limit = parseInt(req.query.limit ?? '20', 10);
      return searchStops(q, limit);
    }
  );

  app.get<{ Params: { id: string } }>('/api/stops/:id', async (req, reply) => {
    const stop = getStopById(req.params.id);
    if (!stop) return reply.status(404).send({ error: 'Stop not found' });
    return stop;
  });

  app.get<{ Querystring: { lat: string; lon: string; limit?: string } }>(
    '/api/stops/nearby',
    async (req) => {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);
      const limit = parseInt(req.query.limit ?? '5', 10);
      return findNearestStops(lat, lon, limit);
    }
  );

  app.get<{
    Querystring: { north: string; south: string; east: string; west: string; limit?: string };
  }>('/api/stops/in-bbox', async (req) => {
    const north = parseFloat(req.query.north);
    const south = parseFloat(req.query.south);
    const east = parseFloat(req.query.east);
    const west = parseFloat(req.query.west);
    const limit = parseInt(req.query.limit ?? '250', 10);
    return findStopsInBbox({ north, south, east, west }, limit);
  });

  app.get<{
    Querystring: { lat: string; lon: string; stopLimit?: string; count?: string };
  }>('/api/stops/nearby/departures', async (req) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const stopLimit = parseInt(req.query.stopLimit ?? '5', 10);
    const count = parseInt(req.query.count ?? '4', 10);
    const stops = findNearestStops(lat, lon, stopLimit, 1500);
    return stops.map((stop) => ({
      stop,
      departures: getDepartures(stop.id, count),
    }));
  });

  app.get<{
    Querystring: { q: string; scope?: string; lat?: string; lon?: string; limit?: string };
  }>('/api/places/search', async (req) => {
    return searchPlaces(req.query.q, {
      scope: req.query.scope === 'national' ? 'national' : 'local',
      userLat: req.query.lat ? parseFloat(req.query.lat) : undefined,
      userLon: req.query.lon ? parseFloat(req.query.lon) : undefined,
      limit: parseInt(req.query.limit ?? '8', 10),
    });
  });

  // --- Départs ---
  app.get<{ Params: { id: string }; Querystring: { count?: string } }>(
    '/api/stops/:id/departures',
    async (req) => {
      const count = parseInt(req.query.count ?? '10', 10);
      return getDepartures(req.params.id, count);
    }
  );

  // --- Itinéraires ---
  app.post<{
    Body: {
      originLat: number;
      originLon: number;
      destLat: number;
      destLon: number;
      departureTime?: string;
      count?: number;
      allowedModes?: Array<'tram' | 'bus' | 'tram_bus'>;
    };
  }>('/api/routes/plan', async (req, reply) => {
    const { originLat, originLon, destLat, destLon, departureTime, count, allowedModes } = req.body;
    if ([originLat, originLon, destLat, destLon].some((v) => typeof v !== 'number')) {
      return reply.status(400).send({ error: 'Invalid coordinates' });
    }

    const validModes = ['tram', 'bus', 'tram_bus'] as const;
    const parsedModes =
      allowedModes == null
        ? undefined
        : allowedModes.filter((mode): mode is (typeof validModes)[number] =>
            validModes.includes(mode as (typeof validModes)[number])
          );

    if (allowedModes != null && parsedModes?.length === 0) {
      return reply.status(400).send({ error: 'At least one transport mode must be selected' });
    }

    const routeCount = Math.min(Math.max(count ?? 3, 1), 5);
    const routes = await planRoutes(
      originLat,
      originLon,
      destLat,
      destLon,
      departureTime ? new Date(departureTime) : new Date(),
      routeCount,
      parsedModes
    );

    if (routes.length === 0) return { routes: [] };
    return { routes };
  });

  app.post<{
    Body: {
      route: {
        id: string;
        legs: Array<{
          mode: 'walk' | 'tram' | 'bus' | 'tram_bus';
          from: string;
          to: string;
          durationMinutes: number;
          lineName?: string;
          lineColor?: string;
          lineId?: string;
          tripId?: string;
          fromStopId?: string;
          toStopId?: string;
        }>;
        totalDurationMinutes: number;
        departureTime: string;
        arrivalTime: string;
        walkingMinutes: number;
        itineraryStopIds?: string[];
      };
      originLat: number;
      originLon: number;
      destLat: number;
      destLon: number;
    };
  }>('/api/routes/geometry', async (req, reply) => {
    const { route, originLat, originLon, destLat, destLon } = req.body;
    if (
      !route ||
      [originLat, originLon, destLat, destLon].some((value) => typeof value !== 'number')
    ) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const enriched = await buildRouteGeometryForRoute(
      {
        ...route,
        geometry: [],
        itineraryStopIds: route.itineraryStopIds ?? getItineraryStopIds(route.legs),
      },
      originLat,
      originLon,
      destLat,
      destLon
    );
    return enriched;
  });

  app.post<{
    Body: { fromLat: number; fromLon: number; toLat: number; toLon: number };
  }>('/api/routes/walking-time', async (req) => {
    const { fromLat, fromLon, toLat, toLon } = req.body;
    try {
      const route = await getWalkingRoute(
        { latitude: fromLat, longitude: fromLon },
        { latitude: toLat, longitude: toLon }
      );
      return {
        minutes: Math.max(1, Math.ceil(route.durationSeconds / 60)),
      };
    } catch {
      return {
        minutes: estimateWalkingMinutes(fromLat, fromLon, toLat, toLon),
      };
    }
  });

  app.post<{
    Body: { fromLat: number; fromLon: number; toLat: number; toLon: number };
  }>('/api/routes/walking', async (req) => {
    const { fromLat, fromLon, toLat, toLon } = req.body;
    const route = await getWalkingRoute(
      { latitude: fromLat, longitude: fromLon },
      { latitude: toLat, longitude: toLon }
    );
    return {
      path: route.path,
      minutes: Math.max(1, Math.ceil(route.durationSeconds / 60)),
      distanceMeters: Math.round(route.distanceMeters),
    };
  });

  // --- NLP ---
  app.post<{
    Body: {
      query: string;
      scope?: 'local' | 'national';
      userLat?: number;
      userLon?: number;
    };
  }>('/api/nlp/parse', async (req) => {
    return parseNaturalLanguage(req.body.query, {
      scope: req.body.scope ?? 'local',
      userLat: req.body.userLat,
      userLon: req.body.userLon,
    });
  });

  app.get<{
    Querystring: { q: string; scope?: string; lat?: string; lon?: string; limit?: string };
  }>('/api/geocode/search', async (req) => {
    const results = await geocodePlace(req.query.q, {
      scope: req.query.scope === 'national' ? 'national' : 'local',
      userLat: req.query.lat ? parseFloat(req.query.lat) : undefined,
      userLon: req.query.lon ? parseFloat(req.query.lon) : undefined,
      limit: parseInt(req.query.limit ?? '8', 10),
    });
    return rankGeocodingResults(
      results,
      req.query.lat ? parseFloat(req.query.lat) : undefined,
      req.query.lon ? parseFloat(req.query.lon) : undefined
    );
  });

  // --- POI ---
  app.get<{ Querystring: { lat: string; lon: string; radius?: string } }>(
    '/api/poi/nearby',
    async (req) => {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);
      const radius = parseInt(req.query.radius ?? '500', 10);
      return fetchNearbyPois(lat, lon, radius);
    }
  );

  // --- Alertes ---
  app.get('/api/alerts', async () => getServiceAlerts());

  // --- Véhicules temps réel ---
  app.get('/api/vehicles', async () => getVehiclePositions());

  // --- Lignes ---
  app.get<{
    Querystring: { north?: string; south?: string; east?: string; west?: string };
  }>('/api/lines', async (req) => {
    const { north, south, east, west } = req.query;
    const hasBbox = [north, south, east, west].every((v) => v != null && v !== '');
    const bbox = hasBbox
      ? {
          north: parseFloat(north!),
          south: parseFloat(south!),
          east: parseFloat(east!),
          west: parseFloat(west!),
        }
      : undefined;
    return listLines(bbox);
  });

  app.get<{ Params: { id: string }; Querystring: { direction?: string } }>(
    '/api/lines/:id',
    async (req, reply) => {
      const detail = await getLineDetail(req.params.id, req.query.direction);
      if (!detail) return reply.status(404).send({ error: 'Line not found' });
      return detail;
    }
  );

  // --- Widget (prochain départ pour un arrêt favori) ---
  app.get<{ Querystring: { stopId: string; count?: string } }>(
    '/api/widget/departures',
    async (req) => {
      const count = parseInt(req.query.count ?? '3', 10);
      const deps = getDepartures(req.query.stopId, count);
      return deps.map((d) => {
        const time = new Date(d.realtimeTime ?? d.scheduledTime);
        const minutesUntil = Math.max(0, Math.round((time.getTime() - Date.now()) / 60_000));
        return {
          lineName: d.lineName,
          lineColor: d.lineColor,
          direction: d.direction,
          minutesUntil,
          isRealtime: d.isRealtime,
        };
      });
    }
  );
}
