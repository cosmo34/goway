import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppStore, type ThemePreference } from '../../src/stores/appStore';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import { SelectionChip } from '../../src/components/SelectionChip';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type SupportedLocale } from '../../src/i18n/locales';
import { spacing, typography } from '../../src/theme';
import { useTheme, useThemeColors } from '../../src/theme/ThemeContext';

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { locale, accessibility, setLocale, updateAccessibility } = useAppStore();

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setLocale(newLocale);
    i18n.changeLanguage(newLocale);
  };

  const themeLabel = (option: ThemePreference) => {
    if (option === 'light') return t('settings.themeLight');
    if (option === 'dark') return t('settings.themeDark');
    return t('settings.themeSystem');
  };

  return (
    <View style={styles.root}>
      <AppMenuButton top={insets.top + spacing.sm} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <Text style={[styles.title, { paddingRight: 56 }]} accessibilityRole="header">
          {t('settings.title')}
        </Text>

        <Text style={styles.sectionTitle}>{t('settings.theme')}</Text>
        <View style={styles.chipRow}>
          {THEME_OPTIONS.map((option) => (
            <SelectionChip
              key={option}
              label={themeLabel(option)}
              selected={preference === option}
              onPress={() => setPreference(option)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.chipRow}>
          {SUPPORTED_LOCALES.map((loc) => (
            <SelectionChip
              key={loc}
              label={LOCALE_LABELS[loc]}
              selected={locale === loc}
              onPress={() => handleLocaleChange(loc)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('accessibility.title')}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('accessibility.largeText')}</Text>
          <Switch
            value={accessibility.largeText}
            onValueChange={(v: boolean) => updateAccessibility({ largeText: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t('accessibility.largeText')}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('accessibility.highContrast')}</Text>
          <Switch
            value={accessibility.highContrast}
            onValueChange={(v: boolean) => updateAccessibility({ highContrast: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t('accessibility.highContrast')}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('accessibility.reduceMotion')}</Text>
          <Switch
            value={accessibility.reduceMotion}
            onValueChange={(v: boolean) => updateAccessibility({ reduceMotion: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t('accessibility.reduceMotion')}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('accessibility.announceDepartures')}</Text>
          <Switch
            value={accessibility.announceDepartures}
            onValueChange={(v: boolean) => updateAccessibility({ announceDepartures: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t('accessibility.announceDepartures')}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('accessibility.hapticFeedback')}</Text>
          <Switch
            value={accessibility.hapticFeedback}
            onValueChange={(v: boolean) => updateAccessibility({ hapticFeedback: v })}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t('accessibility.hapticFeedback')}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <Text style={styles.aboutText}>{t('settings.dataSource')}</Text>
        <Text style={styles.aboutText}>{t('settings.version')} 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    title: {
      ...typography.titleLarge,
      color: colors.textPrimary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    sectionTitle: {
      ...typography.labelMedium,
      color: colors.textTertiary,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
    },
    settingLabel: {
      ...typography.bodySmall,
      color: colors.textPrimary,
      flex: 1,
      marginRight: spacing.md,
    },
    aboutText: {
      ...typography.bodySmall,
      color: colors.textTertiary,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.xs,
    },
  });
}
