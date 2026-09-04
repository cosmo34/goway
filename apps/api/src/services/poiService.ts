import { CONFIG } from '../config.js';
import { haversineMeters } from './gtfsLoader.js';

export interface ApiPoi {
  id: string;
  name: string;
  category: 'restaurant' | 'shop' | 'service' | 'culture';
  coordinates: { latitude: number; longitude: number };
  distanceMeters: number;
}

const CATEGORY_MAP: Record<string, ApiPoi['category']> = {
  restaurant: 'restaurant',
  cafe: 'restaurant',
  fast_food: 'restaurant',
  bar: 'restaurant',
  supermarket: 'shop',
  convenience: 'shop',
  mall: 'shop',
  clothes: 'shop',
  pharmacy: 'service',
  bank: 'service',
  hospital: 'service',
  museum: 'culture',
  theatre: 'culture',
  cinema: 'culture',
  monument: 'culture',
};

export async function fetchNearbyPois(
  lat: number,
  lon: number,
  radiusM = 500
): Promise<ApiPoi[]> {
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"restaurant|cafe|fast_food|bar|pharmacy|bank"](around:${radiusM},${lat},${lon});
      node["shop"](around:${radiusM},${lat},${lon});
      node["tourism"~"museum|attraction"](around:${radiusM},${lat},${lon});
    );
    out body 20;
  `;

  try {
    const response = await fetch(CONFIG.overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) return getFallbackPois(lat, lon);

    const data = await response.json();
    const pois: ApiPoi[] = [];

    for (const element of data.elements ?? []) {
      const tags = element.tags ?? {};
      const name = tags.name;
      if (!name) continue;

      const amenity = tags.amenity ?? tags.shop ?? tags.tourism ?? 'service';
      const category = CATEGORY_MAP[amenity] ?? 'service';
      const poiLat = element.lat;
      const poiLon = element.lon;

      pois.push({
        id: `osm-${element.id}`,
        name,
        category,
        coordinates: { latitude: poiLat, longitude: poiLon },
        distanceMeters: Math.round(haversineMeters(lat, lon, poiLat, poiLon)),
      });
    }

    return pois
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 12);
  } catch {
    return getFallbackPois(lat, lon);
  }
}

function getFallbackPois(lat: number, lon: number): ApiPoi[] {
  return [
    {
      id: 'fallback-1',
      name: 'Place de la Comédie',
      category: 'culture',
      coordinates: { latitude: lat, longitude: lon },
      distanceMeters: 0,
    },
  ];
}
