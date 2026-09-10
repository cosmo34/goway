import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CONFIG } from './config.js';
import { loadGtfs } from './services/gtfsLoader.js';
import { loadNetworkShapes } from './services/networkShapeService.js';
import { clearLineSegmentsCache } from './services/lineService.js';
import { startGtfsRtPolling } from './services/gtfsRtService.js';
import { registerRoutes } from './routes/index.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await registerRoutes(app);

async function bootstrap() {
  console.log('[GOWAY API] Chargement GTFS…');
  await loadGtfs();
  await loadNetworkShapes();
  clearLineSegmentsCache();
  startGtfsRtPolling();

  // Rafraîchissement GTFS quotidien
  setInterval(() => {
    void loadGtfs(true)
      .then(() => loadNetworkShapes(true))
      .then(() => clearLineSegmentsCache());
  }, CONFIG.gtfsRefreshHours * 3600_000);

  await app.listen({ port: CONFIG.port, host: CONFIG.host });
  console.log(`[GOWAY API] http://${CONFIG.host}:${CONFIG.port}`);
}

bootstrap().catch((err) => {
  console.error('[GOWAY API] Erreur démarrage:', err);
  process.exit(1);
});
