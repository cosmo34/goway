import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import type { Region } from 'react-native-maps';
import {
  MAP_CHROME_BORDER,
  mapChromeText,
  mapGlassSurfaceStyles,
} from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';
import type { TransitLine } from '../stores/transitStore';
import { listLinesApi } from '../services/api/transitApi';
import { isMapRegionInServiceArea, regionToBbox } from '../utils/mapRegion';

/** Même opacité que les bulles haut / bas. */
const LAYERS_PANEL_TINT = 'rgba(12, 16, 24, 0.50)';

interface MapLayersSheetProps {
  visible: boolean;
  top: number;
  mapRegion: Region;
  selectedLineId: string | null;
  showStops: boolean;
  showPois: boolean;
  onClose: () => void;
  onToggleStops: (value: boolean) => void;
  onTogglePois: (value: boolean) => void;
  onSelectLine: (line: TransitLine | null) => void;
}

function LayerChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.layerChip, active && styles.layerChipActive]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={13}
        color={active ? mapChromeText.accent : mapChromeText.secondary}
      />
      <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function MapLayersSheet({
  visible,
  top,
  mapRegion,
  selectedLineId,
  showStops,
  showPois,
  onClose,
  onToggleStops,
  onTogglePois,
  onSelectLine,
}: MapLayersSheetProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<TransitLine[]>([]);
  const [loading, setLoading] = useState(false);
  const inServiceArea = isMapRegionInServiceArea(mapRegion);

  const loadLines = useCallback(async () => {
    if (!inServiceArea) {
      setLines([]);
      return;
    }
    setLoading(true);
    try {
      const bbox = regionToBbox(mapRegion);
      const data = await listLinesApi(bbox);
      setLines(data);
    } catch {
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [mapRegion, inServiceArea]);

  useEffect(() => {
    if (!visible) return;
    loadLines();
  }, [visible, loadLines]);

  const toggleStops = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleStops(!showStops);
  };

  const togglePois = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTogglePois(!showPois);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.anchor, { paddingTop: top }]} pointerEvents="box-none">
          <Pressable style={styles.wrapper} onPress={(e) => e.stopPropagation()}>
            <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.sheet]}>
              <View style={styles.glassClip} pointerEvents="none">
                {Platform.OS === 'ios' ? (
                  <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
                ) : null}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: LAYERS_PANEL_TINT }]} />
              </View>

              <View style={styles.header}>
                <View style={styles.headerMain}>
                  <Ionicons name="layers-outline" size={14} color={mapChromeText.accent} />
                  <Text style={styles.title}>{t('map.layersTitle')}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={18} color={mapChromeText.secondary} />
                </Pressable>
              </View>

              <View style={styles.toggleRow}>
                <LayerChip
                  label={t('map.layersStops')}
                  icon="bus-outline"
                  active={showStops}
                  onPress={toggleStops}
                />
                <LayerChip
                  label={t('map.layersPois')}
                  icon="star-outline"
                  active={showPois}
                  onPress={togglePois}
                />
              </View>

              <View style={styles.linesSection}>
                <Text style={styles.linesLabel}>{t('map.layersLines')}</Text>
                {!inServiceArea ? (
                  <Text style={styles.empty}>{t('map.layersOutOfArea')}</Text>
                ) : loading ? (
                  <ActivityIndicator color={mapChromeText.accent} size="small" style={styles.loader} />
                ) : lines.length === 0 ? (
                  <Text style={styles.empty}>{t('map.layersNoLines')}</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.linesRow}
                  >
                    {selectedLineId ? (
                      <Pressable
                        style={[styles.lineBadge, styles.lineBadgeClear]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onSelectLine(null);
                        }}
                        accessibilityLabel={t('map.layersClearLine')}
                      >
                        <Ionicons name="close" size={12} color={mapChromeText.secondary} />
                      </Pressable>
                    ) : null}
                    {lines.map((line) => {
                      const active = selectedLineId === line.id;
                      return (
                        <Pressable
                          key={line.id}
                          style={[
                            styles.lineBadge,
                            {
                              backgroundColor: active
                                ? line.color
                                : `${line.color}22`,
                              borderColor: line.color,
                            },
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            onSelectLine(active ? null : line);
                          }}
                          accessibilityLabel={`${t('common.line')} ${line.shortName}`}
                          accessibilityState={{ selected: active }}
                        >
                          <View
                            style={[styles.lineDot, { backgroundColor: active ? '#fff' : line.color }]}
                          />
                          <Text
                            style={[
                              styles.lineBadgeText,
                              { color: active ? colors.textInverse : line.color },
                            ]}
                          >
                            {line.shortName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  anchor: {
    paddingHorizontal: spacing.lg,
  },
  wrapper: {
    width: '100%',
  },
  sheet: {
    borderRadius: 22,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    backgroundColor: LAYERS_PANEL_TINT,
  },
  glassClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
    zIndex: 1,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...typography.labelMedium,
    color: mapChromeText.primary,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    zIndex: 1,
  },
  layerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  layerChipActive: {
    borderColor: mapChromeText.accent,
    backgroundColor: mapChromeText.accentMuted,
  },
  layerChipText: {
    ...typography.labelSmall,
    color: mapChromeText.secondary,
    fontWeight: '600',
  },
  layerChipTextActive: {
    color: mapChromeText.primary,
  },
  linesSection: {
    gap: 4,
    paddingHorizontal: spacing.xs,
    zIndex: 1,
  },
  linesLabel: {
    ...typography.labelSmall,
    color: mapChromeText.tertiary,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  linesRow: {
    gap: 6,
    paddingVertical: 2,
    paddingRight: spacing.xs,
  },
  lineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 28,
  },
  lineBadgeClear: {
    borderColor: MAP_CHROME_BORDER,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
  },
  lineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  lineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    ...typography.labelSmall,
    color: mapChromeText.secondary,
    paddingVertical: 4,
  },
  loader: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
});
