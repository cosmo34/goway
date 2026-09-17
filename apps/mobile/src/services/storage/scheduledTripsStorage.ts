import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coordinates } from '../../stores/transitStore';

const KEY = '@goway/scheduled-trips';

export interface ScheduledTrip {
  id: string;
  originLabel: string;
  origin: Coordinates;
  destinationLabel: string;
  destination: Coordinates;
  departureTimeIso: string;
  summary?: string;
  createdAtIso: string;
  reminderFired?: boolean;
  liveActivityStarted?: boolean;
}

async function readAll(): Promise<ScheduledTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(trips: ScheduledTrip[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(trips));
}

export async function listScheduledTrips(): Promise<ScheduledTrip[]> {
  const trips = await readAll();
  const now = Date.now() - 60 * 60_000; // garder 1h après l’heure de départ
  const active = trips.filter((t) => new Date(t.departureTimeIso).getTime() > now);
  if (active.length !== trips.length) await writeAll(active);
  return active.sort(
    (a, b) => new Date(a.departureTimeIso).getTime() - new Date(b.departureTimeIso).getTime()
  );
}

export async function getNextScheduledTrip(): Promise<ScheduledTrip | null> {
  const trips = await listScheduledTrips();
  return trips[0] ?? null;
}

export async function saveScheduledTrip(
  trip: Omit<ScheduledTrip, 'id' | 'createdAtIso' | 'reminderFired' | 'liveActivityStarted'>
): Promise<ScheduledTrip> {
  const next: ScheduledTrip = {
    ...trip,
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAtIso: new Date().toISOString(),
    reminderFired: false,
    liveActivityStarted: false,
  };
  const trips = await readAll();
  // Un seul trajet planifié à la fois pour l’UI barre haute
  await writeAll([next, ...trips.filter((t) => t.id !== next.id)].slice(0, 5));
  return next;
}

export async function updateScheduledTrip(
  id: string,
  patch: Partial<ScheduledTrip>
): Promise<ScheduledTrip | null> {
  const trips = await readAll();
  const index = trips.findIndex((t) => t.id === id);
  if (index < 0) return null;
  trips[index] = { ...trips[index], ...patch };
  await writeAll(trips);
  return trips[index];
}

export async function removeScheduledTrip(id: string): Promise<void> {
  const trips = await readAll();
  await writeAll(trips.filter((t) => t.id !== id));
}

export function isFutureDeparture(departure: Date, now = new Date(), thresholdMinutes = 10): boolean {
  return departure.getTime() - now.getTime() > thresholdMinutes * 60_000;
}

export function minutesUntilDeparture(departure: Date, now = new Date()): number {
  return Math.round((departure.getTime() - now.getTime()) / 60_000);
}
