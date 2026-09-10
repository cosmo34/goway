import AsyncStorage from '@react-native-async-storage/async-storage';
import { setFavoriteStop, getFavoriteStop } from '../widget/widgetStorage';

const FAVORITES_KEY = '@goway/favorite-stops';

export interface FavoriteStop {
  stopId: string;
  stopName: string;
}

async function readAll(): Promise<FavoriteStop[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      // Migration : ancien favori widget unique
      const legacy = await getFavoriteStop();
      if (!legacy) return [];
      const migrated = [{ stopId: legacy.stopId, stopName: legacy.stopName }];
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const parsed = JSON.parse(raw) as FavoriteStop[];
    return Array.isArray(parsed) ? parsed.filter((f) => f?.stopId && f?.stopName) : [];
  } catch {
    return [];
  }
}

async function writeAll(favorites: FavoriteStop[]): Promise<void> {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  const primary = favorites[0];
  if (primary) {
    await setFavoriteStop(primary.stopId, primary.stopName);
  } else {
    await AsyncStorage.multiRemove(['favoriteStopId', 'favoriteStopName']);
  }
}

export async function getFavoriteStops(): Promise<FavoriteStop[]> {
  return readAll();
}

export async function isFavoriteStop(stopId: string): Promise<boolean> {
  const favorites = await readAll();
  return favorites.some((f) => f.stopId === stopId);
}

export async function toggleFavoriteStop(
  stopId: string,
  stopName: string
): Promise<{ favorites: FavoriteStop[]; isFavorite: boolean }> {
  const favorites = await readAll();
  const index = favorites.findIndex((f) => f.stopId === stopId);
  let next: FavoriteStop[];
  let isFavorite: boolean;

  if (index >= 0) {
    next = favorites.filter((_, i) => i !== index);
    isFavorite = false;
  } else {
    next = [{ stopId, stopName }, ...favorites.filter((f) => f.stopId !== stopId)];
    isFavorite = true;
  }

  await writeAll(next);
  return { favorites: next, isFavorite };
}
