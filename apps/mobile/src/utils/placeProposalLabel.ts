import type { SearchSuggestion } from '../stores/transitStore';

export interface PlaceProposalParts {
  name: string;
  /** N° + nom de voie */
  streetLine?: string;
  city?: string;
  /** Quartier */
  quarter?: string;
}

const POSTAL_RE = /^\d{5}$/;
const POSTAL_PREFIX_RE = /^\d{5}\s+/;
const DEPT_RE = /^(h[eé]rault|gard|aude|loz[eè]re|pyr[eé]n[eé]es)/i;
const REGION_RE = /^(occitanie|france|france m[eé]tropolitaine)$/i;

function looksLikeStreetSegment(segment: string): boolean {
  return /^(?:\d+\s+)?(?:rue|av\.?|avenue|bd\.?|boulevard|chemin|impasse|place|all[eé]e|cours|quai|route|imp\.?)\b/i.test(
    segment
  );
}

function stripPostal(segment: string): string {
  return segment.replace(POSTAL_PREFIX_RE, '').trim();
}

/** Extrait rue / ville / quartier (sans CP, département, région). Ordre UI : rue → ville → quartier. */
function parseAddressFromDisplayName(raw: string, placeName: string): Omit<PlaceProposalParts, 'name'> {
  const afterCategory = raw.includes('·')
    ? raw
        .split('·')
        .slice(1)
        .join('·')
        .trim()
    : raw;

  let parts = afterCategory
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !POSTAL_RE.test(s) && !DEPT_RE.test(s) && !REGION_RE.test(s));

  if (parts[0] && parts[0].toLowerCase() === placeName.toLowerCase()) {
    parts = parts.slice(1);
  }

  // Fusionner « 12 » + « Rue X »
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    const next = parts[i + 1];
    if (/^\d+[a-z]?$/i.test(cur) && next && looksLikeStreetSegment(next)) {
      merged.push(`${cur} ${next}`);
      i += 1;
      continue;
    }
    merged.push(cur);
  }

  let streetLine: string | undefined;
  const rest: string[] = [];

  for (const segment of merged) {
    if (!streetLine && (looksLikeStreetSegment(segment) || /^\d+\s+\S+/.test(segment))) {
      streetLine = segment;
      continue;
    }
    rest.push(stripPostal(segment));
  }

  // Nominatim FR : souvent [quartier?, ville] après la rue
  let city: string | undefined;
  let quarter: string | undefined;

  if (rest.length === 1) {
    city = rest[0];
  } else if (rest.length >= 2) {
    // Dernier = ville, précédent = quartier (ordre d’affichage demandé : ville puis quartier)
    city = rest[rest.length - 1];
    quarter = rest[rest.length - 2];
    if (city && quarter && /montpellier/i.test(quarter) && !/montpellier/i.test(city)) {
      const swap = city;
      city = quarter;
      quarter = swap;
    }
  }

  return {
    streetLine: streetLine || undefined,
    city: city || undefined,
    quarter: quarter || undefined,
  };
}

/** Sépare le nom et l’adresse structurée pour l’infobulle carte. */
export function getPlaceProposalParts(place: SearchSuggestion): PlaceProposalParts {
  const name = (place.name || place.displayName || '').trim();

  if (place.streetLine || place.city || place.quarter) {
    return {
      name,
      streetLine: place.streetLine,
      city: place.city,
      quarter: place.quarter,
    };
  }

  const display = (place.displayName || '').trim();
  if (!display) return { name };

  return { name, ...parseAddressFromDisplayName(display, name) };
}
