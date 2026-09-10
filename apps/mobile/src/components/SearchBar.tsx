import { useMemo } from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
} from './MapGlassSurface';
import { TransportModeFilters } from './TransportModeFilters';
import { spacing, typography } from '../theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ value, onChangeText, isLoading }: SearchBarProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), []);
  const showClearButton = value.length > 0;

  const handleClear = () => onChangeText('');

  return (
    <View style={styles.wrapper}>
      <TransportModeFilters />

      <View style={styles.searchPanelWrap}>
        <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.searchPanel]}>
          <MapGlassBackground variant="mapChrome" />
          <View style={styles.inputRow}>
            <Ionicons name="search" size={18} color={mapChromeText.tertiary} />
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              placeholder={t('search.placeholder')}
              placeholderTextColor={mapChromeText.tertiary}
              returnKeyType="search"
              accessibilityLabel={t('common.search')}
              autoCorrect={false}
              autoCapitalize="sentences"
            />
            {isLoading ? <ActivityIndicator color={mapChromeText.accent} size="small" /> : null}
            {showClearButton ? (
              <Pressable
                onPress={handleClear}
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
    },
    searchPanel: {},
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      zIndex: 1,
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
