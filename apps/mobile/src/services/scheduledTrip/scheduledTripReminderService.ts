import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { liveActivityService } from '../liveActivity/liveActivityService';
import {
  getNextScheduledTrip,
  listScheduledTrips,
  minutesUntilDeparture,
  removeScheduledTrip,
  updateScheduledTrip,
  type ScheduledTrip,
} from '../storage/scheduledTripsStorage';

const REMINDER_LEAD_MINUTES = 30;
const NOTIFICATION_CHANNEL = 'scheduled-trips';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
      name: 'Trajets planifiés',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

function buildLiveActivityPayload(trip: ScheduledTrip, minutesUntil: number) {
  return {
    lineName: 'GOWAY',
    lineColor: '#2DD4BF',
    direction: `${trip.originLabel} → ${trip.destinationLabel}`,
    minutesUntil: Math.max(0, minutesUntil),
    stopName: trip.destinationLabel,
    isRealtime: false,
    isNavigation: false,
    isStopTracking: false,
  };
}

/**
 * Surveille le prochain trajet enregistré :
 * - 30 min avant : notification « partez bientôt »
 * - démarre une Live Activity jusqu’au départ
 */
export const scheduledTripReminderService = {
  leadMinutes: REMINDER_LEAD_MINUTES,

  async scheduleNotification(trip: ScheduledTrip): Promise<void> {
    const ok = await ensurePermissions();
    if (!ok) return;

    const departure = new Date(trip.departureTimeIso).getTime();
    const fireAt = departure - REMINDER_LEAD_MINUTES * 60_000;
    const seconds = Math.max(5, Math.round((fireAt - Date.now()) / 1000));

    try {
      await Notifications.cancelScheduledNotificationAsync(`scheduled-${trip.id}`);
    } catch {
      /* ignore */
    }

    if (fireAt <= Date.now()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `scheduled-${trip.id}`,
        content: {
          title: 'C’est bientôt l’heure',
          body: `Partez pour ${trip.destinationLabel} — départ dans ${REMINDER_LEAD_MINUTES} min`,
          sound: true,
        },
        trigger: null,
      });
      return;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: `scheduled-${trip.id}`,
      content: {
        title: 'C’est bientôt l’heure',
        body: `Partez pour ${trip.destinationLabel} — départ prévu à ${new Date(
          trip.departureTimeIso
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: Platform.OS === 'android' ? NOTIFICATION_CHANNEL : undefined,
      },
    });
  },

  async tick(): Promise<ScheduledTrip | null> {
    const trips = await listScheduledTrips();
    const next = trips[0];
    if (!next) return null;

    const departure = new Date(next.departureTimeIso);
    const mins = minutesUntilDeparture(departure);

    if (mins <= REMINDER_LEAD_MINUTES && mins >= -5) {
      if (!next.reminderFired) {
        await updateScheduledTrip(next.id, { reminderFired: true });
        const ok = await ensurePermissions();
        if (ok) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Il est temps de partir',
              body: `${next.originLabel} → ${next.destinationLabel} · dans ${Math.max(0, mins)} min`,
              sound: true,
            },
            trigger: null,
          });
        }
      }

      if (!next.liveActivityStarted && liveActivityService.isSupported()) {
        const started = await liveActivityService.start(
          buildLiveActivityPayload(next, Math.max(0, mins))
        );
        if (started) {
          await updateScheduledTrip(next.id, { liveActivityStarted: true });
        }
      } else if (next.liveActivityStarted && liveActivityService.isSupported()) {
        await liveActivityService.update(buildLiveActivityPayload(next, Math.max(0, mins)));
      }
    }

    return getNextScheduledTrip();
  },

  async cancelTrip(tripId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(`scheduled-${tripId}`);
    } catch {
      /* ignore */
    }
    const trip = (await listScheduledTrips()).find((t) => t.id === tripId);
    if (trip?.liveActivityStarted && liveActivityService.isSupported()) {
      try {
        await liveActivityService.end();
      } catch {
        /* ignore */
      }
    }
    await removeScheduledTrip(tripId);
  },
};
