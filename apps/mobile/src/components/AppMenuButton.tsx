import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { spacing, typography } from '../theme';
import { useTheme, useThemeColors } from '../theme/ThemeContext';
import { MapControlButton } from './MapControlButton';
import { MAP_CHROME_BORDER, MAP_CHROME_TINT, mapChromeText } from './MapGlassSurface';

const TRIGGER_SIZE = 44;
const TRIGGER_RADIUS = TRIGGER_SIZE / 2;

interface AppMenuButtonProps {
  top: number;
  onRecenter?: () => void;
  onOpenLayers?: () => void;
  layersActive?: boolean;
}

type MenuRoute = '/(tabs)' | '/(tabs)/schedules' | '/(tabs)/alerts' | '/(tabs)/settings';

interface MenuItem {
  id: string;
  label: string;
  route?: MenuRoute;
  action?: () => void;
}

const STAGGER_MS = 55;
const ANIM_DURATION = 260;

export function AppMenuButton({
  top,
  onRecenter,
  onOpenLayers,
  layersActive,
}: AppMenuButtonProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const anims = useRef(
    Array.from({ length: 6 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(-16),
    }))
  ).current;

  const close = useCallback(() => setOpen(false), []);

  const navigate = useCallback(
    (route: MenuRoute) => {
      close();
      router.push(route);
    },
    [close, router]
  );

  const items: MenuItem[] = useMemo(
    () => [
      { id: 'map', label: t('tabs.map'), route: '/(tabs)' },
      ...(onRecenter
        ? [
            {
              id: 'location',
              label: t('map.myLocation'),
              action: () => {
                close();
                onRecenter();
              },
            },
          ]
        : []),
      { id: 'schedules', label: t('tabs.schedules'), route: '/(tabs)/schedules' },
      { id: 'alerts', label: t('tabs.alerts'), route: '/(tabs)/alerts' },
      { id: 'settings', label: t('tabs.settings'), route: '/(tabs)/settings' },
    ],
    [t, onRecenter, close]
  );

  useEffect(() => {
    const animations = items.flatMap((_, index) => {
      const { opacity, translateY } = anims[index];
      return Animated.parallel([
        Animated.timing(opacity, {
          toValue: open ? 1 : 0,
          duration: ANIM_DURATION,
          delay: open ? index * STAGGER_MS : (items.length - 1 - index) * STAGGER_MS,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: open ? 0 : -16,
          duration: ANIM_DURATION,
          delay: open ? index * STAGGER_MS : (items.length - 1 - index) * STAGGER_MS,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start();
  }, [open, items.length, anims]);

  const isActive = (item: MenuItem) => {
    if (!item.route) return false;
    if (item.route === '/(tabs)') {
      return pathname === '/' || pathname === '/index' || pathname.endsWith('/index');
    }
    return pathname.includes(item.route.replace('/(tabs)', ''));
  };

  return (
    <>
      <View style={[styles.headerRow, { top }]}>
        {onRecenter ? (
          <MapControlButton
            icon="navigate-outline"
            onPress={onRecenter}
            accessibilityLabel={t('map.myLocation')}
          />
        ) : null}
        {onOpenLayers ? (
          <MapControlButton
            icon="layers-outline"
            onPress={onOpenLayers}
            active={layersActive}
            accessibilityLabel="Calques"
          />
        ) : null}
        <View style={styles.trigger}>
          {Platform.OS === 'ios' ? (
            <View style={styles.triggerBlur}>
              <BlurView intensity={32} tint="dark" />
            </View>
          ) : null}
          <View style={styles.triggerTint} />
          <Pressable
            onPress={() => setOpen((v) => !v)}
            style={styles.triggerHit}
            accessibilityRole="button"
            accessibilityLabel={t('menu.open')}
            android_ripple={{
              color: 'rgba(255,255,255,0.12)',
              borderless: true,
              radius: TRIGGER_RADIUS,
            }}
          >
            <Ionicons name={open ? 'close' : 'menu'} size={22} color={mapChromeText.primary} />
          </Pressable>
        </View>
      </View>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.cancel')}>
          <View style={[styles.menuList, { top: top + 52 }]} pointerEvents="box-none">
            {items.map((item, index) => (
              <Animated.View
                key={item.id}
                style={{
                  opacity: anims[index].opacity,
                  transform: [{ translateY: anims[index].translateY }],
                }}
              >
                <Pressable
                  onPress={() => {
                    if (item.action) item.action();
                    else if (item.route) navigate(item.route);
                  }}
                  style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Text style={[styles.menuLabel, isActive(item) && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>, isDark: boolean) {
  return StyleSheet.create({
    headerRow: {
      position: 'absolute',
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      zIndex: 30,
      elevation: 30,
    },
    trigger: {
      width: TRIGGER_SIZE,
      height: TRIGGER_SIZE,
      borderRadius: TRIGGER_RADIUS,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: MAP_CHROME_BORDER,
    },
    triggerBlur: {
      ...StyleSheet.absoluteFill,
      borderRadius: TRIGGER_RADIUS,
      overflow: 'hidden',
    },
    triggerTint: {
      ...StyleSheet.absoluteFill,
      borderRadius: TRIGGER_RADIUS,
      backgroundColor: MAP_CHROME_TINT,
    },
    triggerHit: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    menuList: {
      position: 'absolute',
      right: spacing.lg,
      alignItems: 'flex-end',
      gap: 2,
    },
    menuItem: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    menuItemPressed: {
      opacity: 0.65,
    },
    menuLabel: {
      ...typography.titleMedium,
      color: isDark ? colors.textPrimary : '#000000',
      textAlign: 'right',
      fontWeight: '700',
      textShadowColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.85)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: isDark ? 0 : 4,
    },
    menuLabelActive: {
      color: colors.accent,
    },
  });
}
