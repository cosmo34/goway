import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TRANSPORT_MODES, type TransportMode } from '../config/tam';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../theme/ThemeContext';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
  MAP_CHROME_BORDER,
} from './MapGlassSurface';
import { spacing, typography, radius } from '../theme';

interface TransportModeFiltersProps {
  /** Ferme le menu quand un autre sélecteur s’ouvre. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Pastille compacte + sélecteur vertical des modes de transport.
 */
export function TransportModeFilters({
  open: openProp,
  onOpenChange,
}: TransportModeFiltersProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const enabledTransportModes = useAppStore((s) => s.enabledTransportModes);
  const toggleTransportMode = useAppStore((s) => s.toggleTransportMode);
  const hapticFeedback = useAppStore((s) => s.accessibility.hapticFeedback);
  const count = enabledTransportModes.length;
  const styles = useMemo(() => createStyles(colors.accent), [colors.accent]);

  const toggle = (mode: TransportMode) => {
    if (hapticFeedback) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleTransportMode(mode);
  };

  return (
    <View style={styles.anchor}>
      {open ? (
        <View style={styles.dropdownWrap}>
          <View style={[mapGlassSurfaceStyles.mapChromePopup, styles.dropdown]}>
            <MapGlassBackground variant="mapChromeSoft" />
            {TRANSPORT_MODES.map((mode) => {
              const selected = enabledTransportModes.includes(mode);
              const label = t(`transportModes.${mode}`);
              return (
                <Pressable
                  key={mode}
                  onPress={() => toggle(mode)}
                  style={styles.option}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={label}
                >
                  <View style={[styles.dot, selected && styles.dotSelected]}>
                    {selected ? <View style={styles.dotCore} /> : null}
                  </View>
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen(!open)}
        style={[styles.pill, open && styles.pillOpen]}
        accessibilityRole="button"
        accessibilityLabel={t('transportModes.filtersLabel', { count })}
      >
        <Ionicons name="bus-outline" size={14} color={mapChromeText.primary} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function createStyles(accent: string) {
  return StyleSheet.create({
    anchor: {
      position: 'relative',
      zIndex: 60,
      elevation: 60,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    dropdownWrap: {
      position: 'absolute',
      left: 0,
      bottom: '100%',
      marginBottom: 16,
      zIndex: 70,
      elevation: 70,
      minWidth: 140,
    },
    dropdown: {
      paddingVertical: 6,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      zIndex: 1,
    },
    optionText: {
      ...typography.labelMedium,
      color: mapChromeText.primary,
      fontWeight: '600',
      flexShrink: 1,
    },
    optionTextSelected: {
      color: accent,
      fontWeight: '800',
    },
    dot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotSelected: {
      borderColor: accent,
    },
    dotCore: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: accent,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 28,
      paddingLeft: 8,
      paddingRight: 4,
      borderRadius: radius.lg,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: MAP_CHROME_BORDER,
    },
    pillOpen: {
      borderColor: accent,
    },
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent,
    },
    badgeText: {
      ...typography.labelSmall,
      color: '#0F172A',
      fontWeight: '800',
      fontSize: 11,
    },
  });
}
