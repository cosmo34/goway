import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { api } from '../../src/services/api/client';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import { colors, spacing, typography, radius } from '../../src/theme';

interface Alert {
  id: string;
  headerText: string;
  descriptionText: string;
  severity: 'info' | 'warning' | 'critical';
  affectedRouteIds: string[];
}

const SEVERITY_COLORS = {
  info: colors.accent,
  warning: colors.warning,
  critical: colors.error,
};

export default function AlertsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api.get<Alert[]>('/api/alerts');
      setAlerts(data);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 60_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppMenuButton top={insets.top + spacing.sm} />
      <Text style={[styles.title, { paddingRight: 56 }]} accessibilityRole="header">
        {t('tabs.alerts')}
      </Text>

      <FlatList<Alert>
        data={alerts}
        keyExtractor={(item: Alert) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune perturbation signalée</Text>
          </View>
        }
        renderItem={({ item }: { item: Alert }) => (
          <View
            style={[styles.card, { borderLeftColor: SEVERITY_COLORS[item.severity] }]}
            accessibilityRole="alert"
          >
            <Text style={styles.cardTitle}>{item.headerText}</Text>
            {item.descriptionText ? (
              <Text style={styles.cardBody}>{item.descriptionText}</Text>
            ) : null}
            {item.affectedRouteIds.length > 0 && (
              <Text style={styles.cardLines}>
                Lignes : {item.affectedRouteIds.join(', ')}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.xs },
  cardBody: { ...typography.bodySmall, color: colors.textSecondary },
  cardLines: { ...typography.labelSmall, color: colors.textTertiary, marginTop: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyText: { ...typography.bodyMedium, color: colors.textTertiary },
});
