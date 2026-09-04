import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import { getWidgetDeparturesApi } from '../api/transitApi';
import { liveActivityService } from '../liveActivity/liveActivityService';
import { stopLiveActivityService } from '../liveActivity/stopLiveActivityService';
import { navigationLiveActivityService } from '../liveActivity/navigationLiveActivityService';
import { useTransitStore } from '../../stores/transitStore';

const FAVORITE_STOP_KEY = 'favoriteStopId';
const FAVORITE_STOP_NAME_KEY = 'favoriteStopName';
const WIDGET_CACHE_KEY = 'widgetDeparturesCache';

export async function setFavoriteStop(stopId: string, stopName: string): Promise<void> {
  await AsyncStorage.multiSet([
    [FAVORITE_STOP_KEY, stopId],
    [FAVORITE_STOP_NAME_KEY, stopName],
  ]);
  await liveActivityService.setAppGroupData('favoriteStopId', stopId);
  await liveActivityService.setAppGroupData('favoriteStopName', stopName);
  await liveActivityService.setAppGroupData('apiBase', API_BASE_URL);
  await syncWidgetData(stopId);
}

export async function getFavoriteStop(): Promise<{ stopId: string; stopName: string } | null> {
  const [[, stopId], [, stopName]] = await AsyncStorage.multiGet([
    FAVORITE_STOP_KEY,
    FAVORITE_STOP_NAME_KEY,
  ]);
  if (!stopId) return null;
  return { stopId, stopName: stopName ?? '' };
}

/** Synchronise les départs pour le widget / Live Activity */
export async function syncWidgetData(stopId?: string): Promise<void> {
  const id =
    stopId ?? (await getFavoriteStop())?.stopId;
  if (!id) return;

  try {
    const departures = await getWidgetDeparturesApi(id);
    await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(departures));
    await liveActivityService.setAppGroupData('departuresCache', JSON.stringify(departures));

    const next = departures[0];
    if (
      next &&
      liveActivityService.isSupported() &&
      !useTransitStore.getState().navigationActive &&
      !stopLiveActivityService.isActive() &&
      !navigationLiveActivityService.isActive()
    ) {
      const fav = await getFavoriteStop();
      await liveActivityService.update({
        lineName: next.lineName,
        lineColor: next.lineColor,
        direction: next.direction,
        minutesUntil: next.minutesUntil,
        stopName: fav?.stopName ?? '',
        isRealtime: next.isRealtime,
      });
    }
  } catch {
    /* offline */
  }
}

export async function getCachedWidgetDepartures() {
  const raw = await AsyncStorage.getItem(WIDGET_CACHE_KEY);
  return raw ? JSON.parse(raw) : [];
}
