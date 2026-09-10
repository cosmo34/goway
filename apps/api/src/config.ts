/** Sources open data TaM — URLs validées août 2026 */
export const TAM = {
  gtfs: {
    urban: 'https://data.montpellier3m.fr/GTFS/Urbain/GTFS.zip',
    suburban: 'https://data.montpellier3m.fr/GTFS/Suburbain/GTFS.zip',
    combined: 'https://data.montpellier3m.fr/sites/default/files/ressources/TAM_MMM_GTFS.zip',
  },
  gtfsRt: {
    urban: {
      tripUpdates: 'https://data.montpellier3m.fr/GTFS/Urbain/TripUpdate.pb',
      vehiclePositions: 'https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb',
      alerts: 'https://data.montpellier3m.fr/GTFS/Urbain/Alert.pb',
    },
    suburban: {
      tripUpdates: 'https://data.montpellier3m.fr/GTFS/Suburbain/TripUpdate.pb',
      vehiclePositions: 'https://data.montpellier3m.fr/GTFS/Suburbain/VehiclePosition.pb',
      alerts: 'https://data.montpellier3m.fr/GTFS/Suburbain/Alert.pb',
    },
  },
} as const;

export const CONFIG = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  gtfsCacheDir: process.env.GTFS_CACHE_DIR ?? './data/gtfs',
  gtfsRefreshHours: Number(process.env.GTFS_REFRESH_HOURS ?? 24),
  gtfsRtPollSeconds: Number(process.env.GTFS_RT_POLL_SECONDS ?? 30),
  otpUrl: process.env.OTP_URL ?? 'http://localhost:8080/otp',
  openaiApiKey: process.env.OPENAI_API_KEY,
  overpassUrl: process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter',
  walkingRouterUrl:
    process.env.WALKING_ROUTER_URL ??
    'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  walkingRouterTimeoutMs: Number(process.env.WALKING_ROUTER_TIMEOUT_MS ?? 4000),
} as const;

/** Lieux connus Montpellier pour NLP local */
export const KNOWN_PLACES: Record<string, { lat: number; lon: number; name: string }> = {
  'centre-ville': { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  'centre ville': { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  comedie: { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  comédie: { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  'place de la comedie': { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  'gare saint-roch': { lat: 43.6047, lon: 3.8808, name: 'Gare Saint-Roch' },
  'gare st roch': { lat: 43.6047, lon: 3.8808, name: 'Gare Saint-Roch' },
  gare: { lat: 43.6047, lon: 3.8808, name: 'Gare Saint-Roch' },
  odysseum: { lat: 43.6038, lon: 3.9204, name: 'Odysseum' },
  antigone: { lat: 43.6102, lon: 3.8901, name: 'Antigone' },
  mosson: { lat: 43.6225, lon: 3.8512, name: 'Mosson' },
  'port marianne': { lat: 43.6025, lon: 3.9175, name: 'Port Marianne' },
  'beaux-arts': { lat: 43.6125, lon: 3.8745, name: 'Beaux-Arts' },
  'corum': { lat: 43.6128, lon: 3.8802, name: 'Corum' },
  'euromedecine': { lat: 43.631, lon: 3.851, name: 'Euromédecine' },
  'place de l europe': { lat: 43.5745, lon: 3.9432, name: 'Odysseum' },
};

export const LINE_COLORS: Record<string, string> = {
  '1': '#E85D4C',
  '2': '#4CAF7D',
  '3': '#5B8DEF',
  '4': '#F5A623',
  '5': '#9B6DD7',
  A: '#0D9B8A',
};
