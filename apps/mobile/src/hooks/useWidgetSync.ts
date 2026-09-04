import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { syncWidgetData } from '../services/widget/widgetStorage';

/** Rafraîchit les données widget/Live Activity toutes les 60s et au retour foreground */
export function useWidgetSync() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sync = () => syncWidgetData();

    sync();
    timerRef.current = setInterval(sync, 60_000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, []);
}
