/** Lieux connus Montpellier — fallback hors-ligne */
export const KNOWN_PLACES: Record<string, { lat: number; lon: number; name: string }> = {
  'centre-ville': { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  'centre ville': { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  comédie: { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  comedie: { lat: 43.6085, lon: 3.8795, name: 'Comédie' },
  gare: { lat: 43.6047, lon: 3.8808, name: 'Gare Saint-Roch' },
  'saint-roch': { lat: 43.6047, lon: 3.8808, name: 'Gare Saint-Roch' },
  odysseum: { lat: 43.6038, lon: 3.9204, name: 'Odysseum' },
  antigone: { lat: 43.6102, lon: 3.8901, name: 'Antigone' },
  mosson: { lat: 43.6225, lon: 3.8512, name: 'Mosson' },
  'port marianne': { lat: 43.6025, lon: 3.9175, name: 'Port Marianne' },
  'beaux-arts': { lat: 43.6125, lon: 3.8745, name: 'Beaux-Arts' },
  corum: { lat: 43.6128, lon: 3.8802, name: 'Corum' },
};
