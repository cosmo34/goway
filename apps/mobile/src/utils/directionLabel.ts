/**
 * Headsigns TaM : « VILLE - Arrêt de destination ».
 * Ne garde que le nom d’arrêt (après le premier « - »).
 */
export function destinationStopFromHeadsign(headsign: string): string {
  const trimmed = headsign.trim();
  if (!trimmed) return '';

  const separator = trimmed.indexOf(' - ');
  if (separator > 0) {
    const destination = trimmed.slice(separator + 3).trim();
    if (destination) return destination;
  }

  return trimmed;
}
