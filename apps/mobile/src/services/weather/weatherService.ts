export interface MapWeather {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  fetchedAt: Date;
}

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export async function fetchMapWeather(lat: number, lon: number): Promise<MapWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'Europe/Paris',
    forecast_days: '1',
  });

  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    current: {
      temperature_2m: number;
      weather_code: number;
      is_day: number;
    };
  };

  return {
    temperature: Math.round(data.current.temperature_2m),
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
    fetchedAt: new Date(),
  };
}

export function weatherIconName(
  code: number,
  isDay: boolean
): keyof typeof import('@expo/vector-icons').Ionicons.glyphMap {
  if (code === 0) return isDay ? 'sunny-outline' : 'moon-outline';
  if (code <= 3) return isDay ? 'partly-sunny-outline' : 'cloudy-night-outline';
  if (code === 45 || code === 48) return 'cloud-outline';
  if (code >= 51 && code <= 67) return 'rainy-outline';
  if (code >= 71 && code <= 77) return 'snow-outline';
  if (code >= 80 && code <= 82) return 'rainy-outline';
  if (code >= 95) return 'thunderstorm-outline';
  return 'cloud-outline';
}

export function weatherLabel(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'Ensoleillé' : 'Nuit claire';
  if (code <= 3) return 'Nuageux';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige';
  if (code >= 80 && code <= 82) return 'Averses';
  if (code >= 95) return 'Orage';
  return '—';
}
