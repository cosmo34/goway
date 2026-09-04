import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../src/stores/appStore';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type SupportedLocale } from '../../src/i18n/locales';
import { colors, spacing, typography, radius } from '../../src/theme';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { locale, accessibility, setLocale, updateAccessibility } = useAppStore();

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setLocale(newLocale);
    i18n.changeLanguage(newLocale);
  };

  return (
    <View style={styles.root}>
      <AppMenuButton top={insets.top + spacing.sm} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }}
      >
      <Text style={[styles.title, { paddingRight: 56 }]} accessibilityRole="header">
        {t('settings.title')}
      </Text>

      {/* Langue */}
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.languageGrid}>
        {SUPPORTED_LOCALES.map((loc) => (
          <Pressable
            key={loc}
            onPress={() => handleLocaleChange(loc)}
            style={[styles.langChip, locale === loc && styles.langActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: locale === loc }}
          >
            <Text style={[styles.langText, locale === loc && styles.langTextActive]}>
              {LOCALE_LABELS[loc]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Accessibilité */}
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

      {/* À propos */}
      <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
      <Text style={styles.aboutText}>{t('settings.dataSource')}</Text>
      <Text style={styles.aboutText}>{t('settings.version')} 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    ...typography.titleSmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  langChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  langText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
  },
  langTextActive: {
    color: colors.accent,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLabel: {
    ...typography.bodyMedium,
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
