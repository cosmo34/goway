import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GlassCard } from './GlassCard';
import { colors, radius, spacing, typography } from '../theme';
import type { PlaceCategory, Route, SearchSuggestion } from '../stores/transitStore';

export type TransportMode = 'transit' | 'car' | 'bike' | 'walk';

interface RoutePlannerCardProps {
  destination: string;
  onDestinationChange: (text: string) => void;
  isSearching?: boolean;
  suggestions?: SearchSuggestion[];
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void;
  activeRoute?: Route | null;
  transportMode?: TransportMode;
  onTransportModeChange?: (mode: TransportMode) => void;
  onSwap?: () => void;
}

function suggestionIcon(
  category?: PlaceCategory,
  source?: SearchSuggestion['source']
): keyof typeof Ionicons.glyphMap {
  if (category === 'stop' || source === 'stop') return 'bus-outline';
  if (category === 'monument') return 'flag-outline';
  if (category === 'quarter') return 'grid-outline';
  if (category === 'street') return 'trail-sign-outline';
  return 'location-outline';
}

const MODES: { id: TransportMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'car', icon: 'car-outline' },
  { id: 'transit', icon: 'bus-outline' },
  { id: 'bike', icon: 'bicycle-outline' },
  { id: 'walk', icon: 'walk-outline' },
];

export function RoutePlannerCard({
  destination,
  onDestinationChange,
  isSearching,
  suggestions = [],
  onSelectSuggestion,
  activeRoute,
  transportMode = 'transit',
  onTransportModeChange,
  onSwap,
}: RoutePlannerCardProps) {
  const { t } = useTranslation();
  const showSuggestions = suggestions.length > 0;
  const transitMinutes = activeRoute?.totalDurationMinutes;
  const walkMinutes = activeRoute?.walkingMinutes;

  const modeDuration = (mode: TransportMode): string | null => {
    if (mode === 'transit' && transitMinutes != null) return `${transitMinutes}`;
    if (mode === 'walk' && walkMinutes != null) return `${walkMinutes + (transitMinutes ?? 0)}`;
    return null;
  };

  return (
    <View style={styles.wrapper}>
      {showSuggestions ? (
        <GlassCard style={styles.suggestionsCard}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.suggestionsScroll}
          >
            {suggestions.map((item, index) => (
              <Pressable
                key={`${item.name}-${item.coordinates.latitude}-${index}`}
                onPress={() => onSelectSuggestion?.(item)}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  index < suggestions.length - 1 && styles.suggestionRowBorder,
                  pressed && styles.suggestionPressed,
                ]}
                accessibilityRole="button"
              >
                <Ionicons
                  name={suggestionIcon(item.category, item.source)}
                  size={16}
                  color={colors.textSecondary}
                />
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.displayName !== item.name ? (
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </GlassCard>
      ) : null}

      <GlassCard>
        <View style={styles.routeFields}>
          <View style={styles.routeIcons}>
            <View style={styles.originRing} />
            <View style={styles.connector} />
            <View style={styles.destDot}>
              <View style={styles.destDotInner} />
            </View>
          </View>

          <View style={styles.routeInputs}>
            <Text style={styles.originLabel}>{t('map.myLocation')}</Text>
            <TextInput
              style={styles.destinationInput}
              value={destination}
              onChangeText={onDestinationChange}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              accessibilityLabel={t('common.search')}
              autoCorrect={false}
            />
          </View>

          <Pressable
            onPress={onSwap}
            style={styles.swapButton}
            accessibilityRole="button"
            accessibilityLabel={t('map.swapRoute')}
          >
            <Ionicons name="swap-vertical" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.modeRow}>
          {MODES.map((mode) => {
            const active = transportMode === mode.id;
            const duration = modeDuration(mode.id);
            const enabled = mode.id === 'transit' || mode.id === 'walk';

            return (
              <Pressable
                key={mode.id}
                onPress={() => enabled && onTransportModeChange?.(mode.id)}
                style={[styles.modeChip, active && styles.modeChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={mode.icon}
                  size={18}
                  color={active ? colors.textInverse : colors.textTertiary}
                />
                <Text style={[styles.modeDuration, active && styles.modeDurationActive]}>
                  {duration ?? '—'}
                </Text>
                {duration ? (
                  <Text style={[styles.modeMin, active && styles.modeMinActive]}>
                    {t('common.min')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {isSearching ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : null}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  suggestionsCard: {
    maxHeight: 200,
  },
  suggestionsScroll: {
    flexGrow: 0,
  },
  routeFields: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  routeIcons: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  originRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
  },
  connector: {
    width: 2,
    height: 22,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  destDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
  routeInputs: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  originLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  destinationInput: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    padding: 0,
  },
  swapButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modeRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
    opacity: 0.55,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
    opacity: 1,
  },
  modeDuration: {
    ...typography.labelMedium,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  modeDurationActive: {
    color: colors.textInverse,
  },
  modeMin: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    fontSize: 9,
  },
  modeMinActive: {
    color: 'rgba(13, 17, 23, 0.7)',
  },
  loadingRow: {
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  suggestionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
  },
  suggestionName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  suggestionSub: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
