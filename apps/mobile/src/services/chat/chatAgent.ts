import { searchPlacesApi } from '../api/transitApi';
import { mergeSearchSuggestions, searchPlacesLocally } from '../../utils/localPlaceSearch';
import type { Coordinates, SearchSuggestion, Stop } from '../../stores/transitStore';
import { parseTripIntent, type TripIntent } from './tripIntent';
import {
  createMessageId,
  isCurrentLocationPhrase,
  parseDepartureWhen,
  type ChatMessage,
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

type ChatCtx = {
  userLocation: Coordinates | null;
  mapStops: Stop[];
  t: (key: string, opts?: Record<string, string | number>) => string;
  resolveUserLocation: () => Promise<Coordinates | null>;
};

export function createInitialChatState(t: (key: string) => string): ChatSessionState {
  return {
    phase: 'awaiting_destination',
    busy: false,
    messages: [assistant(t('chat.greeting'))],
  };
}

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

function finalizeTrip(state: ChatSessionState, departure: Date, ctx: ChatCtx): ChatTurnResult {
  if (!state.destination || !state.origin || !state.destinationLabel) {
    return {
      state: {
        ...state,
        busy: false,
        messages: [...state.messages, assistant(ctx.t('chat.errorGeneric'))],
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
      pendingDestQuery: undefined,
      phase: 'planning',
      messages: [
        ...state.messages,
        assistant(
          ctx.t('chat.planning', {
            time: timeLabel,
            destination: state.destinationLabel,
          })
        ),
      ],
    },
    tripRequest: trip,
  };
}

async function resolveDestinationPlaces(
  state: ChatSessionState,
  destQuery: string,
  ctx: ChatCtx
): Promise<ChatTurnResult> {
  const places = await resolvePlaces(destQuery, ctx.userLocation, ctx.mapStops);

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
    const label = place.displayName || place.name;
    const withDest: ChatSessionState = {
      ...state,
      destination: place.coordinates,
      destinationLabel: label,
      pendingDestQuery: undefined,
      pendingSuggestions: undefined,
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.destinationConfirmed', { destination: label })),
      ],
    };

    if (!withDest.origin) {
      return {
        state: {
          ...withDest,
          phase: 'awaiting_origin',
          busy: false,
          messages: [
            ...withDest.messages,
            assistant(ctx.t('chat.askOrigin', { destination: label }), {
              quickReplies: ORIGIN_REPLIES,
            }),
          ],
        },
      };
    }

    if (withDest.departureTime) {
      return finalizeTrip(withDest, withDest.departureTime, ctx);
    }

    return {
      state: {
        ...withDest,
        phase: 'awaiting_when',
        busy: false,
        messages: [
          ...withDest.messages,
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
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
        assistant(ctx.t('chat.chooseDestination'), { placeSuggestions: places }),
      ],
    },
  };
}

async function resolveOriginPlaces(
  state: ChatSessionState,
  originQuery: string,
  ctx: ChatCtx,
  pendingDestQuery?: string
): Promise<ChatTurnResult> {
  const places = await resolvePlaces(originQuery, ctx.userLocation, ctx.mapStops);

  if (places.length === 0) {
    return {
      state: {
        ...state,
        busy: false,
        phase: 'awaiting_origin',
        pendingDestQuery: pendingDestQuery ?? state.pendingDestQuery,
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.originNotFound'), { quickReplies: ORIGIN_REPLIES }),
        ],
      },
    };
  }

  if (places.length === 1) {
    const place = places[0];
    const label = place.displayName || place.name;
    const withOrigin: ChatSessionState = {
      ...state,
      origin: place.coordinates,
      originLabel: label,
      pendingSuggestions: undefined,
      pendingDestQuery: pendingDestQuery ?? state.pendingDestQuery,
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.originConfirmed', { origin: label })),
      ],
    };

    const destQuery = withOrigin.pendingDestQuery;
    if (destQuery && !withOrigin.destination) {
      return resolveDestinationPlaces(
        { ...withOrigin, pendingDestQuery: undefined },
        destQuery,
        ctx
      );
    }

    if (withOrigin.destination && withOrigin.departureTime) {
      return finalizeTrip(withOrigin, withOrigin.departureTime, ctx);
    }

    if (withOrigin.destination) {
      return {
        state: {
          ...withOrigin,
          phase: 'awaiting_when',
          busy: false,
          messages: [
            ...withOrigin.messages,
            assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
          ],
        },
      };
    }

    return {
      state: {
        ...withOrigin,
        phase: 'awaiting_destination',
        busy: false,
        messages: [...withOrigin.messages, assistant(ctx.t('tripAssist.askDestination'))],
      },
    };
  }

  return {
    state: {
      ...state,
      busy: false,
      phase: 'awaiting_origin',
      pendingSuggestions: places,
      pendingDestQuery: pendingDestQuery ?? state.pendingDestQuery,
      messages: [
        ...state.messages,
        assistant(ctx.t('chat.chooseOrigin'), { placeSuggestions: places }),
      ],
    },
  };
}

async function handleStructuredTrip(
  state: ChatSessionState,
  intent: TripIntent,
  ctx: ChatCtx
): Promise<ChatTurnResult> {
  let next: ChatSessionState = {
    ...state,
    departureTime: intent.departureTime ?? state.departureTime,
    pendingDestQuery: intent.destinationQuery ?? state.pendingDestQuery,
  };

  if (intent.departureTime) {
    const timeLabel = intent.departureTime.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    next = {
      ...next,
      messages: [
        ...next.messages,
        assistant(ctx.t('chat.whenNoted', { time: timeLabel })),
      ],
    };
  }

  if (intent.originQuery) {
    return resolveOriginPlaces(next, intent.originQuery, ctx, intent.destinationQuery);
  }

  if (intent.useCurrentLocationOrigin) {
    const origin = ctx.userLocation ?? (await ctx.resolveUserLocation());
    if (!origin) {
      return {
        state: {
          ...next,
          busy: false,
          phase: 'awaiting_origin',
          messages: [...next.messages, assistant(ctx.t('chat.locationNeeded'))],
        },
      };
    }
    next = {
      ...next,
      origin,
      originLabel: ctx.t('chat.myLocation'),
      messages: [...next.messages, assistant(ctx.t('chat.originConfirmedHere'))],
    };
  }

  if (intent.destinationQuery) {
    return resolveDestinationPlaces(
      { ...next, pendingDestQuery: undefined },
      intent.destinationQuery,
      ctx
    );
  }

  return {
    state: {
      ...next,
      busy: false,
      phase: 'awaiting_destination',
      messages: [...next.messages, assistant(ctx.t('tripAssist.askDestination'))],
    },
  };
}

export async function handleChatUserText(
  state: ChatSessionState,
  text: string,
  ctx: ChatCtx
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
            messages: [...withUser.messages, assistant(ctx.t('chat.busyNavigating'))],
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
  ctx: ChatCtx
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
  ctx: { t: (key: string, opts?: Record<string, string | number>) => string },
  options: { appendUserMessage?: boolean } = { appendUserMessage: true }
): ChatTurnResult {
  const label = place.displayName || place.name;
  const baseMessages =
    options.appendUserMessage === false
      ? state.messages
      : [...state.messages, user(label)];

  if (state.phase === 'awaiting_destination_choice' || state.phase === 'awaiting_destination') {
    const withDest: ChatSessionState = {
      ...state,
      destination: place.coordinates,
      destinationLabel: label,
      pendingSuggestions: undefined,
      pendingDestQuery: undefined,
      busy: false,
      messages: [
        ...baseMessages,
        assistant(ctx.t('chat.destinationConfirmed', { destination: label })),
      ],
    };

    if (state.origin) {
      if (state.departureTime) {
        return finalizeTrip(withDest, state.departureTime, ctx as ChatCtx);
      }
      return {
        state: {
          ...withDest,
          phase: 'awaiting_when',
          messages: [
            ...withDest.messages,
            assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
          ],
        },
      };
    }

    return {
      state: {
        ...withDest,
        phase: 'awaiting_origin',
        messages: [
          ...withDest.messages,
          assistant(ctx.t('chat.askOrigin', { destination: label }), {
            quickReplies: ORIGIN_REPLIES,
          }),
        ],
      },
    };
  }

  if (state.phase === 'awaiting_origin') {
    const withOrigin: ChatSessionState = {
      ...state,
      origin: place.coordinates,
      originLabel: label,
      pendingSuggestions: undefined,
      busy: false,
      messages: [
        ...baseMessages,
        assistant(ctx.t('chat.originConfirmed', { origin: label })),
      ],
    };

    // Note: async continuation for pendingDestQuery is handled by caller via applyOriginThenContinue
    if (state.pendingDestQuery) {
      return {
        state: {
          ...withOrigin,
          phase: 'awaiting_destination',
        },
      };
    }

    if (withOrigin.destination && withOrigin.departureTime) {
      return finalizeTrip(withOrigin, withOrigin.departureTime, ctx as ChatCtx);
    }

    if (withOrigin.destination) {
      return {
        state: {
          ...withOrigin,
          phase: 'awaiting_when',
          messages: [
            ...withOrigin.messages,
            assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
          ],
        },
      };
    }

    return {
      state: {
        ...withOrigin,
        phase: 'awaiting_when',
        messages: [
          ...withOrigin.messages,
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }

  return { state };
}

/** Après sélection d’origine sur la carte : résout la destination en attente si besoin. */
export async function continueAfterOriginSelect(
  state: ChatSessionState,
  ctx: ChatCtx
): Promise<ChatTurnResult> {
  if (state.pendingDestQuery && state.origin && !state.destination) {
    const query = state.pendingDestQuery;
    return resolveDestinationPlaces(
      { ...state, pendingDestQuery: undefined, busy: true },
      query,
      ctx
    );
  }
  if (state.destination && state.origin && state.departureTime) {
    return finalizeTrip(state, state.departureTime, ctx);
  }
  if (state.destination && state.origin && !state.departureTime) {
    return {
      state: {
        ...state,
        phase: 'awaiting_when',
        busy: false,
        messages: [
          ...state.messages,
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }
  return { state: { ...state, busy: false } };
}

async function handleDestination(
  state: ChatSessionState,
  text: string,
  ctx: ChatCtx
): Promise<ChatTurnResult> {
  const intent = parseTripIntent(text);
  if (intent.isStructured) {
    return handleStructuredTrip(state, intent, ctx);
  }

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
        assistant(ctx.t('chat.chooseDestination'), { placeSuggestions: places }),
      ],
    },
  };
}

async function handleDestinationChoice(
  state: ChatSessionState,
  text: string,
  ctx: ChatCtx
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
  ctx: ChatCtx
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
        const selected = handleChatPlaceSelect({ ...state, busy: false }, pending[index], ctx, {
          appendUserMessage: false,
        });
        if (selected.state.pendingDestQuery && selected.state.origin) {
          return continueAfterOriginSelect(selected.state, ctx);
        }
        return selected;
      }
    }
    const match = pending.find(
      (p) =>
        p.name.toLowerCase() === normalized ||
        (p.displayName ?? '').toLowerCase() === normalized ||
        p.name.toLowerCase().includes(normalized)
    );
    if (match) {
      const selected = handleChatPlaceSelect({ ...state, busy: false }, match, ctx, {
        appendUserMessage: false,
      });
      if (selected.state.pendingDestQuery && selected.state.origin) {
        return continueAfterOriginSelect(selected.state, ctx);
      }
      return selected;
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
    const withOrigin: ChatSessionState = {
      ...state,
      busy: false,
      origin,
      originLabel: ctx.t('chat.myLocation'),
      pendingSuggestions: undefined,
      messages: [...state.messages, assistant(ctx.t('chat.originConfirmedHere'))],
    };
    if (withOrigin.pendingDestQuery) {
      return continueAfterOriginSelect(withOrigin, ctx);
    }
    if (withOrigin.destination && withOrigin.departureTime) {
      return finalizeTrip(withOrigin, withOrigin.departureTime, ctx);
    }
    return {
      state: {
        ...withOrigin,
        phase: 'awaiting_when',
        messages: [
          ...withOrigin.messages,
          assistant(ctx.t('chat.askWhen'), { quickReplies: WHEN_REPLIES }),
        ],
      },
    };
  }

  return resolveOriginPlaces(state, text, ctx, state.pendingDestQuery);
}

async function handleWhen(
  state: ChatSessionState,
  text: string,
  ctx: ChatCtx
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

  return finalizeTrip(state, departure, ctx);
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
    phase: 'done',
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
