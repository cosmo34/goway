import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DepartureRow } from '../../src/components/DepartureRow';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import {
  MapGlassBackground,
  useMapGlassPanelStyle,
} from '../../src/components/MapGlassSurface';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { useAppStore } from '../../src/stores/appStore';
import { useThemeColors } from '../../src/theme/ThemeContext';
import {
  getNearbyStopDeparturesApi,
  getDeparturesApi,
  type NearbyStopDepartures,
} from '../../src/services/api/transitApi';
import {
  getFavoriteStops,
  type FavoriteStop,
} from '../../src/services/storage/favoritesStorage';
import { spacing, typography } from '../../src/theme';
import type { Departure } from '../../src/stores/transitStore';

const MENU_CLEARANCE = 56;

interface FavoriteSection {
  stop: FavoriteStop;
  departures: Departure[];
}

export default function SchedulesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const glassPanelStyle = useMapGlassPanelStyle();
  const largeText = useAppStore((s) => s.accessibility.largeText);
  const { location, refresh: refreshLocation } = useUserLocation(true);
  const [sections, setSections] = useState<NearbyStopDepartures[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    const favs = await getFavoriteStops();
    const loaded = await Promise.all(
      favs.map(async (stop) => {
        try {
          const departures = await getDeparturesApi(stop.stopId);
          return { stop, departures: departures.slice(0, 4) };
        } catch {
          return { stop, departures: [] as Departure[] };
        }
      })
    );
    setFavorites(loaded);
  }, []);

  const loadNearby = useCallback(async () => {
    const coords = location ?? (await refreshLocation());
    if (!coords) {
      setSections([]);
      return;
    }
    const data = await getNearbyStopDeparturesApi(coords.latitude, coords.longitude, 5, 4);
    setSections(data);
  }, [location, refreshLocation]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadFavorites(), loadNearby()]);
  }, [loadFavorites, loadNearby]);

  useFocusEffect(
    useCallback(() => {
      void reloadAll()
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, [reloadAll])
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void reloadAll();
    }, 30_000);
    return () => clearInterval(interval);
  }, [reloadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  };

  const renderStopCard = (
    key: string,
    name: string,
    meta: string | null,
    departures: Departure[],
    favorite?: boolean
  ) => (
    <View key={key} style={[glassPanelStyle, styles.stopCard]}>
      <MapGlassBackground />
      <View style={styles.stopHeader}>
        <View style={styles.stopTitleRow}>
          {favorite ? (
            <Ionicons name="star" size={16} color={colors.accent} />
          ) : null}
          <Text style={styles.stopName} numberOfLines={2}>
            {name}
          </Text>
        </View>
        {meta ? <Text style={styles.stopMeta}>{meta}</Text> : null}
      </View>
      {departures.length === 0 ? (
        <Text style={styles.noDeps}>{t('schedules.noDepartures')}</Text>
      ) : (
        departures.map((dep, i) => (
          <DepartureRow
            key={`${key}-${dep.lineId}-${dep.direction}-${i}`}
            departure={dep}
            accessibilityLargeText={largeText}
          />
        ))
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppMenuButton top={insets.top + spacing.sm} />
      <Text style={[styles.title, { paddingRight: MENU_CLEARANCE }]} accessibilityRole="header">
        {t('schedules.title')}
      </Text>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {favorites.length > 0 ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{t('schedules.favorites')}</Text>
            {favorites.map(({ stop, departures }) =>
              renderStopCard(stop.stopId, stop.stopName, null, departures, true)
            )}
          </View>
        ) : null}

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t('schedules.nearbyStops')}</Text>
          {loading && sections.length === 0 && favorites.length === 0 ? (
            <Text style={styles.empty}>{t('common.loading')}</Text>
          ) : sections.length === 0 ? (
            <Text style={styles.empty}>{t('schedules.noNearbyStops')}</Text>
          ) : (
            sections.map(({ stop, departures }) =>
              renderStopCard(
                stop.id,
                stop.name,
                stop.distanceMeters != null
                  ? stop.distanceMeters < 1000
                    ? `${stop.distanceMeters} m`
                    : `${(stop.distanceMeters / 1000).toFixed(1)} km`
                  : null,
                departures
              )
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: {
      ...typography.titleMedium,
      color: colors.textPrimary,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    sectionBlock: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.labelMedium,
      color: colors.textTertiary,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    stopCard: {
      marginBottom: spacing.xs,
    },
    stopHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + 2,
      paddingBottom: spacing.xs,
      gap: spacing.sm,
    },
    stopTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    stopName: {
      ...typography.labelLarge,
      color: colors.textPrimary,
      fontWeight: '600',
      flexShrink: 1,
    },
    stopMeta: { ...typography.labelSmall, color: colors.accent },
    noDeps: {
      ...typography.bodySmall,
      color: colors.textTertiary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    empty: {
      ...typography.bodySmall,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
}
