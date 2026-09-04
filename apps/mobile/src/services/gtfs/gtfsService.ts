import { GTFS_RT_POLL_INTERVAL } from '../../config/tam';
import type { Departure, Stop } from '../../stores/transitStore';
import {
  searchStopsApi,
  getDeparturesApi,
  checkApiHealth,
} from '../api/transitApi';

const MOCK_STOPS: Stop[] = [
  {
    id: 'COMEDIE',
    name: 'Comédie',
    coordinates: { latitude: 43.6085, longitude: 3.8795 },
    modes: ['tram'],
  },
];

export class GtfsService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private useApi = true;

  async init(): Promise<void> {
    this.useApi = await checkApiHealth();
    console.info(`[GTFS] Mode: ${this.useApi ? 'API backend' : 'mock local'}`);
  }

  async searchStops(query: string): Promise<Stop[]> {
    if (this.useApi) {
      try {
        return await searchStopsApi(query);
      } catch {
        /* fallback */
      }
    }
    if (!query.trim()) return [];
    return MOCK_STOPS.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  async getRealtimeDepartures(stopId: string): Promise<Departure[]> {
    if (this.useApi) {
      try {
        const data = await getDeparturesApi(stopId);
        if (data.length > 0) return data;
      } catch {
        /* fallback */
      }
    }
    return getMockDepartures();
  }

  startRealtimePolling(stopId: string, onUpdate: (deps: Departure[]) => void): void {
    this.startRealtimePollingForStops([stopId], (byStop) => onUpdate(byStop[stopId] ?? []));
  }

  startRealtimePollingForStops(
    stopIds: string[],
    onUpdate: (byStop: Record<string, Departure[]>) => void
  ): void {
    this.stopRealtimePolling();
    if (stopIds.length === 0) {
      onUpdate({});
      return;
    }

    const fetch = async () => {
      const entries = await Promise.all(
        stopIds.map(async (stopId) => [stopId, await this.getRealtimeDepartures(stopId)] as const)
      );
      onUpdate(Object.fromEntries(entries));
    };

    fetch();
    this.pollTimer = setInterval(fetch, GTFS_RT_POLL_INTERVAL);
  }

  stopRealtimePolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const gtfsService = new GtfsService();

function getMockDepartures(): Departure[] {
  const now = new Date();
  return [
    {
      lineId: '1',
      lineName: 'Ligne 1',
      lineColor: '#E85D4C',
      direction: 'Mosson',
      scheduledTime: new Date(now.getTime() + 3 * 60_000),
      realtimeTime: new Date(now.getTime() + 2 * 60_000),
      isRealtime: true,
      mode: 'tram',
    },
  ];
}
