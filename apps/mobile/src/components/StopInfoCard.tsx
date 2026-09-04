import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { MapBlurBackdrop } from './MapBlurBackdrop';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '../theme';
import { LineBadge, formatLineBadgeLabel, STATION_LARGE_SCALE } from './LineBadge';
import { DepartureChip } from './DepartureChip';
import { useStopLiveActivity } from '../hooks/useStopLiveActivity';
import type { Coordinates, Departure, Stop } from '../stores/transitStore';

interface StopInfoCardProps {
  stops: Stop[];
  departuresByStop: Record<string, Departure[]>;
  loading?: boolean;
  top: number;
  contentTop: number;
  userLocation?: Coordinates | null;
  onClose: () => void;
  onNavigate?: (stop: Stop) => void;
}

interface StopLinePage {
  id: string;
  stop: Stop;
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  departures: Departure[];
}

const BASE_FONT_SIZE = Math.round(22 * 0.9 * 10) / 10;

const textStyle = {
  ...typography.titleLarge,
  color: colors.textPrimary,
  fontWeight: '700' as const,
  fontSize: BASE_FONT_SIZE,
};

const directionFontSize = Math.round(BASE_FONT_SIZE * 0.7 * 10) / 10;
const directionsButtonFontSize = Math.round(11 * 0.9 * 10) / 10;
const closeIconSize = Math.round(22 * 0.9);
const directionsIconSize = Math.round(14 * 0.75);
const SWIPE_ARROW_SIZE = 26;
const DEPARTURES_EDGE_PADDING = 36;
const MENTION_GAP_ABOVE = 2;
const MENTION_GAP_BELOW = 2;
const mentionGapAbove = Math.round(MENTION_GAP_ABOVE * 1.1 * 10) / 10;
const mentionTightenBelow = Math.round(MENTION_GAP_BELOW * 0.9 * 10) / 10;
const lineBadgeStationHeight =
  Math.round(6 * STATION_LARGE_SCALE) * 2 + Math.round(22 * STATION_LARGE_SCALE);
const lineBadgeOffsetDown = Math.round(lineBadgeStationHeight * 0.09 * 10) / 10;

function buildStopLinePages(
  stops: Stop[],
  departuresByStop: Record<string, Departure[]>
): StopLinePage[] {
  const pages: StopLinePage[] = [];

  for (const stop of stops) {
    const departures = departuresByStop[stop.id] ?? [];
    if (departures.length === 0) {
      pages.push({
        id: `${stop.id}:pending`,
        stop,
        lineId: 'pending',
        lineName: '',
        lineColor: colors.textSecondary,
        direction: '',
        departures: [],
      });
      continue;
    }

    const byLineAndDirection = new Map<string, Departure[]>();
    for (const departure of departures) {
      const key = `${departure.lineId}:${departure.direction}`;
      const bucket = byLineAndDirection.get(key) ?? [];
      bucket.push(departure);
      byLineAndDirection.set(key, bucket);
    }

    for (const [key, directionDepartures] of byLineAndDirection) {
      const first = directionDepartures[0];
      const sorted = [...directionDepartures].sort((a, b) => {
        const timeA = (a.realtimeTime ?? a.scheduledTime).getTime();
        const timeB = (b.realtimeTime ?? b.scheduledTime).getTime();
        return timeA - timeB;
      });

      pages.push({
        id: `${stop.id}:${key}`,
        stop,
        lineId: first.lineId,
        lineName: first.lineName,
        lineColor: first.lineColor,
        direction: first.direction,
        departures: sorted.slice(0, 5),
      });
    }
  }

  return pages;
}

export function StopInfoCard({
  stops,
  departuresByStop,
  loading,
  top,
  contentTop,
  userLocation,
  onClose,
  onNavigate,
}: StopInfoCardProps) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const [activePage, setActivePage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  const pages = useMemo(
    () => buildStopLinePages(stops, departuresByStop),
    [stops, departuresByStop]
  );

  const stopsKey = useMemo(() => stops.map((stop) => stop.id).join(','), [stops]);

  useEffect(() => {
    setActivePage(0);
  }, [pages]);

  const currentPage = pages[activePage] ?? pages[0];
  const hasMultiplePages = pages.length > 1;
  const pagerWidth = screenWidth;

  const { tracking, liveActivityEnabled, toggleTracking } = useStopLiveActivity({
    pages,
    currentPage,
    userLocation,
    stopsKey,
  });

  const handlePageScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pagerWidth);
      if (nextIndex >= 0 && nextIndex < pages.length) setActivePage(nextIndex);
    },
    [pages.length, pagerWidth]
  );

  const goToPage = useCallback(
    (index: number) => {
      if (index < 0 || index >= pages.length) return;
      pagerRef.current?.scrollTo({ x: index * pagerWidth, animated: true });
      setActivePage(index);
    },
    [pages.length, pagerWidth]
  );

  const goToPreviousPage = useCallback(() => {
    goToPage(activePage - 1);
  }, [activePage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(activePage + 1);
  }, [activePage, goToPage]);

  if (!currentPage) return null;

  const lineLabel = currentPage.lineName
    ? formatLineBadgeLabel(currentPage.lineName)
    : null;

  const panelBody = (
    <View style={styles.content}>
      <Pressable
        onPress={onClose}
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={8}
      >
        <Ionicons name="close" size={closeIconSize} color={colors.textSecondary} />
      </Pressable>

      <View style={styles.mainColumn}>
        <Pressable
          style={styles.directionsButton}
          onPress={() => onNavigate?.(currentPage.stop)}
          disabled={!onNavigate}
          accessibilityRole="button"
          accessibilityLabel={t('map.getDirections')}
        >
          <Ionicons name="navigate-outline" size={directionsIconSize} color={colors.highContrastText} />
          <Text style={styles.directionsButtonText} numberOfLines={1}>
            {t('map.getDirections')}
          </Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <View style={styles.trackingHintSlot}>
            <Text
              style={[styles.liveActivityHint, !tracking && styles.hintHidden]}
              numberOfLines={2}
            >
              {tracking
                ? liveActivityEnabled
                  ? t('map.stopLiveActivityHint')
                  : t('map.stopTrackingHint')
                : ' '}
            </Text>
          </View>

          <View style={styles.titleRow}>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void toggleTracking();
              }}
              style={({ pressed }) => [
                styles.stopNameButton,
                pressed && styles.stopNameButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: tracking }}
              accessibilityLabel={
                tracking
                  ? t('map.cancelStopLiveActivity', { stop: currentPage.stop.name })
                  : t('map.startStopLiveActivity', { stop: currentPage.stop.name })
              }
            >
              <Text
                style={[textStyle, styles.stopName, tracking && styles.stopNameTracking]}
                numberOfLines={2}
              >
                {currentPage.stop.name}
              </Text>
              {tracking ? (
                <View style={styles.liveIndicator}>
                  <Ionicons name="notifications" size={14} color={colors.accent} />
                </View>
              ) : null}
            </Pressable>
            {lineLabel ? (
              <View style={styles.lineBadgeInTitle}>
                <LineBadge label={lineLabel} lineColor={currentPage.lineColor} size="station" />
              </View>
            ) : null}
          </View>

          <Text style={[textStyle, styles.direction]} numberOfLines={2}>
            {lineLabel
              ? currentPage.direction || t('schedules.nextDepartures')
              : t('schedules.nextDepartures')}
          </Text>

          {hasMultiplePages ? (
            <Text style={styles.swipeHintText}>{t('map.swipeLinesHint')}</Text>
          ) : null}
        </View>

        <View style={[styles.departuresStrip, hasMultiplePages && styles.departuresStripBleed]}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={hasMultiplePages}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handlePageScroll}
            style={styles.pager}
            keyboardShouldPersistTaps="handled"
          >
            {pages.map((page) => {
              const pageIsLoading = loading && page.departures.length === 0;

              return (
                <View key={page.id} style={[styles.page, { width: pagerWidth }]}>
                  <View style={styles.pageInner}>
                    {pageIsLoading ? (
                      <View style={styles.loadingBlock}>
                        <ActivityIndicator color={colors.accent} />
                      </View>
                    ) : page.departures.length === 0 ? (
                      <Text style={[textStyle, styles.empty]}>{t('schedules.noDepartures')}</Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[
                          styles.departuresRow,
                          hasMultiplePages && styles.departuresRowInset,
                        ]}
                      >
                        {page.departures.map((departure, index) => (
                          <DepartureChip
                            key={`${page.id}-${index}`}
                            departure={departure}
                            size="compact"
                          />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {hasMultiplePages ? (
            <>
              <Pressable
                onPress={goToPreviousPage}
                disabled={activePage === 0}
                style={[styles.swipeArrowOverlay, styles.swipeArrowLeft]}
                accessibilityRole="button"
                accessibilityLabel={t('map.previousLine')}
                hitSlop={8}
              >
                <Ionicons
                  name="chevron-back"
                  size={SWIPE_ARROW_SIZE}
                  color={colors.textPrimary}
                  style={{ opacity: activePage > 0 ? 1 : 0.3 }}
                />
              </Pressable>
              <Pressable
                onPress={goToNextPage}
                disabled={activePage >= pages.length - 1}
                style={[styles.swipeArrowOverlay, styles.swipeArrowRight]}
                accessibilityRole="button"
                accessibilityLabel={t('map.nextLine')}
                hitSlop={8}
              >
                <Ionicons
                  name="chevron-forward"
                  size={SWIPE_ARROW_SIZE}
                  color={colors.textPrimary}
                  style={{ opacity: activePage < pages.length - 1 ? 1 : 0.3 }}
                />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.wrapper, { top }]} pointerEvents="box-none">
      <View style={styles.panel}>
        <MapBlurBackdrop fadeDirection="towardBottom" bleed={{ bottom: -120 }} />
        <View style={[styles.contentShell, { paddingTop: contentTop }]} pointerEvents="box-none">
          {panelBody}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    elevation: 25,
    overflow: 'visible',
  },
  panel: {
    width: '100%',
    position: 'relative',
    overflow: 'visible',
    paddingBottom: spacing.md,
  },
  contentShell: {
    position: 'relative',
    zIndex: 1,
  },
  content: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    position: 'relative',
  },
  mainColumn: {
    alignItems: 'flex-start',
    width: '100%',
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.xs * 0.75 * 1.21,
    paddingHorizontal: spacing.sm * 0.75,
    borderRadius: radius.full,
    backgroundColor: colors.highContrastBg,
    flexShrink: 0,
    marginTop: 3,
  },
  directionsButtonText: {
    ...typography.labelSmall,
    color: colors.highContrastText,
    fontWeight: '700',
    fontSize: directionsButtonFontSize,
  },
  titleBlock: {
    marginTop: mentionGapAbove,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  trackingHintSlot: {
    minHeight: Math.round(15 * 1.1),
    marginBottom: -mentionTightenBelow,
    justifyContent: 'flex-start',
  },
  hintHidden: {
    opacity: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: 28,
    marginTop: -mentionTightenBelow,
  },
  stopNameButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    borderRadius: radius.sm,
    paddingVertical: 0,
    paddingRight: spacing.xs,
  },
  stopNameButtonPressed: {
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
  },
  stopName: {
    flex: 1,
    flexShrink: 1,
  },
  stopNameTracking: {
    color: colors.accent,
  },
  lineBadgeInTitle: {
    marginTop: lineBadgeOffsetDown,
  },
  liveIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(91, 141, 239, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  liveActivityHint: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    opacity: 0.85,
    fontSize: 12,
    lineHeight: 14,
  },
  direction: {
    color: colors.textPrimary,
    fontSize: directionFontSize,
    marginTop: spacing.xs,
  },
  swipeHintText: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    opacity: 0.85,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  departuresStrip: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    position: 'relative',
  },
  departuresStripBleed: {
    marginHorizontal: -spacing.lg,
  },
  swipeArrowOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  swipeArrowLeft: {
    left: 4,
  },
  swipeArrowRight: {
    right: 4,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.lg,
    zIndex: 2,
    padding: spacing.xs,
  },
  pager: {
    maxHeight: 80,
  },
  page: {
    flexShrink: 0,
  },
  pageInner: {
    alignItems: 'flex-start',
  },
  loadingBlock: {
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
  },
  empty: {
    color: colors.textSecondary,
    paddingBottom: spacing.sm,
  },
  departuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  departuresRowInset: {
    paddingHorizontal: DEPARTURES_EDGE_PADDING,
  },
});
