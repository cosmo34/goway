import type { Region } from 'react-native-maps';
import type { Coordinates } from '../stores/transitStore';
import { MONTPELLIER_BOUNDS } from '../config/tam';
import { isInMontpellierServiceArea } from './location';

export interface MapBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function regionToBbox(region: Region): MapBbox {
  const halfLat = region.latitudeDelta / 2;
  const halfLon = region.longitudeDelta / 2;
  return {
    north: region.latitude + halfLat,
    south: region.latitude - halfLat,
    east: region.longitude + halfLon,
    west: region.longitude - halfLon,
  };
}

export function regionCenter(region: Region): Coordinates {
  return { latitude: region.latitude, longitude: region.longitude };
}

function bboxIntersectsMontpellier(bbox: MapBbox): boolean {
  const { north, south, east, west } = MONTPELLIER_BOUNDS;
  return !(bbox.south > north || bbox.north < south || bbox.west > east || bbox.east < west);
}

/** True si le viewport intersecte la zone TaM (pas seulement le centre). */
export function isMapRegionInServiceArea(region: Region): boolean {
  if (isInMontpellierServiceArea(region.latitude, region.longitude)) {
    return true;
  }
  return bboxIntersectsMontpellier(regionToBbox(region));
}

export function defaultMapRegion(): Region {
  return {
    ...MONTPELLIER_BOUNDS.center,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };
}
