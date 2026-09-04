import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api/client';

export interface Vehicle {
  vehicleId: string;
  tripId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
}

const POLL_INTERVAL = 15_000;

export function useVehicles(enabled = true) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVehicles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<Vehicle[]>('/api/vehicles');
      setVehicles(data);
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchVehicles();
    const timer = setInterval(fetchVehicles, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [enabled, fetchVehicles]);

  return { vehicles, loading, refresh: fetchVehicles };
}
