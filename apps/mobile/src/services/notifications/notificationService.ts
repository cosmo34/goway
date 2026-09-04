import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import type { TripReminder } from '../../stores/transitStore';
import { routingService } from '../routing/routingService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  async requestPermissions(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Planifie une notification de départ
   * Calcule : heure départ véhicule - temps marche - marge (2 min)
   */
  async scheduleDepartureReminder(reminder: TripReminder): Promise<string | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    const notifyAt = new Date(
      reminder.departureTime.getTime() -
        (reminder.walkingMinutes + 2) * 60_000
    );

    if (notifyAt <= new Date()) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GOWAY — Partez maintenant',
        body: `${reminder.lineId} à ${reminder.stopName} dans ${reminder.walkingMinutes} min de marche`,
        sound: true,
        data: { routeId: reminder.routeId, stopId: reminder.stopId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notifyAt,
      },
    });

    return id;
  }

  async cancelReminder(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /** Recalcule le temps de marche en temps réel et ajuste la notification */
  async updateWalkingTime(
    reminder: TripReminder,
    notificationId: string
  ): Promise<void> {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const walkingMinutes = routingService.estimateWalkingTime(
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      // TODO: récupérer les coords de l'arrêt depuis le store GTFS
      { latitude: 43.6085, longitude: 3.8795 }
    );

    await this.cancelReminder(notificationId);
    await this.scheduleDepartureReminder({
      ...reminder,
      walkingMinutes,
      notifyAt: new Date(
        reminder.departureTime.getTime() - (walkingMinutes + 2) * 60_000
      ),
    });
  }
}

export const notificationService = new NotificationService();
