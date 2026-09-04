export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Stop {
  id: string;
  name: string;
  coordinates: Coordinates;
  modes: string[];
}

export interface Departure {
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  scheduledTime: string;
  realtimeTime?: string;
  isRealtime: boolean;
  mode: 'tram' | 'bus' | 'tram_bus';
  tripId?: string;
  headsign?: string;
}

export interface RouteLeg {
  mode: 'walk' | 'tram' | 'bus' | 'tram_bus';
  from: string;
  to: string;
  durationMinutes: number;
  lineName?: string;
  lineColor?: string;
  fromStopId?: string;
  toStopId?: string;
}

export interface Route {
  id: string;
  legs: RouteLeg[];
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  walkingMinutes: number;
}

export interface PointOfInterest {
  id: string;
  name: string;
  category: 'restaurant' | 'shop' | 'service' | 'culture';
  coordinates: Coordinates;
  distanceMeters: number;
}

export interface NaturalLanguageQuery {
  raw: string;
  destination?: string;
  destinationCoordinates?: Coordinates;
  departureTime?: string;
}

export interface ServiceAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  affectedLines: string[];
}

export interface WidgetDeparture {
  lineName: string;
  lineColor: string;
  direction: string;
  minutesUntil: number;
  isRealtime: boolean;
}
