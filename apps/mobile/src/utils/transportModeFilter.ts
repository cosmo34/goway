import type { TransportMode } from '../config/tam';

/** Arrêt visible si au moins un de ses modes est encore activé. */
export function stopMatchesEnabledModes(
  stop: { modes?: string[] | null },
  enabledModes: readonly TransportMode[]
): boolean {
  if (enabledModes.length === 0) return false;
  const modes = stop.modes ?? [];
  if (modes.length === 0) return true;
  return modes.some((mode) => enabledModes.includes(mode as TransportMode));
}
