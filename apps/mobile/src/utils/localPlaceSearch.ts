import { KNOWN_PLACES } from '../config/places';
import i18n from '../i18n';
import type { SearchSuggestion, Stop } from '../stores/transitStore';

function suggestionKey(item: SearchSuggestion): string {
  return `${item.name.toLowerCase()}|${item.coordinates.latitude.toFixed(4)}|${item.coordinates.longitude.toFixed(4)}`;
}

export function mergeSearchSuggestions(
  primary: SearchSuggestion[],
  secondary: SearchSuggestion[]
): SearchSuggestion[] {
  const seen = new Set<string>();
  const merged: SearchSuggestion[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = suggestionKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, 10);
}

export function searchPlacesLocally(query: string, stops: Stop[]): SearchSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const results: SearchSuggestion[] = [];
  const seen = new Set<string>();

  const add = (item: SearchSuggestion) => {
    const key = suggestionKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  for (const [keyword, place] of Object.entries(KNOWN_PLACES)) {
    if (
      keyword.includes(normalized) ||
      place.name.toLowerCase().includes(normalized) ||
      normalized.includes(keyword)
    ) {
      add({
        name: place.name,
        displayName: `Lieu · ${place.name}`,
        coordinates: { latitude: place.lat, longitude: place.lon },
        source: 'known',
        category: 'place',
      });
    }
  }

  for (const stop of stops) {
    if (stop.name.toLowerCase().includes(normalized)) {
      add({
        name: stop.name,
        displayName: i18n.t('search.stopResult', { name: stop.name }),
        coordinates: stop.coordinates,
        source: 'stop',
        category: 'stop',
      });
    }
  }

  return results.slice(0, 8);
}
