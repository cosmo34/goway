import {
  View,
  TextInput,
  StyleSheet,
  Text,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MapBlurBackdrop } from './MapBlurBackdrop';
import { MapGlassBackground, mapGlassSurfaceStyles } from './MapGlassSurface';
import { TransportModeFilters } from './TransportModeFilters';
import { colors, spacing, typography } from '../theme';
import type { PlaceCategory, SearchSuggestion } from '../stores/transitStore';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  isLoading?: boolean;
  suggestions?: SearchSuggestion[];
  onSelectSuggestion?: (suggestion: SearchSuggestion) => void;
}

function suggestionIcon(
  category?: PlaceCategory,
  source?: SearchSuggestion['source']
): keyof typeof Ionicons.glyphMap {
  if (category === 'stop' || source === 'stop') return 'bus-outline';
  if (category === 'monument') return 'flag-outline';
  if (category === 'quarter') return 'grid-outline';
  if (category === 'street') return 'trail-sign-outline';
  if (category === 'address') return 'home-outline';
  return 'location-outline';
}

function SearchFieldBackground() {
  return <MapGlassBackground />;
}

export function SearchBar({
  value,
  onChangeText,
  isLoading,
  suggestions = [],
  onSelectSuggestion,
}: SearchBarProps) {
  const { t } = useTranslation();
  const showSuggestions = suggestions.length > 0;
  const showClearButton = value.length > 0;

  const handleClear = () => onChangeText('');

  return (
    <View style={styles.wrapper}>
      {showSuggestions ? (
        <View style={styles.suggestionsList}>
          <MapBlurBackdrop fadeDirection="towardTop" bleed={{ top: -100 }} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.suggestionsScroll}
          >
            {suggestions.map((item, index) => (
              <Pressable
                key={`${item.name}-${item.coordinates.latitude}-${index}`}
                onPress={() => onSelectSuggestion?.(item)}
                style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionPressed]}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <Ionicons
                  name={suggestionIcon(item.category, item.source)}
                  size={17}
                  color={colors.textPrimary}
                />
                <Text style={styles.suggestionName} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <TransportModeFilters />

      <View style={styles.searchPanelWrap}>
        <View style={[mapGlassSurfaceStyles.panel, styles.searchPanel]}>
          <SearchFieldBackground />
          <View style={styles.inputRow}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              accessibilityLabel={t('common.search')}
              autoCorrect={false}
              autoCapitalize="sentences"
            />
            {isLoading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
            {showClearButton ? (
              <Pressable
                onPress={handleClear}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: spacing.xs,
  },
  searchPanelWrap: {
    marginHorizontal: spacing.lg,
  },
  searchPanel: {},
  suggestionsList: {
    width: '100%',
    maxHeight: 220,
    overflow: 'visible',
    position: 'relative',
  },
  suggestionsScroll: {
    flexGrow: 0,
    zIndex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    ...typography.bodyMedium,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: spacing.xs,
    flexShrink: 0,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    zIndex: 1,
  },
  suggestionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  suggestionName: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});
