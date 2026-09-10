import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { LineBadge, formatLineBadgeLabel } from './LineBadge';
import { colors, radius, spacing, typography } from '../theme';
import type { Route } from '../stores/transitStore';

interface RouteOptionsSheetProps {
  routes: Route[];
  destinationLabel: string;
  selectedIndex: number;
  onPreview: (index: number) => void;
  onStart: (index: number) => void;
  onClose: () => void;
}

function transitLegs(route: Route) {
  return route.legs.filter((leg) => leg.mode !== 'walk');
}

function lineLabel(line: { lineShortName?: string; lineName?: string; lineId?: string }): string {
  if (line.lineShortName) return line.lineShortName;
  if (line.lineId) return line.lineId;
  return formatLineBadgeLabel(line.lineName);
}

export function RouteOptionsSheet({
  routes,
  destinationLabel,
  selectedIndex,
  onPreview,
  onStart,
  onClose,
}: RouteOptionsSheetProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
        <MapGlassBackground variant="dark" />

        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Ionicons name="navigate-outline" size={14} color={colors.accent} />
            <Text style={styles.destination} numberOfLines={1}>
              {destinationLabel}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.options}>
          {routes.map((route, index) => {
            const lines = transitLegs(route);
            const selected = index === selectedIndex;

            return (
              <Pressable
                key={route.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPreview(index);
                }}
                style={[styles.optionRow, selected && styles.optionRowSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>

                <View style={styles.departureBlock}>
                  <View style={styles.fastIconSlot}>
                    {index === 0 ? (
                      <Ionicons name="flash" size={10} color={colors.accent} />
                    ) : null}
                  </View>
                  <Text style={[styles.departureTime, selected && styles.textSelected]}>
                    {format(route.departureTime, 'HH:mm', { locale: fr })}
                  </Text>
                </View>

                <View style={styles.durationBlock}>
                  <Text style={[styles.duration, selected && styles.textSelected]}>
                    {route.totalDurationMinutes}
                    <Text style={styles.durationUnit}> {t('common.min')}</Text>
                  </Text>
                  <Text style={styles.arrival}>
                    → {format(route.arrivalTime, 'HH:mm', { locale: fr })}
                  </Text>
                </View>

                <View style={styles.lineRow}>
                  {lines.map((line, lineIndex) => (
                    <View key={`${route.id}-${lineIndex}`} style={styles.lineGroup}>
                      {lineIndex > 0 ? (
                        <Text style={styles.lineSeparator}>·</Text>
                      ) : null}
                      <LineBadge label={lineLabel(line)} lineColor={line.lineColor} />
                    </View>
                  ))}
                </View>

              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={styles.startButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onStart(selectedIndex);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('map.startNavigation')}
        >
          <MapGlassBackground variant="dark" />
          <Text style={styles.startButtonText}>{t('map.startNavigation')}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.md,
  },
  sheet: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destination: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  options: {
    gap: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.xs,
    paddingVertical: 7,
    minHeight: 40,
  },
  optionRowSelected: {
    borderColor: 'rgba(91, 141, 239, 0.35)',
    backgroundColor: 'rgba(91, 141, 239, 0.08)',
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  departureBlock: {
    width: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  fastIconSlot: {
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  departureTime: {
    ...typography.labelMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary,
    fontWeight: '700',
    minWidth: 40,
  },
  textSelected: {
    color: colors.textPrimary,
  },
  durationBlock: {
    width: 58,
    flexShrink: 0,
    marginLeft: spacing.xs,
  },
  duration: {
    ...typography.labelMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  durationUnit: {
    fontSize: 12,
    color: '#B8C5D6',
    fontWeight: '500',
  },
  arrival: {
    fontSize: 11,
    lineHeight: 14,
    color: '#A8B6C8',
    fontWeight: '500',
  },
  lineRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 88,
    marginLeft: spacing.xs,
  },
  lineGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineSeparator: {
    color: colors.textTertiary,
    fontSize: 10,
    marginHorizontal: 1,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 9,
    marginTop: 2,
  },
  startButtonText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
