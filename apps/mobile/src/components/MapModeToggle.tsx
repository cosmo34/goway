import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
} from './MapGlassSurface';
import { spacing, typography, radius } from '../theme';

export type MapInteractionMode = 'map' | 'chat';

interface MapModeToggleProps {
  mode: MapInteractionMode;
  onChange: (mode: MapInteractionMode) => void;
  top: number;
  left: number;
}

export function MapModeToggle({ mode, onChange, top, left }: MapModeToggleProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={[styles.wrap, { top, left }]} accessibilityRole="tablist">
      <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.panel]}>
        <MapGlassBackground variant="mapChrome" />
        <Pressable
          onPress={() => onChange('map')}
          style={[styles.segment, mode === 'map' && styles.segmentActive]}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'map' }}
          accessibilityLabel={t('chat.modeMap')}
        >
          <Text style={[styles.label, mode === 'map' && styles.labelActive]}>
            {t('chat.modeMap')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('chat')}
          style={[styles.segment, mode === 'chat' && styles.segmentActive]}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'chat' }}
          accessibilityLabel={t('chat.modeChat')}
        >
          <Text style={[styles.label, mode === 'chat' && styles.labelActive]}>
            {t('chat.modeChat')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      zIndex: 28,
      elevation: 28,
    },
    panel: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    segment: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      borderRadius: radius.full,
      zIndex: 1,
    },
    segmentActive: {
      backgroundColor: mapChromeText.accentMuted,
    },
    label: {
      ...typography.labelMedium,
      color: mapChromeText.tertiary,
      fontWeight: '600',
    },
    labelActive: {
      color: mapChromeText.accent,
    },
  });
}
