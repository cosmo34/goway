import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import {
  MapGlassBackground,
  mapGlassSurfaceStyles,
  mapChromeText,
} from './MapGlassSurface';
import { TransportModeFilters } from './TransportModeFilters';
import { colors, spacing, typography, radius } from '../theme';
import type { ChatMessage, ChatSessionState } from '../services/chat/chatTypes';

interface ChatModePanelProps {
  state: ChatSessionState;
  onSend: (text: string) => void;
  onQuickReply: (id: string) => void;
  onCloseItinerary?: () => void;
  showCloseItinerary?: boolean;
  bottomInset: number;
}

export function ChatModePanel({
  state,
  onSend,
  onQuickReply,
  onCloseItinerary,
  showCloseItinerary = false,
}: ChatModePanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [state.messages.length, state.busy]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || state.busy) return;
    setDraft('');
    Keyboard.dismiss();
    onSend(text);
  }, [draft, state.busy, onSend]);

  const lastAssistant = useMemo(
    () => [...state.messages].reverse().find((m) => m.role === 'assistant'),
    [state.messages]
  );

  const choosingPlace = (state.pendingSuggestions?.length ?? 0) > 0;
  const headerLabel = state.destinationLabel ?? t('chat.title');

  return (
    <View style={styles.stack}>
      {/* Fenêtre Q/R — même feuille que les propositions d’itinéraire */}
      <View style={styles.conversationWrap}>
        <View style={[mapGlassSurfaceStyles.panel, styles.sheet]}>
          <MapGlassBackground variant="dark" />

          <View style={styles.header}>
            <View style={styles.headerMain}>
              <Ionicons name="sparkles" size={14} color={colors.accent} />
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerLabel}
              </Text>
              {state.busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            {showCloseItinerary && onCloseItinerary ? (
              <Pressable
                onPress={onCloseItinerary}
                hitSlop={10}
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {state.messages
              .filter(
                (message) =>
                  !/^(Par exemple|For example)\b/i.test(message.text.trim())
              )
              .map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
          </ScrollView>

          {lastAssistant?.quickReplies && lastAssistant.quickReplies.length > 0 ? (
            <View style={styles.quickRow}>
              {lastAssistant.quickReplies.map((reply) => (
                <Pressable
                  key={reply.id}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onQuickReply(reply.id);
                  }}
                  style={styles.quickChip}
                  accessibilityRole="button"
                  accessibilityLabel={reply.label}
                >
                  <MapGlassBackground variant="dark" />
                  <Text style={styles.quickChipText}>{reply.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* Modes + champ : même gabarit / espacement que SearchBar mode carte */}
      <View style={styles.searchBlock}>
        <TransportModeFilters />
        <View style={styles.searchWrap}>
          <View style={[mapGlassSurfaceStyles.mapChromePanel, styles.searchPanel]}>
            <MapGlassBackground variant="mapChrome" />
            <View style={styles.searchRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={mapChromeText.tertiary} />
              <TextInput
                style={styles.searchInput}
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  choosingPlace ? t('chat.placeholderNumber') : t('chat.placeholder')
                }
                placeholderTextColor={mapChromeText.tertiary}
                editable={!state.busy}
                returnKeyType="send"
                onSubmitEditing={submit}
                keyboardType={choosingPlace ? 'number-pad' : 'default'}
                accessibilityLabel={t('chat.placeholder')}
                autoCorrect={false}
                autoCapitalize="sentences"
              />
              {state.busy ? (
                <ActivityIndicator color={mapChromeText.accent} size="small" />
              ) : null}
              {draft.length > 0 ? (
                <Pressable
                  onPress={() => setDraft('')}
                  style={styles.clearButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.clear')}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={mapChromeText.secondary} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={submit}
                disabled={!draft.trim() || state.busy}
                style={[styles.sendButton, (!draft.trim() || state.busy) && styles.sendDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
              >
                <Ionicons name="arrow-up" size={14} color={mapChromeText.primary} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      <Text style={[styles.messageText, isUser && styles.messageTextUser]}>{message.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
    zIndex: 40,
  },
  conversationWrap: {
    marginHorizontal: spacing.md,
    zIndex: 1,
  },
  searchBlock: {
    width: '100%',
    gap: spacing.xs,
    zIndex: 50,
  },
  searchWrap: {
    marginHorizontal: spacing.lg,
    zIndex: 40,
    elevation: 40,
  },
  sheet: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    maxHeight: 360,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
    zIndex: 1,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  messages: {
    maxHeight: 200,
    zIndex: 1,
  },
  messagesContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  messageRow: {
    maxWidth: '96%',
  },
  messageRowAssistant: {
    alignSelf: 'flex-start',
  },
  messageRowUser: {
    alignSelf: 'flex-end',
  },
  messageText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  messageTextUser: {
    color: colors.accent,
    textAlign: 'right',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    zIndex: 1,
  },
  quickChip: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  quickChipText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    zIndex: 1,
  },
  searchPanel: {},
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    zIndex: 1,
  },
  searchInput: {
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
  sendButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.35)',
    flexShrink: 0,
  },
  sendDisabled: {
    opacity: 0.35,
  },
});
