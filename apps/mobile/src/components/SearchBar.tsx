import { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Text,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  mapGlassSurfaceStyles,
  mapChromeText,
  MAP_CHROME_BORDER,
} from './MapGlassSurface';
import { TransportModeFilters } from './TransportModeFilters';
import { CompactTimeSelector } from './CompactTimeSelector';
import { spacing, typography, radius } from '../theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitSearch?: (text: string) => void;
  isLoading?: boolean;
  originValue: string;
  onOriginChange: (text: string) => void;
  onOriginFocus?: () => void;
  onDestinationFocus?: () => void;
  usingMyLocation: boolean;
  onUseMyLocation: () => void;
  departureLabel: string;
  departureTime: Date;
  onDepartureChange: (date: Date) => void;
}

const TIME_BTN_WIDTH = 92;
/** Arrondi de la bulle : +20 % par rapport à 18. */
const SEARCH_PANEL_RADIUS = 22;
/** Teinte fumée : ~20 % plus transparente que 0.88. */
const SEARCH_PANEL_TINT = 'rgba(12, 16, 24, 0.50)';

export function SearchBar({
  value,
  onChangeText,
  onSubmitSearch,
  isLoading,
  originValue,
  onOriginChange,
  onOriginFocus,
  onDestinationFocus,
  usingMyLocation,
  onUseMyLocation,
  departureLabel,
  departureTime,
  onDepartureChange,
}: SearchBarProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), []);
  const [timeOpen, setTimeOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const showClearButton = value.length > 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.searchPanelWrap}>
        <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.searchPanel]}>
          <View style={styles.glassClip} pointerEvents="none">
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: SEARCH_PANEL_TINT }]} />
          </View>

          <View style={styles.originRow}>
            <TransportModeFilters
              open={modesOpen}
              onOpenChange={(open) => {
                setModesOpen(open);
                if (open) setTimeOpen(false);
              }}
            />
            <View style={styles.originDot} />
            <TextInput
              style={styles.originInput}
              value={originValue}
              onChangeText={onOriginChange}
              onFocus={() => {
                setTimeOpen(false);
                setModesOpen(false);
                onOriginFocus?.();
              }}
              placeholder={t('map.myLocation')}
              placeholderTextColor={mapChromeText.tertiary}
              returnKeyType="search"
              accessibilityLabel={t('trip.origin')}
              autoCorrect={false}
              autoCapitalize="sentences"
            />
            {!usingMyLocation ? (
              <Pressable
                onPress={onUseMyLocation}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityLabel={t('map.myLocation')}
                hitSlop={6}
              >
                <Ionicons name="locate-outline" size={14} color={mapChromeText.accent} />
              </Pressable>
            ) : null}

            <View style={styles.timeAnchor}>
              <CompactTimeSelector
                open={timeOpen}
                value={departureTime}
                anchorWidth={TIME_BTN_WIDTH}
                onChange={onDepartureChange}
                onClose={() => setTimeOpen(false)}
              />
              <Pressable
                onPress={() => {
                  setTimeOpen((v) => !v);
                  setModesOpen(false);
                }}
                style={[styles.timeChip, timeOpen && styles.timeChipOpen]}
                accessibilityRole="button"
                accessibilityLabel={t('trip.departureWhen')}
              >
                <Ionicons name="time-outline" size={13} color={mapChromeText.accent} />
                <Text style={styles.timeChipText} numberOfLines={1}>
                  {departureLabel}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputRow}>
            <Ionicons name="search" size={18} color={mapChromeText.tertiary} />
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onFocus={() => {
                setTimeOpen(false);
                setModesOpen(false);
                onDestinationFocus?.();
              }}
              onSubmitEditing={() => onSubmitSearch?.(value)}
              placeholder={t('search.phrasePlaceholder')}
              placeholderTextColor={mapChromeText.tertiary}
              returnKeyType="search"
              accessibilityLabel={t('common.search')}
              autoCorrect={false}
              autoCapitalize="sentences"
            />
            {isLoading ? <ActivityIndicator color={mapChromeText.accent} size="small" /> : null}
            {showClearButton ? (
              <Pressable
                onPress={() => onChangeText('')}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color={mapChromeText.secondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrapper: {
      width: '100%',
      gap: spacing.xs,
      zIndex: 40,
    },
    searchPanelWrap: {
      marginHorizontal: spacing.lg,
      zIndex: 40,
      overflow: 'visible',
    },
    searchPanel: {
      borderRadius: SEARCH_PANEL_RADIUS,
      overflow: 'visible',
      backgroundColor: 'transparent',
    },
    glassClip: {
      ...StyleSheet.absoluteFill,
      borderRadius: SEARCH_PANEL_RADIUS,
      overflow: 'hidden',
    },
    originRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + 2,
      paddingBottom: spacing.xs + 2,
      zIndex: 50,
      minHeight: 40,
      overflow: 'visible',
    },
    originDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: mapChromeText.accent,
      flexShrink: 0,
    },
    originInput: {
      flex: 1,
      minWidth: 0,
      ...typography.bodyMedium,
      color: mapChromeText.primary,
      paddingVertical: 0,
    },
    chip: {
      height: 28,
      minWidth: 28,
      paddingHorizontal: 6,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: MAP_CHROME_BORDER,
      flexShrink: 0,
    },
    timeAnchor: {
      position: 'relative',
      flexShrink: 0,
      zIndex: 70,
    },
    timeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      width: TIME_BTN_WIDTH,
      height: 28,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: MAP_CHROME_BORDER,
    },
    timeChipOpen: {
      borderColor: mapChromeText.accent,
    },
    timeChipText: {
      ...typography.labelSmall,
      color: mapChromeText.primary,
      fontWeight: '600',
      flexShrink: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.12)',
      marginHorizontal: spacing.md,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      zIndex: 1,
      minHeight: 44,
    },
    input: {
      flex: 1,
      minWidth: 0,
      ...typography.bodyMedium,
      color: mapChromeText.primary,
      paddingVertical: 0,
    },
    clearButton: {
      marginLeft: spacing.xs,
      flexShrink: 0,
    },
  });
}
