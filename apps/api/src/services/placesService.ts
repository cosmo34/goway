import { searchStops } from './stopService.js';
import {
  geocodePlace,
  extractPlaceQuery,
  rankGeocodingResults,
  categoryLabel,
  type GeocodingCategory,
} from './geocodingService.js';
import { searchCuratedPlaces, type CuratedPlaceCategory } from '../data/montpellierPlaces.js';
import { haversineMeters } from './gtfsLoader.js';

export type SearchScope = 'local' | 'national';

export type PlaceCategory = GeocodingCategory | CuratedPlaceCategory | 'stop';

export interface PlaceSuggestion {
  name: string;
  displayName: string;
  coordinates: { latitude: number; longitude: number };
  source: 'known' | 'stop' | 'geocode';
  category: PlaceCategory;
}

interface ScoredPlaceSuggestion extends PlaceSuggestion {
  score: number;
}

function curatedCategoryLabel(category: CuratedPlaceCategory): string {
  switch (category) {
    case 'monument':
      return 'Monument';
    case 'quarter':
      return 'Quartier';
    default:
      return 'Lieu';
  }
}

export async function searchPlaces(
  query: string,
  options: { scope?: SearchScope; userLat?: number; userLon?: number; limit?: number } = {}
): Promise<PlaceSuggestion[]> {
  const scope = options.scope ?? 'local';
  const limit = options.limit ?? 10;
  const placeQuery = extractPlaceQuery(query).trim() || query.trim();
  if (!placeQuery) return [];

  const suggestions: ScoredPlaceSuggestion[] = [];
  const seen = new Set<string>();

  const add = (item: PlaceSuggestion & { score?: number }) => {
    const key = `${item.name.toLowerCase()}|${item.coordinates.latitude.toFixed(5)},${item.coordinates.longitude.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ ...item, score: item.score ?? 50 });
  };

  if (scope === 'local') {
    for (const place of searchCuratedPlaces(placeQuery, 8)) {
      add({
        name: place.name,
        displayName: `${curatedCategoryLabel(place.category)} · ${place.name}`,
        coordinates: { latitude: place.lat, longitude: place.lon },
        source: 'known',
        category: place.category,
        score: 92,
      });
    }

    for (const stop of searchStops(placeQuery, 8)) {
      add({
        name: stop.name,
        displayName: `Arrêt · ${stop.name}`,
        coordinates: stop.coordinates,
        source: 'stop',
        category: 'stop',
        score: 88,
      });
    }
  }

  const geocoded = rankGeocodingResults(
    await geocodePlace(placeQuery, {
      scope,
      userLat: options.userLat,
      userLon: options.userLon,
      limit: 10,
    }),
    options.userLat,
    options.userLon
  );

  for (const place of geocoded) {
    add({
      name: place.name,
      displayName: place.displayName.includes('·')
        ? place.displayName
        : `${categoryLabel(place.category)} · ${place.displayName}`,
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      source: 'geocode',
      category: place.category,
      score: 55 + place.importance * 10,
    });
  }

  const ranked = suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    if (options.userLat != null && options.userLon != null) {
      const da = haversineMeters(
        options.userLat,
        options.userLon,
        a.coordinates.latitude,
        a.coordinates.longitude
      );
      const db = haversineMeters(
        options.userLat,
        options.userLon,
        b.coordinates.latitude,
        b.coordinates.longitude
      );
      return da - db;
    }

    return a.name.localeCompare(b.name, 'fr');
  });

  return ranked.slice(0, limit).map(({ score: _score, ...item }) => item);
}
