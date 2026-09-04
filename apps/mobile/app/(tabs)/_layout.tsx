import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

const hiddenTabBarStyle = {
  height: 0,
  opacity: 0,
  overflow: 'hidden' as const,
  position: 'absolute' as const,
  bottom: -100,
};

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: hiddenTabBarStyle,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.map'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: t('tabs.schedules'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('tabs.alerts'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          href: null,
        }}
      />
    </Tabs>
  );
}
