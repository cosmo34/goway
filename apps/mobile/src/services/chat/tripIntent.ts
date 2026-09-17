import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import { parseDepartureWhen, isCurrentLocationPhrase } from './chatTypes';

export type TripMissingField = 'destination' | 'origin' | 'when';

export interface TripIntent {
  raw: string;
  destinationQuery?: string;
  originQuery?: string;
  departureTime?: Date;
  arrivalTime?: Date;
  useCurrentLocationOrigin?: boolean;
  missing: TripMissingField[];
  /** Phrase structurée (pas un simple nom de lieu). */
  isStructured: boolean;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTimePhrases(text: string): string {
  return text
    .replace(
      /\b(demain(\s+matin|\s+soir|\s+apres[- ]?midi)?|apres[- ]?demain|aujourd['']?hui|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      ' '
    )
    .replace(
      /\b(?:a|à|at|pour)\s*\d{1,2}\s*[h:]\s*\d{0,2}\b/gi,
      ' '
    )
    .replace(/\b(?:a|à|at)\s*\d{1,2}\s*h\b/gi, ' ')
    .replace(/\bdans\s+\d+\s*(min|mins|minutes|h|heure|heures)?\b/gi, ' ')
    .replace(/\b(maintenant|tout de suite|asap)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArrivalTime(raw: string, now: Date): Date | null {
  const text = normalize(raw);
  const arrivalMatch = text.match(
    /(?:arriver|arrive|arriverai|etre|etre la|etre a)\s+(?:a|vers|pour|avant)?\s*(.+)$/i
  );
  if (arrivalMatch) {
    const parsed = parseDepartureWhen(arrivalMatch[1], now);
    if (parsed) return parsed;
  }
  const arriveAt = text.match(
    /(?:arriver|arrive)\s+(?:a|au|a la|a l[''])?.+?\s+(?:a|vers|pour)\s+(\d{1,2}\s*[h:]\s*\d{0,2}.*)/i
  );
  if (arriveAt) {
    return parseDepartureWhen(arriveAt[1], now);
  }
  return null;
}

/**
 * Parse une requête libre du type :
 * « je veux arriver à la Comédie demain à 14h »
 * « partir de la gare à 9h pour aller à Odysseum »
 */
export function parseTripIntent(raw: string, now = new Date()): TripIntent {
  const text = normalize(raw);
  const missing: TripMissingField[] = [];
  let destinationQuery: string | undefined;
  let originQuery: string | undefined;
  let useCurrentLocationOrigin: boolean | undefined;
  let departureTime: Date | undefined;
  let arrivalTime: Date | undefined;

  const structuredHints =
    /\b(je veux|je voudrais|aller|partir|arriver|depuis|pour aller|de |vers |trajet|itineraire|demain|maintenant|heure|h\d|\d{1,2}\s*h)\b/i.test(
      text
    ) || text.split(' ').length >= 4;

  // Origine : ma position
  if (isCurrentLocationPhrase(raw) || /\b(de ma position|depuis ma position|d'ici|de ici)\b/.test(text)) {
    useCurrentLocationOrigin = true;
  }

  // « en partant de X » / « depuis X » (souvent en fin de phrase)
  if (!originQuery) {
    const partingFrom =
      text.match(/\ben\s+partant\s+(?:de|depuis)\s+(.+?)(?:\s+(?:pour|aller|a|demain|dans|vers)\b|$)/i) ||
      text.match(/\bpartant\s+(?:de|depuis)\s+(.+?)(?:\s+(?:pour|aller|a|demain|dans|vers)\b|$)/i);
    if (partingFrom) {
      originQuery = stripTimePhrases(partingFrom[1]);
      if (isCurrentLocationPhrase(originQuery)) {
        useCurrentLocationOrigin = true;
        originQuery = undefined;
      } else {
        useCurrentLocationOrigin = false;
      }
    }
  }

  // « de X pour aller à Y » / « partir de X … aller à Y »
  const toPlace = String.raw`(?:au|aux|a\s+la|a\s+l['']|a|vers)?`;
  const fromTo =
    text.match(
      new RegExp(
        String.raw`(?:partir|part|depart)\s+(?:de|depuis)\s+(.+?)\s+pour\s+aller\s+${toPlace}\s*(.+)$`,
        'i'
      )
    ) ||
    text.match(
      new RegExp(
        String.raw`(?:partir|part|depart)\s+(?:de|depuis)\s+(.+?)\s+aller\s+${toPlace}\s*(.+)$`,
        'i'
      )
    ) ||
    text.match(
      new RegExp(
        String.raw`(?:depuis)\s+(.+?)\s+(?:pour\s+aller|vers|jusqu['']?a)\s+${toPlace}\s*(.+)$`,
        'i'
      )
    ) ||
    text.match(
      new RegExp(String.raw`\bde\s+(.+?)\s+pour\s+aller\s+${toPlace}\s*(.+)$`, 'i')
    );
  if (fromTo && !originQuery) {
    originQuery = stripTimePhrases(fromTo[1]);
    destinationQuery = stripTimePhrases(fromTo[2]);
    if (isCurrentLocationPhrase(originQuery)) {
      useCurrentLocationOrigin = true;
      originQuery = undefined;
    } else {
      useCurrentLocationOrigin = false;
    }
  } else if (fromTo && !destinationQuery) {
    destinationQuery = stripTimePhrases(fromTo[2]);
  }

  // « aller / arriver à Y »
  if (!destinationQuery) {
    const toMatch =
      text.match(
        new RegExp(
          String.raw`(?:aller|me rendre|me diriger|arriver|arrive|direction|vers|jusqu['']?a)\s+${toPlace}\s*(.+?)(?:\s+(?:a|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|dans|pour|partir|de)\b|$)`,
          'i'
        )
      ) ||
      text.match(
        new RegExp(
          String.raw`(?:je veux|je voudrais|je souhaite)\s+(?:aller|arriver|me rendre)\s+${toPlace}\s*(.+)$`,
          'i'
        )
      );
    if (toMatch) {
      destinationQuery = stripTimePhrases(toMatch[1]);
    }
  }

  // « partir de X » / « en partant de X » seul
  if (!originQuery && useCurrentLocationOrigin !== true) {
    const fromOnly =
      text.match(
        /(?:partir|part|depart)\s+(?:de|depuis)\s+(.+?)(?:\s+(?:pour|aller|a|demain|dans|vers)\b|$)/i
      ) ||
      text.match(/\ben\s+partant\s+(?:de|depuis)\s+(.+)$/i);
    if (fromOnly) {
      originQuery = stripTimePhrases(fromOnly[1]);
      if (isCurrentLocationPhrase(originQuery)) {
        useCurrentLocationOrigin = true;
        originQuery = undefined;
      } else {
        useCurrentLocationOrigin = false;
      }
    }
  }

  // Heures
  const arrival = extractArrivalTime(raw, now);
  if (arrival) {
    arrivalTime = arrival;
  }

  const departHint = text.match(
    /(?:partir|part|depart|je pars|je voudrais partir|je veux partir)\s+(?:a|vers|pour|demain|dans|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d).*/i
  );
  if (departHint) {
    const parsed = parseDepartureWhen(departHint[0].replace(/^(partir|part|depart)\s+/i, ''), now);
    if (parsed) departureTime = parsed;
  }

  if (!departureTime) {
    // Heuristique : si la phrase contient une heure/jour hors contexte arriver
    const withoutArrive = text.replace(/arriver[^.]*/gi, ' ');
    const parsed = parseDepartureWhen(withoutArrive, now);
    // Éviter de traiter un simple nom de lieu comme "maintenant"
    if (parsed && structuredHints && (text.match(/\d/) || /demain|maintenant|dans\s+\d|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/.test(text))) {
      if (!arrivalTime || Math.abs(parsed.getTime() - (arrivalTime?.getTime() ?? 0)) > 60_000) {
        departureTime = parsed;
      }
    }
  }

  // Si arrivée seule → départ estimé 50 min avant
  if (arrivalTime && !departureTime) {
    departureTime = new Date(arrivalTime.getTime() - 50 * 60_000);
    if (departureTime.getTime() < now.getTime()) {
      departureTime = now;
    }
  }

  // Lieu simple sans structure
  if (!destinationQuery && !originQuery && !structuredHints) {
    const simple = stripTimePhrases(text);
    if (simple.length >= 2) {
      destinationQuery = simple;
    }
  }

  if (!destinationQuery) missing.push('destination');
  if (!originQuery && !useCurrentLocationOrigin && structuredHints && /\b(partir|depuis|de )\b/.test(text) && !/\b(de ma position|d'ici)\b/.test(text)) {
    // "partir à 14h pour aller à X" — origine implicite = GPS, pas missing
  }
  // Pour phrase structurée sans origine mentionnée → GPS par défaut (pas missing)
  if (!originQuery && useCurrentLocationOrigin === undefined && structuredHints) {
    useCurrentLocationOrigin = true;
  }
  // Origine explicite dans la phrase → ne pas forcer le GPS
  if (originQuery) {
    useCurrentLocationOrigin = false;
  }

  // Heure manquante seulement si l'utilisateur a clairement une intention temporelle vague
  if (
    structuredHints &&
    !departureTime &&
    !arrivalTime &&
    /\b(quand|heure|jour|demain|matin|soir)\b/.test(text) &&
    !/\d/.test(text)
  ) {
    missing.push('when');
  }

  return {
    raw,
    destinationQuery: destinationQuery || undefined,
    originQuery: originQuery || undefined,
    departureTime,
    arrivalTime,
    useCurrentLocationOrigin,
    missing: missing.filter((field, i, arr) => arr.indexOf(field) === i),
    isStructured: structuredHints,
  };
}

export function defaultDepartureForDay(dayOffset: number, hours: number, minutes: number, now = new Date()): Date {
  const day = addDays(startOfDay(now), dayOffset);
  return setMinutes(setHours(day, hours), minutes);
}
