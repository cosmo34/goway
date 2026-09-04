import { KNOWN_PLACES, CONFIG } from '../config.js';
import { searchStops } from './stopService.js';
import {
  geocodePlace,
  extractPlaceQuery,
  rankGeocodingResults,
  type GeocodingResult,
} from './geocodingService.js';
import { haversineMeters } from './gtfsLoader.js';

export type SearchScope = 'local' | 'national';

export interface NlpResult {
  raw: string;
  destination?: string;
  destinationCoordinates?: { latitude: number; longitude: number };
  destinationStopId?: string;
  departureTime?: string;
  scope: SearchScope;
  suggestions?: Array<{
    name: string;
    displayName: string;
    coordinates: { latitude: number; longitude: number };
    source: 'known' | 'stop' | 'geocode';
  }>;
  interpretedQuery?: string;
}

export interface NlpOptions {
  scope?: SearchScope;
  userLat?: number;
  userLon?: number;
}

export async function parseNaturalLanguage(query: string, options: NlpOptions = {}): Promise<NlpResult> {
  const scope = options.scope ?? 'local';
  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const placeQuery = extractPlaceQuery(query);

  if (CONFIG.openaiApiKey) {
    const aiResult = await parseWithOpenAI(query, scope, options.userLat, options.userLon);
    if (aiResult.destinationCoordinates) return { ...aiResult, scope };
  }

  const localResult = await resolvePlace(placeQuery, scope, options.userLat, options.userLon);
  if (localResult.destinationCoordinates) {
    return { ...localResult, raw: query, scope };
  }

  const suggestions = await buildSuggestions(placeQuery || normalized, scope, options.userLat, options.userLon);
  if (suggestions.length > 0) {
    const best = suggestions[0];
    return {
      raw: query,
      scope,
      destination: best.name,
      destinationCoordinates: best.coordinates,
      destinationStopId: best.source === 'stop' ? undefined : undefined,
      suggestions,
      interpretedQuery: placeQuery,
    };
  }

  return { raw: query, scope, interpretedQuery: placeQuery };
}

async function resolvePlace(
  searchTerm: string,
  scope: SearchScope,
  userLat?: number,
  userLon?: number
): Promise<Partial<NlpResult>> {
  const normalized = searchTerm
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (scope === 'local') {
    for (const [keyword, place] of Object.entries(KNOWN_PLACES)) {
      const kw = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.includes(kw) || kw.includes(normalized)) {
        return {
          destination: place.name,
          destinationCoordinates: { latitude: place.lat, longitude: place.lon },
        };
      }
    }

    const stops = searchStops(searchTerm, 3);
    if (stops.length > 0) {
      const best =
        userLat != null && userLon != null
          ? [...stops].sort(
              (a, b) =>
                haversineMeters(userLat, userLon, a.coordinates.latitude, a.coordinates.longitude) -
                haversineMeters(userLat, userLon, b.coordinates.latitude, b.coordinates.longitude)
            )[0]
          : stops[0];

      return {
        destination: best.name,
        destinationCoordinates: best.coordinates,
        destinationStopId: best.id,
      };
    }
  }

  const geocoded = await geocodePlace(searchTerm, {
    scope,
    userLat,
    userLon,
    limit: 5,
  });

  const ranked = rankGeocodingResults(geocoded, userLat, userLon);
  if (ranked.length > 0) {
    const best = ranked[0];
    return {
      destination: best.name,
      destinationCoordinates: { latitude: best.latitude, longitude: best.longitude },
    };
  }

  return {};
}

async function buildSuggestions(
  searchTerm: string,
  scope: SearchScope,
  userLat?: number,
  userLon?: number
): Promise<NonNullable<NlpResult['suggestions']>> {
  const suggestions: NonNullable<NlpResult['suggestions']> = [];

  if (scope === 'local') {
    for (const stop of searchStops(searchTerm, 5)) {
      suggestions.push({
        name: stop.name,
        displayName: stop.name,
        coordinates: stop.coordinates,
        source: 'stop',
      });
    }
  }

  const geocoded = rankGeocodingResults(
    await geocodePlace(searchTerm, { scope, userLat, userLon, limit: 5 }),
    userLat,
    userLon
  );

  for (const place of geocoded) {
    suggestions.push({
      name: place.name,
      displayName: place.displayName,
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      source: 'geocode',
    });
  }

  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.coordinates.latitude.toFixed(4)},${s.coordinates.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function parseWithOpenAI(
  query: string,
  scope: SearchScope,
  userLat?: number,
  userLon?: number
): Promise<NlpResult> {
  try {
    const scopeHint =
      scope === 'local'
        ? 'Priorise Montpellier et sa métropole (rayon ~30 km).'
        : 'Recherche dans toute la France.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Tu es un assistant transport. Extrais la destination d'une requête en langage naturel.
${scopeHint}
Réponds UNIQUEMENT en JSON: {"destination": "nom", "latitude": number|null, "longitude": number|null, "placeQuery": "nom extrait"}
Si tu ne connais pas les coordonnées exactes, mets null pour lat/lon.`,
          },
          { role: 'user', content: query },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return { raw: query, scope };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content);

    if (parsed.latitude && parsed.longitude) {
      return {
        raw: query,
        scope,
        destination: parsed.destination,
        destinationCoordinates: { latitude: parsed.latitude, longitude: parsed.longitude },
        interpretedQuery: parsed.placeQuery ?? parsed.destination,
      };
    }

    if (parsed.placeQuery || parsed.destination) {
      const resolved = await resolvePlace(
        parsed.placeQuery ?? parsed.destination,
        scope,
        userLat,
        userLon
      );
      return {
        raw: query,
        scope,
        ...resolved,
        interpretedQuery: parsed.placeQuery ?? parsed.destination,
      };
    }

    return { raw: query, scope, destination: parsed.destination };
  } catch {
    return { raw: query, scope };
  }
}
