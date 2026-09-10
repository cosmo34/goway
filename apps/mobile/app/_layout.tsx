import '../src/i18n';
import { useEffect } from 'react';
import { View, I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import i18n from '../src/i18n';
import { ThemeProvider, useTheme } from '../src/theme';
import { useAppStore } from '../src/stores/appStore';
import { isRTL } from '../src/i18n/locales';
import { gtfsService } from '../src/services/gtfs/gtfsService';
import { useWidgetSync } from '../src/hooks/useWidgetSync';

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const contentStyle = {
    backgroundColor: colors.background,
  } as Record<string, unknown>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle,
          animation: 'fade',
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const locale = useAppStore((s) => s.locale);
  const hydrateFromStorage = useAppStore((s) => s.hydrateFromStorage);

  useEffect(() => {
    void hydrateFromStorage();
    gtfsService.init();
  }, [hydrateFromStorage]);

  useWidgetSync();

  useEffect(() => {
    i18n.changeLanguage(locale);
    const rtl = isRTL(locale);
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, [locale]);

  return (
    <GestureHandlerRootView>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <RootNavigator />
        </I18nextProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
