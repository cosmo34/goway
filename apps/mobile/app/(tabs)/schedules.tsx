import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DepartureRow } from '../../src/components/DepartureRow';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { useAppStore } from '../../src/stores/appStore';
import { getNearbyStopDeparturesApi, type NearbyStopDepartures } from '../../src/services/api/transitApi';
import { colors, spacing, typography } from '../../src/theme';

const MENU_CLEARANCE = 56;

export default function SchedulesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const largeText = useAppStore((s) => s.accessibility.largeText);
  const { location, refresh: refreshLocation } = useUserLocation(true);
  const [sections, setSections] = useState<NearbyStopDepartures[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNearby = useCallback(async () => {
    const coords = location ?? (await refreshLocation());
    if (!coords) {
      setSections([]);
      return;
    }
    const data = await getNearbyStopDeparturesApi(coords.latitude, coords.longitude, 5, 4);
    setSections(data);
  }, [location, refreshLocation]);

  useEffect(() => {
    loadNearby()
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
    const interval = setInterval(loadNearby, 30_000);
    return () => clearInterval(interval);
  }, [loadNearby]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNearby();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppMenuButton top={insets.top + spacing.sm} />
      <Text style={[styles.title, { paddingRight: MENU_CLEARANCE }]} accessibilityRole="header">
        {t('schedules.title')}
      </Text>
      <Text style={styles.subtitle}>{t('schedules.nearbyStops')}</Text>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {loading && sections.length === 0 ? (
          <Text style={styles.empty}>{t('common.loading')}</Text>
        ) : sections.length === 0 ? (
          <Text style={styles.empty}>{t('schedules.noNearbyStops')}</Text>
        ) : (
          sections.map(({ stop, departures }) => (
            <View key={stop.id} style={styles.stopSection}>
              <View style={styles.stopHeader}>
                <Text style={styles.stopName}>{stop.name}</Text>
                {stop.distanceMeters != null && (
                  <Text style={styles.stopDistance}>
                    {stop.distanceMeters < 1000
                      ? `${stop.distanceMeters} m`
                      : `${(stop.distanceMeters / 1000).toFixed(1)} km`}
                  </Text>
                )}
              </View>
              {departures.length === 0 ? (
                <Text style={styles.noDeps}>{t('schedules.noDepartures')}</Text>
              ) : (
                departures.map((dep, i) => (
                  <DepartureRow
                    key={`${stop.id}-${dep.lineId}-${dep.direction}-${i}`}
                    departure={dep}
                    accessibilityLargeText={largeText}
                  />
                ))
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: spacing.xs,
  },
  stopSection: {
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  stopName: { ...typography.titleSmall, color: colors.textPrimary },
  stopDistance: { ...typography.labelMedium, color: colors.accent },
  noDeps: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    padding: spacing.lg,
  },
  empty: {
    ...typography.bodyMedium,
    color: colors.textTertiary,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
