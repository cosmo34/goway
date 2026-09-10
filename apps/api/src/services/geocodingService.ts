import { haversineMeters } from './gtfsLoader.js';

export type GeocodingCategory = 'monument' | 'place' | 'quarter' | 'street' | 'address';

export interface GeocodingResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  type: string;
  osmClass: string;
  category: GeocodingCategory;
  importance: number;
  /** « 12 rue de la Loge » */
  streetLine?: string;
  city?: string;
  /** Quartier / voisinage */
  quarter?: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function classifyGeocodingResult(osmClass: string, type: string): GeocodingCategory {
  if (osmClass === 'highway') return 'street';
  if (osmClass === 'place' && ['neighbourhood', 'suburb', 'quarter', 'borough', 'city_district'].includes(type)) {
    return 'quarter';
  }
  if (
    osmClass === 'tourism' ||
    osmClass === 'historic' ||
    ['monument', 'attraction', 'museum', 'castle', 'church', 'memorial', 'artwork'].includes(type)
  ) {
    return 'monument';
  }
  if (['residential', 'house', 'building', 'address'].includes(type) || osmClass === 'building') {
    return 'address';
  }
  return 'place';
}

export function categoryLabel(category: GeocodingCategory): string {
  switch (category) {
    case 'monument':
      return 'Monument';
    case 'quarter':
      return 'Quartier';
    case 'street':
      return 'Rue';
    case 'address':
      return 'Adresse';
    default:
      return 'Lieu';
  }
}

function buildGeocodeQuery(query: string, scope: 'local' | 'national'): string {
  const trimmed = query.trim();
  if (scope !== 'local') return trimmed;

  const lower = normalize(trimmed);
  if (lower.includes('montpellier') || lower.includes('herault') || lower.includes('hérault')) {
    return trimmed;
  }

  return `${trimmed}, Montpellier, Hérault, France`;
}

export async function geocodePlace(
  query: string,
  options: {
    scope: 'local' | 'national';
    userLat?: number;
    userLon?: number;
    limit?: number;
  }
): Promise<GeocodingResult[]> {
  const searchQ = buildGeocodeQuery(query, options.scope);
  const params = new URLSearchParams({
    q: searchQ,
    format: 'json',
    addressdetails: '1',
    limit: String(options.limit ?? 8),
    countrycodes: 'fr',
  });

  if (options.scope === 'local' && options.userLat != null && options.userLon != null) {
    const delta = 0.35;
    const left = options.userLon - delta;
    const right = options.userLon + delta;
    const top = options.userLat + delta;
    const bottom = options.userLat - delta;
    params.set('viewbox', `${left},${top},${right},${bottom}`);
    params.set('bounded', '1');
  }

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'GOWAY/1.0 (Montpellier Transit; contact@goway.app)',
        'Accept-Language': 'fr',
      },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
      type: string;
      class: string;
      importance: number;
      name?: string;
      address?: {
        house_number?: string;
        road?: string;
        pedestrian?: string;
        footway?: string;
        neighbourhood?: string;
        suburb?: string;
        city_district?: string;
        quarter?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
      };
    }>;

    return data.map((item) => {
      const category = classifyGeocodingResult(item.class, item.type);
      const addr = item.address;
      const road = addr?.road ?? addr?.pedestrian ?? addr?.footway;
      const streetLine = [addr?.house_number, road].filter(Boolean).join(' ').trim() || undefined;
      const city = addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality;
      const quarter =
        addr?.neighbourhood ?? addr?.suburb ?? addr?.city_district ?? addr?.quarter;

      const name =
        item.name ??
        streetLine ??
        addr?.suburb ??
        addr?.neighbourhood ??
        item.display_name.split(',')[0];

      return {
        name,
        displayName: `${categoryLabel(category)} · ${item.display_name}`,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        type: item.type,
        osmClass: item.class,
        category,
        importance: item.importance,
        streetLine,
        city,
        quarter,
      };
    });
  } catch {
    return [];
  }
}

export function extractPlaceQuery(raw: string): string {
  const normalized = normalize(raw);

  const patterns = [
    /^(je\s+(veux|voudrais|souhaite)\s+)?(aller|me\s+rendre|me\s+diriger)\s+(a|au|aux|a\s+la|vers|jusqu['']?a)\s+(.+)$/i,
    /^(comment\s+)?(aller|se\s+rendre|acc[eé]der)\s+(a|au|aux|a\s+la|vers)\s+(.+)$/i,
    /^(trajet|itineraire|direction|route)\s+(vers|pour|jusqu['']?a)\s+(.+)$/i,
    /^(i\s+want\s+to\s+go\s+to|go\s+to|take\s+me\s+to)\s+(.+)$/i,
    /^(prochain|quel)\s+(tram|bus|transport)\s+(pour|vers)\s+(.+)$/i,
    /^(c['']?est\s+ou|ou\s+se\s+trouve|localiser)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const captured = match[match.length - 1]?.trim();
      if (captured) return captured;
    }
  }

  return raw.trim();
}

export function rankGeocodingResults(
  results: GeocodingResult[],
  userLat?: number,
  userLon?: number
): GeocodingResult[] {
  if (userLat == null || userLon == null) {
    return [...results].sort((a, b) => b.importance - a.importance);
  }

  return [...results].sort((a, b) => {
    const distA = haversineMeters(userLat, userLon, a.latitude, a.longitude);
    const distB = haversineMeters(userLat, userLon, b.latitude, b.longitude);
    const scoreA = a.importance * 1000 - distA;
    const scoreB = b.importance * 1000 - distB;
    return scoreB - scoreA;
  });
}
