import type { Coordinates, SearchSuggestion } from '../../stores/transitStore';
import type { NavigationStep } from '../routing/navigationSteps';

export type ChatPhase =
  | 'greeting'
  | 'awaiting_destination'
  | 'awaiting_destination_choice'
  | 'awaiting_origin'
  | 'awaiting_when'
  | 'planning'
  | 'navigating'
  | 'done';

export interface ChatQuickReply {
  id: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  kind?: 'nav-step';
  quickReplies?: ChatQuickReply[];
  placeSuggestions?: SearchSuggestion[];
}

export interface ChatTripRequest {
  destination: Coordinates;
  destinationLabel: string;
  origin: Coordinates;
  originLabel: string;
  departureTime: Date;
}

export interface ChatSessionState {
  phase: ChatPhase;
  messages: ChatMessage[];
  destination?: Coordinates;
  destinationLabel?: string;
  origin?: Coordinates;
  originLabel?: string;
  departureTime?: Date;
  pendingSuggestions?: SearchSuggestion[];
  busy: boolean;
}

export function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatStepGuidance(
  step: NavigationStep,
  stepIndex: number,
  total: number,
  distanceMeters?: number | null
): string {
  const progress = `Étape ${stepIndex + 1}/${total}`;
  const distance =
    distanceMeters != null && step.kind !== 'arrive'
      ? ` · encore ~${Math.max(0, distanceMeters)} m`
      : '';

  if (step.kind === 'walk') {
    return `${progress} — ${step.title}. ${step.subtitle}${distance}. Suivez le tracé sur la carte ; l’étape suivante s’affiche à l’arrivée.`;
  }
  if (step.kind === 'transit') {
    const line = step.lineName ? `Ligne ${step.lineName}` : 'Transport';
    return `${progress} — ${line} : ${step.title}. ${step.subtitle}${distance}. Descendez à l’arrêt indiqué sur la carte.`;
  }
  return `${progress} — ${step.title}. ${step.subtitle}`;
}

/** Parse une réponse libre pour l’heure de départ. */
export function parseDepartureWhen(raw: string, now = new Date()): Date | null {
  const text = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (
    /^(maintenant|tout de suite|asap|immediatement|de suite|tout'heure|des que possible)$/.test(
      text
    ) ||
    text.includes('maintenant') ||
    text.includes('tout de suite')
  ) {
    return now;
  }

  const inMinutes = text.match(/dans\s+(\d+)\s*(min|mins|minute|minutes)?/);
  if (inMinutes) {
    const mins = parseInt(inMinutes[1], 10);
    return new Date(now.getTime() + mins * 60_000);
  }

  const inHours = text.match(/dans\s+(\d+)\s*h(?:eure)?s?/);
  if (inHours) {
    const hours = parseInt(inHours[1], 10);
    return new Date(now.getTime() + hours * 60 * 60_000);
  }

  const clock =
    text.match(/(?:a|à)?\s*(\d{1,2})\s*[h:]\s*(\d{2})/) ||
    text.match(/(?:a|à)?\s*(\d{1,2})\s*h\b/);
  if (clock) {
    const hours = parseInt(clock[1], 10);
    const minutes = clock[2] ? parseInt(clock[2], 10) : 0;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      const target = new Date(now);
      target.setHours(hours, minutes, 0, 0);
      if (target.getTime() < now.getTime() - 60_000) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    }
  }

  if (text.includes('demain matin')) {
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    return target;
  }

  if (text.includes('demain')) {
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(8, 0, 0, 0);
    return target;
  }

  return null;
}

export function isCurrentLocationPhrase(raw: string): boolean {
  const text = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return (
    /^(ma position|ici|d'ici|de ma position|depuis ici|ou je suis|la ou je suis)$/.test(text) ||
    text.includes('ma position') ||
    text.includes('depuis ici') ||
    text === 'ici'
  );
}
