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
  /** Destination encore à résoudre après choix d’origine (phrase structurée). */
  pendingDestQuery?: string;
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
    /^(maintenant|tout de suite|asap|immediatement|de suite|now|ahora|ahora mismo|jetzt|ora|adesso)$/.test(
      text
    ) ||
    text.includes('maintenant') ||
    text.includes('tout de suite') ||
    text === 'now'
  ) {
    return now;
  }

  const inMinutes =
    text.match(/\bdans\s+(\d+)\s*(min|mins|minute|minutes)?\b/) ||
    text.match(/\bin\s+(\d+)\s*(min|mins|minute|minutes|m)?\b/) ||
    text.match(/\ben\s+(\d+)\s*(min|mins|minuto|minutos)?\b/) ||
    text.match(/\btra\s+(\d+)\s*(min|mins|minuti)?\b/);
  if (inMinutes) {
    const mins = parseInt(inMinutes[1], 10);
    return new Date(now.getTime() + mins * 60_000);
  }

  const inHours =
    text.match(/\bdans\s+(\d+)\s*h(?:eure)?s?\b/) ||
    text.match(/\bin\s+(\d+)\s*h(?:our)?s?\b/) ||
    text.match(/\ben\s+(\d+)\s*h(?:ora)?s?\b/);
  if (inHours) {
    const hours = parseInt(inHours[1], 10);
    return new Date(now.getTime() + hours * 60 * 60_000);
  }

  const dayOffset = (() => {
    if (text.includes('apres-demain') || text.includes('after tomorrow') || text.includes('pasado manana')) {
      return 2;
    }
    if (
      text.includes('demain') ||
      text.includes('tomorrow') ||
      text.includes('manana') ||
      text.includes('morgen') ||
      text.includes('domani')
    ) {
      return 1;
    }
    const weekdays: Record<string, number> = {
      dimanche: 0,
      sunday: 0,
      domingo: 0,
      sonntag: 0,
      domenica: 0,
      lundi: 1,
      monday: 1,
      lunes: 1,
      montag: 1,
      lunedi: 1,
      mardi: 2,
      tuesday: 2,
      martes: 2,
      dienstag: 2,
      martedi: 2,
      mercredi: 3,
      wednesday: 3,
      miercoles: 3,
      mittwoch: 3,
      mercoledi: 3,
      jeudi: 4,
      thursday: 4,
      jueves: 4,
      donnerstag: 4,
      giovedi: 4,
      vendredi: 5,
      friday: 5,
      viernes: 5,
      freitag: 5,
      venerdi: 5,
      samedi: 6,
      saturday: 6,
      sabado: 6,
      samstag: 6,
      sabato: 6,
    };
    for (const [name, dow] of Object.entries(weekdays)) {
      if (text.includes(name)) {
        const current = now.getDay();
        let delta = (dow - current + 7) % 7;
        if (delta === 0) delta = 7;
        return delta;
      }
    }
    return 0;
  })();

  const clock =
    text.match(/(?:a|à|at|um|a las)?\s*(\d{1,2})\s*[h:]\s*(\d{2})/) ||
    text.match(/(?:a|à|at|um)?\s*(\d{1,2})\s*h\b/) ||
    text.match(/(\d{1,2})\s*(?:am|pm)\b/);

  let hours: number | null = null;
  let minutes = 0;
  if (clock) {
    hours = parseInt(clock[1], 10);
    minutes = clock[2] && /^\d{2}$/.test(clock[2]) ? parseInt(clock[2], 10) : 0;
    if (/pm\b/.test(text) && hours < 12) hours += 12;
    if (/am\b/.test(text) && hours === 12) hours = 0;
  } else if (text.includes('matin') || text.includes('morning')) {
    hours = 9;
  } else if (text.includes('midi') || text.includes('noon')) {
    hours = 12;
  } else if (text.includes('apres-midi') || text.includes('afternoon')) {
    hours = 15;
  } else if (text.includes('soir') || text.includes('evening')) {
    hours = 18;
  }

  if (hours != null && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
    const target = new Date(now);
    if (dayOffset > 0) {
      target.setDate(target.getDate() + dayOffset);
    }
    target.setHours(hours, minutes, 0, 0);
    if (dayOffset === 0 && target.getTime() < now.getTime() - 60_000) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  if (dayOffset > 0) {
    const target = new Date(now);
    target.setDate(target.getDate() + dayOffset);
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
