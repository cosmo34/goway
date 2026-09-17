import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, format, isSameDay, setHours, setMinutes, startOfDay } from 'date-fns';
import { fr as frLocale, enUS, es, de, it, zhCN, ar as arLocale } from 'date-fns/locale';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
} from './MapGlassSurface';
import { colors, spacing, typography } from '../theme';
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

interface CompactTimeSelectorProps {
  open: boolean;
  value: Date;
  anchorWidth?: number;
  onChange: (date: Date) => void;
  onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

/**
 * Sélecteur vertical (largeur ≈ bouton), bascule jour ↔ heure.
 */
export function CompactTimeSelector({
  open,
  value,
  anchorWidth = 96,
  onChange,
  onClose,
}: CompactTimeSelectorProps) {
  const { t } = useTranslation();
  const locale = dateFnsLocale();
  const [mode, setMode] = useState<'day' | 'time'>('time');
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setMode('time');
    }
  }, [open, value]);

  const days = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [open]);

  if (!open) return null;

  const commit = (next: Date) => {
    setDraft(next);
    onChange(next);
  };

  return (
    <View style={[styles.wrap, { width: Math.max(anchorWidth, 88) }]}>
      <View style={[mapGlassSurfaceStyles.mapChromePopup, styles.panel]}>
        <MapGlassBackground variant="mapChromeSoft" />
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'day'
            ? days.map((day) => {
                const active = isSameDay(day, draft);
                const label =
                  day.getTime() === startOfDay(new Date()).getTime()
                    ? t('trip.today')
                    : format(day, 'EEE d', { locale });
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() =>
                      commit(
                        setMinutes(setHours(day, draft.getHours()), draft.getMinutes())
                      )
                    }
                    style={[styles.row, active && styles.rowActive]}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })
            : HOURS.flatMap((hour) =>
                MINUTES.map((minute) => {
                  const active = draft.getHours() === hour && draft.getMinutes() === minute;
                  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                  return (
                    <Pressable
                      key={`${hour}-${minute}`}
                      onPress={() => commit(setMinutes(setHours(draft, hour), minute))}
                      style={[styles.row, active && styles.rowActive]}
                    >
                      <Text style={[styles.rowText, active && styles.rowTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })
              )}
          {mode === 'time' ? (
            <Pressable
              onPress={() => {
                commit(new Date());
                onClose();
              }}
              style={styles.row}
            >
              <Text style={styles.rowText}>{t('chat.now')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Pressable
          onPress={() => setMode((m) => (m === 'day' ? 'time' : 'day'))}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={mode === 'day' ? t('trip.pickTime') : t('trip.pickDay')}
        >
          <Text style={styles.toggleText}>
            {mode === 'day' ? t('trip.pickTime') : t('trip.pickDay')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: 16,
    zIndex: 80,
    elevation: 80,
  },
  panel: {
    maxHeight: 220,
  },
  list: {
    maxHeight: 176,
    zIndex: 1,
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  rowActive: {
    backgroundColor: 'rgba(45, 212, 191, 0.22)',
  },
  rowText: {
    ...typography.labelMedium,
    color: mapChromeText.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  rowTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  toggle: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
    paddingVertical: 8,
    alignItems: 'center',
    zIndex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  toggleText: {
    ...typography.labelSmall,
    color: mapChromeText.accent,
    fontWeight: '700',
  },
});
