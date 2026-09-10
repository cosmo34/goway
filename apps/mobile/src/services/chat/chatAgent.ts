import { searchPlacesApi } from '../api/transitApi';
import { mergeSearchSuggestions, searchPlacesLocally } from '../../utils/localPlaceSearch';
import type { Coordinates, SearchSuggestion, Stop } from '../../stores/transitStore';
import {
  createMessageId,
  isCurrentLocationPhrase,
  parseDepartureWhen,
  type ChatMessage,
  type ChatPhase,
  type ChatQuickReply,
  type ChatSessionState,
  type ChatTripRequest,
} from './chatTypes';

function assistant(
  text: string,
  extras?: Partial<Pick<ChatMessage, 'quickReplies' | 'placeSuggestions' | 'kind'>>
): ChatMessage {
  return {
    id: createMessageId(),
    role: 'assistant',
    text,
    ...extras,
  };
}

function user(text: string): ChatMessage {
  return { id: createMessageId(), role: 'user', text };
}

const WHEN_REPLIES: ChatQuickReply[] = [
  { id: 'when-now', label: 'Maintenant' },
  { id: 'when-15', label: 'Dans 15 min' },
  { id: 'when-30', label: 'Dans 30 min' },
  { id: 'when-1h', label: 'Dans 1 h' },
];

const ORIGIN_REPLIES: ChatQuickReply[] = [
  { id: 'origin-here', label: 'Ma position' },
];

export function createInitialChatState(t: (key: string) => string): ChatSessionState {
  return {
    phase: 'awaiting_destination',
    busy: false,
    messages: [assistant(t('chat.greeting'))],
  };
}

/** Même résolution multi-résultats que la barre de recherche carte (pas de choix auto du plus proche). */
async function resolvePlaces(
  query: string,
  userLocation: Coordinates | null,
  mapStops: Stop[]
): Promise<SearchSuggestion[]> {
  const local = searchPlacesLocally(query, mapStops);

  try {
    const apiPlaces = await searchPlacesApi(query, {
      scope: 'local',
      userLat: userLocation?.latitude,
      userLon: userLocation?.longitude,
      limit: 8,
    });
    return mergeSearchSuggestions(local, apiPlaces).slice(0, 8);
  } catch {
    return local.slice(0, 8);
  }
}

export interface ChatTurnResult {
  state: ChatSessionState;
  tripRequest?: ChatTripRequest;
}

export async function handleChatUserText(
  state: ChatSessionState,
  text: string,
  ctx: {
    userLocation: Coordinates | null;
    mapStops: Stop[];
    t: (key: string, opts?: Record<string, string | number>) => string;
    resolveUserLocation: () => Promise<Coordinates | null>;
  }
): Promise<ChatTurnResult> {
  const trimmed = text.trim();
  if (!trimmed || state.busy) return { state };

  const withUser: ChatSessionState = {
    ...state,
    messages: [...state.messages, user(trimmed)],
    busy: true,
  };

  try {
    switch (state.phase) {
      case 'greeting':
      case 'awaiting_destination':
      case 'done':
        return await handleDestination(withUser, trimmed, ctx);

      case 'awaiting_destination_choice':
        return await handleDestinationChoice(withUser, trimmed, ctx);

      case 'awaiting_origin':
        return await handleOrigin(withUser, trimmed, ctx);

      case 'awaiting_when':
        return await handleWhen(withUser, trimmed, ctx);

      case 'planning':
      case 'navigating':
        return {
          state: {
            ...withUser,
            busy: false,
            messages: [
              ...withUser.messages,
              assistant(ctx.t('chat.busyNavigating')),
            ],
          },
        };

      default:
        return { state: { ...withUser, busy: false } };
    }
  } catch {
    return {
      state: {
        ...withUser,
        busy: false,
        phase: 'awaiting_destination',
        messages: [...withUser.messages, assistant(ctx.t('chat.errorGeneric'))],
      },
    };
  }
}

export async function handleChatQuickReply(
  state: ChatSessionState,
  replyId: string,
  ctx: {
    userLocation: Coordinates | null;
    mapStops: Stop[];
    t: (key: string, opts?: Record<string, string | number>) => string;
    resolveUserLocation: () => Promise<Coordinates | null>;
  }
): Promise<ChatTurnResult> {
  if (replyId === 'origin-here') {
    return handleChatUserText(state, ctx.t('chat.myLocation'), ctx);
  }

  if (replyId === 'when-now') {
    return handleChatUserText(state, ctx.t('chat.now'), ctx);
  }
  if (replyId === 'when-15') {
    return handleChatUserText(state, ctx.t('chat.inMinutes', { minutes: 15 }), ctx);
  }
  if (replyId === 'when-30') {
    return handleChatUserText(state, ctx.t('chat.inMinutes', { minutes: 30 }), ctx);
  }
  if (replyId === 'when-1h') {
    return handleChatUserText(state, ctx.t('chat.inHours', { hours: 1 }), ctx);
  }

  if (replyId === 'restart') {
    return { state: createInitialChatState(ctx.t) };
  }

  return { state };
}

export function handleChatPlaceSelect(
  state: ChatSessionState,
  place: SearchSuggestion,
  ctx: {
    t: (key: string, opts?: Record<string, string | number>) => string;
  },
  options: { appendUserMessage?: boolean } = { appendUserMessage: true }
): ChatTurnResult {
  const label = place.displayName || place.name;
  const baseMessages =
    options.appendUserMessage === false
      ? state.messages
      : [...state.messages, user(label)];

  if (state.phase === 'awaiting_destination_choice' || state.phase === 'awaiting_destination') {
    const next: ChatSessionState = {
      ...state,
      destination: place.coordinates,
      destinationLabel: label,
      pendingSuggestions: undefined,
      phase: 'awaiting_origin',
      busy: false,
      messages: [
        ...baseMessages,
        assistant(ctx.t('chat.askOrigin', { destination: label }), {
          quickReplies: ORIGIN_REPLIES,
        }),
      ],
    };
    return { state: next };
  }

  if (state.phase === 'awaiting_origin') {
    const next: ChatSessionState = {
      ...state,
      origin: place.coordinates,
      originLabel: label,
      pendingSuggestions: undefined,
      phase: 'awaiting_when',
      busy: false,
      messages: [
        ...baseMessages,
        assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
      ],
    };
    return { state: next };
  }

  return { state };
}

async function handleDestination(
  state: ChatSessionState,
  text: string,
  ctx: {
    userLocation: Coordinates | null;
    mapStops: Stop[];
    t: (key: string, opts?: Record<string, string | number>) => string;
  }
): Promise<ChatTurnResult> {
  const places = await resolvePlaces(text, ctx.userLocation, ctx.mapStops);

  if (places.length === 0) {
    return {
      state: {
        ...state,
        busy: false,
        phase: 'awaiting_destination',
        messages: [...state.messages, assistant(ctx.t('chat.destinationNotFound'))],
      },
    };
  }

  if (places.length === 1) {
    const place = places[0];
    return {
      state: {
        ...state,
        busy: false,
        destination: place.coordinates,
        destinationLabel: place.displayName || place.name,
        phase: 'awaiting_origin',
        messages: [
          ...state.messages,
          assistant(
            ctx.t('chat.destinationConfirmed', {
              destination: place.displayName || place.name,
            })
          ),
          assistant(ctx.t('chat.askOrigin', { destination: place.displayName || place.name }), {
            quickReplies: ORIGIN_REPLIES,
          }),
        ],
      },
    };
  }

  return {
    state: {
      ...state,
      busy: false,
      phase: 'awaiting_destination_choice',
      pendingSuggestions: places,
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.chooseDestination'), {
          placeSuggestions: places,
        }),
      ],
    },
  };
}

async function handleDestinationChoice(
  state: ChatSessionState,
  text: string,
  ctx: {
    userLocation: Coordinates | null;
    mapStops: Stop[];
    t: (key: string, opts?: Record<string, string | number>) => string;
  }
): Promise<ChatTurnResult> {
  const pending = state.pendingSuggestions ?? [];
  const normalized = text.trim().toLowerCase();

  const numberMatch =
    normalized.match(/^(?:n(?:um(?:ero|éro)?)?\.?\s*)?(\d{1,2})$/i) ||
    normalized.match(/^(\d{1,2})\s*[.)]?$/);
  if (numberMatch) {
    const index = parseInt(numberMatch[1], 10) - 1;
    if (index >= 0 && index < pending.length) {
      return handleChatPlaceSelect({ ...state, busy: false }, pending[index], ctx, {
        appendUserMessage: false,
      });
    }
  }

  const match = pending.find(
    (p) =>
      p.name.toLowerCase() === normalized ||
      (p.displayName ?? '').toLowerCase() === normalized ||
      p.name.toLowerCase().includes(normalized)
  );
  if (match) {
    return handleChatPlaceSelect({ ...state, busy: false }, match, ctx, {
      appendUserMessage: false,
    });
  }
  return handleDestination({ ...state, phase: 'awaiting_destination' }, text, ctx);
}

async function handleOrigin(
  state: ChatSessionState,
  text: string,
  ctx: {
    userLocation: Coordinates | null;
    mapStops: Stop[];
    t: (key: string, opts?: Record<string, string | number>) => string;
    resolveUserLocation: () => Promise<Coordinates | null>;
  }
): Promise<ChatTurnResult> {
  const pending = state.pendingSuggestions ?? [];
  if (pending.length > 0) {
    const normalized = text.trim().toLowerCase();
    const numberMatch =
      normalized.match(/^(?:n(?:um(?:ero|éro)?)?\.?\s*)?(\d{1,2})$/i) ||
      normalized.match(/^(\d{1,2})\s*[.)]?$/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10) - 1;
      if (index >= 0 && index < pending.length) {
        return handleChatPlaceSelect({ ...state, busy: false }, pending[index], ctx, {
          appendUserMessage: false,
        });
      }
    }
    const match = pending.find(
      (p) =>
        p.name.toLowerCase() === normalized ||
        (p.displayName ?? '').toLowerCase() === normalized ||
        p.name.toLowerCase().includes(normalized)
    );
    if (match) {
      return handleChatPlaceSelect({ ...state, busy: false }, match, ctx, {
        appendUserMessage: false,
      });
    }
  }

  if (isCurrentLocationPhrase(text) || text === ctx.t('chat.myLocation')) {
    const origin = ctx.userLocation ?? (await ctx.resolveUserLocation());
    if (!origin) {
      return {
        state: {
          ...state,
          busy: false,
          messages: [...state.messages, assistant(ctx.t('chat.locationNeeded'))],
        },
      };
    }
    return {
      state: {
        ...state,
        busy: false,
        origin,
        originLabel: ctx.t('chat.myLocation'),
        phase: 'awaiting_when',
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.originConfirmedHere')),
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }

  const places = await resolvePlaces(text, ctx.userLocation, ctx.mapStops);
  if (places.length === 0) {
    return {
      state: {
        ...state,
        busy: false,
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.originNotFound'), { quickReplies: ORIGIN_REPLIES }),
        ],
      },
    };
  }

  if (places.length === 1) {
    const place = places[0];
    return {
      state: {
        ...state,
        busy: false,
        origin: place.coordinates,
        originLabel: place.displayName || place.name,
        phase: 'awaiting_when',
        messages: [
          ...state.messages,
          assistant(
            ctx.t('chat.originConfirmed', { origin: place.displayName || place.name })
          ),
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }

  return {
    state: {
      ...state,
      busy: false,
      pendingSuggestions: places,
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.chooseOrigin'), { placeSuggestions: places }),
      ],
    },
  };
}

async function handleWhen(
  state: ChatSessionState,
  text: string,
  ctx: {
    t: (key: string, opts?: Record<string, string | number>) => string;
  }
): Promise<ChatTurnResult> {
  let departure = parseDepartureWhen(text);

  if (!departure) {
    if (text === ctx.t('chat.now') || text.toLowerCase().includes('maintenant')) {
      departure = new Date();
    } else {
      const minsMatch = text.match(/(\d+)/);
      if (text.toLowerCase().includes('min') && minsMatch) {
        departure = new Date(Date.now() + parseInt(minsMatch[1], 10) * 60_000);
      }
    }
  }

  if (!departure) {
    return {
      state: {
        ...state,
        busy: false,
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.whenNotUnderstood'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }

  if (!state.destination || !state.origin || !state.destinationLabel) {
    return {
      state: {
        ...createInitialChatState(ctx.t),
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.errorGeneric')),
        ],
      },
    };
  }

  const trip: ChatTripRequest = {
    destination: state.destination,
    destinationLabel: state.destinationLabel,
    origin: state.origin,
    originLabel: state.originLabel ?? ctx.t('chat.myLocation'),
    departureTime: departure,
  };

  const timeLabel = departure.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    state: {
      ...state,
      busy: false,
      departureTime: departure,
      phase: 'planning',
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.planning', { time: timeLabel, destination: state.destinationLabel })),
      ],
    },
    tripRequest: trip,
  };
}

export function chatPhaseAfterRoute(
  state: ChatSessionState,
  summary: string,
  ok: boolean,
  t: (key: string) => string
): ChatSessionState {
  if (!ok) {
    return {
      ...state,
      phase: 'awaiting_destination',
      busy: false,
      messages: [
        ...state.messages,
        assistant(summary),
        assistant(t('chat.tryAgain'), {
          quickReplies: [{ id: 'restart', label: t('chat.restart') }],
        }),
      ],
    };
  }

  return {
    ...state,
    phase: 'navigating',
    busy: false,
    messages: [...state.messages, assistant(summary)],
  };
}

export function appendNavigationGuidance(
  state: ChatSessionState,
  text: string
): ChatSessionState {
  return setNavigationGuidance(state, text);
}

/** Remplace l’étape affichée : une seule consigne de guidage à la fois. */
export function setNavigationGuidance(
  state: ChatSessionState,
  text: string
): ChatSessionState {
  const withoutSteps = state.messages.filter((message) => message.kind !== 'nav-step');
  const last = withoutSteps[withoutSteps.length - 1];
  if (last?.role === 'assistant' && last.text === text) {
    return { ...state, messages: withoutSteps };
  }
  return {
    ...state,
    phase: 'navigating',
    busy: false,
    messages: [...withoutSteps, assistant(text, { kind: 'nav-step' })],
  };
}

export type { ChatPhase };
