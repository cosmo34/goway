import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

type GyroModule = {
  isAvailableAsync: () => Promise<boolean>;
  requestPermissionsAsync: () => Promise<unknown>;
  setUpdateInterval: (ms: number) => void;
  addListener: (listener: (data: { z: number }) => void) => { remove: () => void };
};

function loadGyroscope(): GyroModule | null {
  try {
    // Import dynamique pour ne pas faire planter l’app si le module natif n’est pas lié.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-sensors/build/Gyroscope');
    return (mod.default ?? mod) as GyroModule;
  } catch {
    return null;
  }
}

/**
 * Cap utilisateur (degrés, 0 = nord) via boussole + lissage gyroscope si disponible.
 */
export function useUserHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const compassRef = useRef<number | null>(null);
  const gyroBiasRef = useRef(0);
  const lastMotionAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      compassRef.current = null;
      gyroBiasRef.current = 0;
      return;
    }

    let headingSub: Location.LocationSubscription | null = null;
    let gyroSub: { remove: () => void } | null = null;
    let cancelled = false;

    const applyHeading = (value: number) => {
      const normalized = ((value % 360) + 360) % 360;
      setHeading(normalized);
    };

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        headingSub = await Location.watchHeadingAsync((event) => {
          const raw =
            event.trueHeading >= 0 ? event.trueHeading : event.magHeading;
          if (raw < 0) return;
          compassRef.current = raw;
          gyroBiasRef.current = 0;
          applyHeading(raw);
        });
      } catch {
        /* boussole indisponible */
      }

      const Gyroscope = loadGyroscope();
      if (!Gyroscope || cancelled) return;

      try {
        const available = await Gyroscope.isAvailableAsync();
        if (!available || cancelled) return;
        await Gyroscope.requestPermissionsAsync();
        Gyroscope.setUpdateInterval(80);
        gyroSub = Gyroscope.addListener(({ z }) => {
          const compass = compassRef.current;
          if (compass == null) return;

          const now = Date.now();
          const dt =
            lastMotionAtRef.current > 0
              ? Math.min(0.12, (now - lastMotionAtRef.current) / 1000)
              : 0.08;
          lastMotionAtRef.current = now;

          const yawRateDeg = (-z * 180) / Math.PI;
          if (!Number.isFinite(yawRateDeg) || Math.abs(yawRateDeg) < 2) return;

          gyroBiasRef.current += yawRateDeg * dt;
          gyroBiasRef.current = Math.max(-25, Math.min(25, gyroBiasRef.current));
          applyHeading(compass + gyroBiasRef.current);
        });
      } catch {
        /* gyroscope indisponible — boussole seule */
      }
    })();

    return () => {
      cancelled = true;
      headingSub?.remove();
      gyroSub?.remove();
    };
  }, [enabled]);

  return heading;
}
