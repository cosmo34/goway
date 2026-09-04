/**
 * Sources open data TaM — URLs validées août 2026
 * @see https://www.data.gouv.fr/datasets/offre-de-transport-tam-en-temps-reel-gtfs-rt-urbain-et-suburbain
 */
export const TAM_DATA_SOURCES = {
  gtfsStaticUrban: 'https://data.montpellier3m.fr/GTFS/Urbain/GTFS.zip',
  gtfsStaticSuburban: 'https://data.montpellier3m.fr/GTFS/Suburbain/GTFS.zip',
  gtfsStaticCombined:
    'https://data.montpellier3m.fr/sites/default/files/ressources/TAM_MMM_GTFS.zip',
  gtfsRtTripUpdatesUrban: 'https://data.montpellier3m.fr/GTFS/Urbain/TripUpdate.pb',
  gtfsRtVehiclePositionsUrban:
    'https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb',
  gtfsRtAlertsUrban: 'https://data.montpellier3m.fr/GTFS/Urbain/Alert.pb',
  portal: 'https://data.montpellier3m.fr/dataset/offre-de-transport-tam-en-temps-reel',
  license: 'ODbL',
} as const;

export const MONTPELLIER_BOUNDS = {
  north: 43.75,
  south: 43.55,
  east: 4.05,
  west: 3.75,
  center: { latitude: 43.6108, longitude: 3.8767 },
} as const;

export const GTFS_RT_POLL_INTERVAL = 30_000;

export const TRANSPORT_MODES = ['tram', 'bus', 'tram_bus'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** URL de l'API backend GOWAY */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
