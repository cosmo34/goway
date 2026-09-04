import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { TAM, CONFIG } from '../config.js';

function toUnixTime(value: number | { toNumber(): number } | null | undefined): number | undefined {
  if (value == null) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
}

export interface TripDelay {
  tripId: string;
  stopId: string;
  delaySeconds: number;
  arrivalTime?: number;
  departureTime?: number;
}

export interface VehiclePosition {
  vehicleId: string;
  tripId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  timestamp: number;
}

export interface ServiceAlertData {
  id: string;
  headerText: string;
  descriptionText: string;
  severity: 'info' | 'warning' | 'critical';
  affectedRouteIds: string[];
}

let tripDelays = new Map<string, TripDelay[]>();
let vehiclePositions = new Map<string, VehiclePosition>();
let serviceAlerts: ServiceAlertData[] = [];
let lastFetch: Date | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchProtobuf(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GOWAY/1.0 (Montpellier Transit App)' },
    });
    if (!response.ok) {
      console.warn(`[GTFS-RT] ${url} → ${response.status}`);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    console.warn(`[GTFS-RT] Fetch error:`, err);
    return null;
  }
}

export async function refreshGtfsRt(): Promise<void> {
  const [tripBuf, vehicleBuf, alertBuf] = await Promise.all([
    fetchProtobuf(TAM.gtfsRt.urban.tripUpdates),
    fetchProtobuf(TAM.gtfsRt.urban.vehiclePositions),
    fetchProtobuf(TAM.gtfsRt.urban.alerts),
  ]);

  const newDelays = new Map<string, TripDelay[]>();

  if (tripBuf) {
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(tripBuf);
    for (const entity of feed.entity) {
      const tu = entity.tripUpdate;
      if (!tu?.trip?.tripId) continue;
      const tripId = tu.trip.tripId;
      const delays: TripDelay[] = [];

      for (const stu of tu.stopTimeUpdate ?? []) {
        if (!stu.stopId) continue;
        delays.push({
          tripId,
          stopId: stu.stopId,
          delaySeconds: stu.arrival?.delay ?? stu.departure?.delay ?? 0,
          arrivalTime: toUnixTime(stu.arrival?.time),
          departureTime: toUnixTime(stu.departure?.time),
        });
      }
      newDelays.set(tripId, delays);
    }
  }

  const newVehicles = new Map<string, VehiclePosition>();
  if (vehicleBuf) {
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(vehicleBuf);
    for (const entity of feed.entity) {
      const v = entity.vehicle;
      if (!v?.vehicle?.id || !v.position) continue;
      newVehicles.set(v.vehicle.id, {
        vehicleId: v.vehicle.id,
        tripId: v.trip?.tripId ?? '',
        routeId: v.trip?.routeId ?? '',
        latitude: v.position.latitude ?? 0,
        longitude: v.position.longitude ?? 0,
        bearing: v.position.bearing ?? undefined,
        speed: v.position.speed ?? undefined,
        timestamp: Number(v.timestamp ?? 0),
      });
    }
  }

  const newAlerts: ServiceAlertData[] = [];
  if (alertBuf) {
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(alertBuf);
    for (const entity of feed.entity) {
      const a = entity.alert;
      if (!a) continue;
      newAlerts.push({
        id: entity.id ?? `alert-${Date.now()}`,
        headerText: a.headerText?.translation?.[0]?.text ?? 'Alerte',
        descriptionText: a.descriptionText?.translation?.[0]?.text ?? '',
        severity:
          a.effect === 1 || a.effect === 2
            ? 'critical'
            : a.effect === 3
              ? 'warning'
              : 'info',
        affectedRouteIds: (a.informedEntity ?? [])
          .map((e) => e.routeId)
          .filter(Boolean) as string[],
      });
    }
  }

  tripDelays = newDelays;
  vehiclePositions = newVehicles;
  serviceAlerts = newAlerts;
  lastFetch = new Date();

  console.log(
    `[GTFS-RT] ${newDelays.size} trip updates, ${newVehicles.size} véhicules, ${newAlerts.length} alertes`
  );
}

export function getTripDelay(tripId: string, stopId: string): TripDelay | undefined {
  return tripDelays.get(tripId)?.find((d) => d.stopId === stopId);
}

export function getVehiclePositions(): VehiclePosition[] {
  return Array.from(vehiclePositions.values());
}

export function getServiceAlerts(): ServiceAlertData[] {
  return serviceAlerts;
}

export function getLastRtFetch(): Date | null {
  return lastFetch;
}

export function startGtfsRtPolling(): void {
  if (pollTimer) return;
  refreshGtfsRt();
  pollTimer = setInterval(refreshGtfsRt, CONFIG.gtfsRtPollSeconds * 1000);
}

export function stopGtfsRtPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
