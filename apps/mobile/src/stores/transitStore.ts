import { create } from 'zustand';
import type { NavigationStep } from '../services/routing/navigationSteps';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type SearchScope = 'local' | 'national';

export type PlaceCategory = 'monument' | 'place' | 'quarter' | 'street' | 'stop' | 'address';

export interface SearchSuggestion {
  name: string;
  displayName: string;
  coordinates: Coordinates;
  source: 'known' | 'stop' | 'geocode';
  category?: PlaceCategory;
  /** « 12 rue de la Loge » */
  streetLine?: string;
  city?: string;
  /** Quartier */
  quarter?: string;
}

export interface Stop {
  id: string;
  name: string;
  coordinates: Coordinates;
  modes: string[];
}

export interface TransitLine {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  mode: 'tram' | 'bus' | 'tram_bus';
}

export interface TransitLineDetail extends TransitLine {
  directions: { id: string; headsign: string }[];
  stops: Stop[];
  shape: Coordinates[];
}

export interface Departure {
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  scheduledTime: Date;
  realtimeTime?: Date;
  isRealtime: boolean;
  mode: 'tram' | 'bus' | 'tram_bus';
}

export interface RouteLeg {
  mode: 'walk' | 'tram' | 'bus' | 'tram_bus';
  from: string;
  to: string;
  durationMinutes: number;
  lineName?: string;
  lineShortName?: string;
  lineColor?: string;
  lineId?: string;
  tripId?: string;
  fromStopId?: string;
  toStopId?: string;
  geometry?: Coordinates[];
  departures?: Departure[];
}

export interface Route {
  id: string;
  legs: RouteLeg[];
  totalDurationMinutes: number;
  departureTime: Date;
  arrivalTime: Date;
  walkingMinutes: number;
  geometry?: Coordinates[];
  itineraryStopIds?: string[];
}

export interface PointOfInterest {
  id: string;
  name: string;
  category: 'restaurant' | 'shop' | 'service' | 'culture';
  coordinates: Coordinates;
  distanceMeters: number;
}

export interface TripReminder {
  routeId: string;
  lineId: string;
  stopId: string;
  stopName: string;
  departureTime: Date;
  walkingMinutes: number;
  notifyAt: Date;
  enabled: boolean;
}

interface TransitState {
  selectedStops: Stop[];
  departures: Departure[];
  activeRoute: Route | null;
  routeOptions: Route[];
  selectedRouteIndex: number;
  previewRouteIndex: number;
  destinationLabel: string | null;
  originCoordinates: Coordinates | null;
  destinationCoordinates: Coordinates | null;
  destinationPOIs: PointOfInterest[];
  mapStops: Stop[];
  mapPois: PointOfInterest[];
  searchSuggestions: SearchSuggestion[];
  searchScope: SearchScope;
  tripReminder: TripReminder | null;
  searchQuery: string;
  isSearching: boolean;
  routeStops: Stop[];
  boardingStop: Stop | null;
  navigationActive: boolean;
  navigationStepIndex: number;
  navigationSteps: NavigationStep[];

  setSelectedStops: (stops: Stop[]) => void;
  setDepartures: (departures: Departure[]) => void;
  setActiveRoute: (route: Route | null) => void;
  setRouteOptions: (routes: Route[]) => void;
  setPlannedRoutes: (routes: Route[], routeStops: Stop[], boardingStop: Stop | null) => void;
  setSelectedRouteIndex: (index: number) => void;
  setPreviewRouteIndex: (index: number) => void;
  setDestinationLabel: (label: string | null) => void;
  setOriginCoordinates: (coords: Coordinates | null) => void;
  setDestinationCoordinates: (coords: Coordinates | null) => void;
  setDestinationPOIs: (pois: PointOfInterest[]) => void;
  setMapStops: (stops: Stop[]) => void;
  setMapPois: (pois: PointOfInterest[]) => void;
  setSearchSuggestions: (suggestions: SearchSuggestion[]) => void;
  setSearchScope: (scope: SearchScope) => void;
  toggleSearchScope: () => void;
  setTripReminder: (reminder: TripReminder | null) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  setRouteStops: (stops: Stop[]) => void;
  setBoardingStop: (stop: Stop | null) => void;
  startNavigation: (steps: NavigationStep[]) => void;
  advanceNavigationStep: () => void;
  stopNavigation: () => void;
  clearRouteNavigation: () => void;
}

export const useTransitStore = create<TransitState>((set, get) => ({
  selectedStops: [],
  departures: [],
  activeRoute: null,
  routeOptions: [],
  selectedRouteIndex: 0,
  previewRouteIndex: 0,
  destinationLabel: null,
  originCoordinates: null,
  destinationCoordinates: null,
  destinationPOIs: [],
  mapStops: [],
  mapPois: [],
  searchSuggestions: [],
  searchScope: 'local',
  tripReminder: null,
  searchQuery: '',
  isSearching: false,
  routeStops: [],
  boardingStop: null,
  navigationActive: false,
  navigationStepIndex: 0,
  navigationSteps: [],

  setSelectedStops: (stops) => set({ selectedStops: stops }),
  setDepartures: (departures) => set({ departures }),
  setActiveRoute: (route) => set({ activeRoute: route }),
  setRouteOptions: (routes) =>
    set({
      routeOptions: routes,
      selectedRouteIndex: 0,
      previewRouteIndex: 0,
      activeRoute: routes[0] ?? null,
    }),
  setPlannedRoutes: (routes, routeStops, boardingStop) =>
    set({
      routeOptions: routes,
      selectedRouteIndex: 0,
      previewRouteIndex: 0,
      activeRoute: routes[0] ?? null,
      routeStops,
      boardingStop,
      mapStops: routeStops,
    }),
  setSelectedRouteIndex: (index) => {
    const route = get().routeOptions[index] ?? null;
    set({ selectedRouteIndex: index, previewRouteIndex: index, activeRoute: route });
  },
  setPreviewRouteIndex: (index) => set({ previewRouteIndex: index }),
  setDestinationLabel: (label) => set({ destinationLabel: label }),
  setOriginCoordinates: (coords) => set({ originCoordinates: coords }),
  setDestinationCoordinates: (coords) => set({ destinationCoordinates: coords }),
  setDestinationPOIs: (pois) => set({ destinationPOIs: pois }),
  setMapStops: (stops) => set({ mapStops: stops }),
  setMapPois: (pois) => set({ mapPois: pois }),
  setSearchSuggestions: (suggestions) => set({ searchSuggestions: suggestions }),
  setSearchScope: (scope) => set({ searchScope: scope }),
  toggleSearchScope: () =>
    set({ searchScope: get().searchScope === 'local' ? 'national' : 'local' }),
  setTripReminder: (reminder) => set({ tripReminder: reminder }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSearching: (searching) => set({ isSearching: searching }),
  setRouteStops: (stops) => set({ routeStops: stops }),
  setBoardingStop: (stop) => set({ boardingStop: stop }),
  startNavigation: (steps) =>
    set({
      navigationActive: true,
      navigationSteps: steps,
      navigationStepIndex: 0,
    }),
  advanceNavigationStep: () => {
    const { navigationStepIndex, navigationSteps } = get();
    if (navigationStepIndex >= navigationSteps.length - 1) {
      set({ navigationActive: false, navigationStepIndex: 0, navigationSteps: [] });
      return;
    }
    set({ navigationStepIndex: navigationStepIndex + 1 });
  },
  stopNavigation: () =>
    set({
      navigationActive: false,
      navigationStepIndex: 0,
      navigationSteps: [],
    }),
  clearRouteNavigation: () =>
    set({
      activeRoute: null,
      routeOptions: [],
      selectedRouteIndex: 0,
      previewRouteIndex: 0,
      destinationLabel: null,
      originCoordinates: null,
      destinationCoordinates: null,
      routeStops: [],
      boardingStop: null,
      navigationActive: false,
      navigationStepIndex: 0,
      navigationSteps: [],
    }),
}));
