import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { addDays, format, isSameDay, setHours, setMinutes, startOfDay } from 'date-fns';
import { fr as frLocale, enUS, es, de, it, zhCN, ar as arLocale } from 'date-fns/locale';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
  MAP_CHROME_BORDER,
} from './MapGlassSurface';
import { colors, radius, spacing, typography } from '../theme';
import i18n from '../i18n';

function dateFnsLocale() {
  switch (i18n.language?.slice(0, 2)) {
    case 'en':
      return enUS;
    case 'es':
      return es;
    case 'de':
      return de;
    case 'it':
      return it;
    case 'zh':
      return zhCN;
    case 'ar':
      return arLocale;
    default:
      return frLocale;
  }
}

interface DepartureTimeSheetProps {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  /** Marge bas pour ne pas chevaucher la barre de recherche. */
  bottomOffset?: number;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 15, 30, 45];

export function DepartureTimeSheet({
  visible,
  value,
  onClose,
  onConfirm,
  bottomOffset = 140,
}: DepartureTimeSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = dateFnsLocale();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const dayOptions = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [visible]);

  const applyPreset = (next: Date) => {
    onConfirm(next);
    onClose();
  };

  const presets: { id: string; label: string; date: Date }[] = [
    { id: 'now', label: t('chat.now'), date: new Date() },
    {
      id: '15',
      label: t('chat.inMinutes', { minutes: 15 }),
      date: new Date(Date.now() + 15 * 60_000),
    },
    {
      id: '30',
      label: t('chat.inMinutes', { minutes: 30 }),
      date: new Date(Date.now() + 30 * 60_000),
    },
    {
      id: '1h',
      label: t('chat.inHours', { hours: 1 }),
      date: new Date(Date.now() + 60 * 60_000),
    },
    {
      id: 'tomorrow',
      label: t('trip.tomorrowMorning'),
      date: setMinutes(setHours(addDays(startOfDay(new Date()), 1), 8), 0),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetWrap,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) + bottomOffset },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.sheet]}>
            <MapGlassBackground variant="mapChrome" />
            <View style={styles.header}>
              <Text style={styles.title}>{t('trip.departureWhen')}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={18} color={mapChromeText.secondary} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {presets.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => applyPreset(preset.date)}
                  style={styles.chip}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>{preset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {dayOptions.map((day) => {
                const active = isSameDay(day, draft);
                const label =
                  day.getTime() === startOfDay(new Date()).getTime()
                    ? t('trip.today')
                    : format(day, 'EEE d', { locale });
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() =>
                      setDraft((prev) =>
                        setMinutes(setHours(day, prev.getHours()), prev.getMinutes())
                      )
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.timeRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {HOUR_OPTIONS.map((hour) => {
                  const active = draft.getHours() === hour;
                  return (
                    <Pressable
                      key={`h-${hour}`}
                      onPress={() => setDraft((prev) => setHours(prev, hour))}
                      style={[styles.chip, styles.timeChip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {String(hour).padStart(2, '0')}h
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.timeRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {MINUTE_OPTIONS.map((minute) => {
                  const active = draft.getMinutes() === minute;
                  return (
                    <Pressable
                      key={`m-${minute}`}
                      onPress={() => setDraft((prev) => setMinutes(prev, minute))}
                      style={[styles.chip, styles.timeChip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        :{String(minute).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              style={styles.confirmBtn}
              onPress={() => {
                onConfirm(draft);
                onClose();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{t('common.confirm')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function formatDepartureLabel(
  date: Date,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const now = new Date();
  if (Math.abs(date.getTime() - now.getTime()) < 90_000) {
    return t('chat.now');
  }
  if (isSameDay(date, now)) {
    return format(date, 'HH:mm');
  }
  if (isSameDay(date, addDays(startOfDay(now), 1))) {
    return `${t('trip.tomorrow')} ${format(date, 'HH:mm')}`;
  }
  return format(date, 'EEE d MMM HH:mm', { locale: dateFnsLocale() });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    gap: spacing.xs + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  title: {
    ...typography.labelMedium,
    color: mapChromeText.primary,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    zIndex: 1,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
  },
  timeChip: {
    minWidth: 44,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    ...typography.labelMedium,
    color: mapChromeText.primary,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  timeRow: {
    zIndex: 1,
  },
  confirmBtn: {
    marginTop: 2,
    backgroundColor: 'rgba(45, 212, 191, 0.35)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: MAP_CHROME_BORDER,
    paddingVertical: spacing.xs + 4,
    alignItems: 'center',
    zIndex: 1,
  },
  confirmText: {
    ...typography.labelMedium,
    color: mapChromeText.primary,
    fontWeight: '700',
  },
});
