import { loadGtfs } from '../services/gtfsLoader.js';

await loadGtfs(true);
console.log('GTFS téléchargé et chargé.');
