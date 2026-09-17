import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TransitMap, type TransitMapHandle } from '../../src/components/TransitMap';
import { SearchBar } from '../../src/components/SearchBar';
import { NoRouteFoundCard } from '../../src/components/NoRouteFoundCard';
import { ChatModePanel } from '../../src/components/ChatModePanel';
import { RouteOptionsSheet } from '../../src/components/RouteOptionsSheet';
import { InAppNavigationCard } from '../../src/components/InAppNavigationCard';
import { MapTopBar } from '../../src/components/MapTopBar';
import { MapLayersSheet } from '../../src/components/MapLayersSheet';
import { StopInfoCard } from '../../src/components/StopInfoCard';
import { PlanningRouteCard } from '../../src/components/PlanningRouteCard';
import { PlaceProposalControls } from '../../src/components/PlaceProposalControls';
import { formatDepartureLabel } from '../../src/components/DepartureTimeSheet';
import { parseTripIntent } from '../../src/services/chat/tripIntent';
import {
  chatPhaseAfterRoute,
  continueAfterOriginSelect,
  createInitialChatState,
  handleChatPlaceSelect,
  handleChatQuickReply,
  handleChatUserText,
} from '../../src/services/chat/chatAgent';
import type { ChatSessionState, ChatTripRequest } from '../../src/services/chat/chatTypes';
import {
  getNextScheduledTrip,
  isFutureDeparture,
  minutesUntilDeparture,
  saveScheduledTrip,
  type ScheduledTrip,
} from '../../src/services/storage/scheduledTripsStorage';
import { scheduledTripReminderService } from '../../src/services/scheduledTrip/scheduledTripReminderService';
import { useMapVignetteLayout } from '../../src/hooks/useMapVignetteLayout';
import { useViewportStops } from '../../src/hooks/useViewportStops';
import { useMapWeather } from '../../src/hooks/useMapWeather';
import { useTransitStore } from '../../src/stores/transitStore';
import type {
  Coordinates,
  Route,
  SearchSuggestion,
  Stop,
  TransitLine,
  TransitLineDetail,
} from '../../src/stores/transitStore';
import { useAppStore } from '../../src/stores/appStore';
import { useUserLocation } from '../../src/hooks/useUserLocation';
import { useUserHeading } from '../../src/hooks/useUserHeading';
import { useNavigationTracking } from '../../src/hooks/useNavigationTracking';
import { gtfsService } from '../../src/services/gtfs/gtfsService';
import {
  routingService,
  fetchNearbyPOIs,
  collectRouteStops,
  collectRouteStopsSync,
  mergeRouteStops,
  findBoardingStop,
  buildRouteMapSegments,
} from '../../src/services/routing/routingService';
import {
  buildNavigationSteps,
  buildWalkingNavigationSteps,
  createWalkOnlyRoute,
  type NavigationStep,
} from '../../src/services/routing/navigationSteps';
import { searchPlacesApi, getLineDetailApi, buildRouteGeometryApi, listLineShapesApi, type LineShape } from '../../src/services/api/transitApi';
import { spacing } from '../../src/theme';
import type { Region } from 'react-native-maps';
import { defaultMapRegion, isMapRegionInServiceArea } from '../../src/utils/mapRegion';
import { isInMontpellierServiceArea } from '../../src/utils/location';
import { MONTPELLIER_BOUNDS } from '../../src/config/tam';
import { clusterId, clusterStops } from '../../src/utils/clusterStops';
import { stopMatchesEnabledModes } from '../../src/utils/transportModeFilter';
import { mergeSearchSuggestions, searchPlacesLocally } from '../../src/utils/localPlaceSearch';
import { getPlaceProposalParts } from '../../src/utils/placeProposalLabel';
import { haversineMeters, nearestPointOnPath, walkGuidanceHeading } from '../../src/utils/geo';
import type { Departure } from '../../src/stores/transitStore';
import { useTranslation } from 'react-i18next';

const SEARCH_DEBOUNCE_MS = 120;
const MIN_QUERY_LENGTH = 2;

type TripAssistPhase = 'idle' | 'pick_origin' | 'pick_destination';

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<TransitMapHandle>(null);
  const searchSeq = useRef(0);
  const routePathSeq = useRef(0);
  const hasCentered = useRef(false);
  const navigationActive = useTransitStore((state) => state.navigationActive);
  const { location, refresh: refreshLocation } = useUserLocation(true, navigationActive);
  const [showStops, setShowStops] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(defaultMapRegion());
  const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
  const [lineDetail, setLineDetail] = useState<TransitLineDetail | null>(null);
  const [networkLineShapes, setNetworkLineShapes] = useState<LineShape[]>([]);
  const [stopDeparturesLoading, setStopDeparturesLoading] = useState(false);
  const [departuresByStop, setDeparturesByStop] = useState<Record<string, Departure[]>>({});
  const [routePathsById, setRoutePathsById] = useState<Record<string, Coordinates[]>>({});
  const [enrichedRoutesById, setEnrichedRoutesById] = useState<Record<string, Route>>({});
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [routeSearchSettled, setRouteSearchSettled] = useState(false);
  const [isLoadingGeometry, setIsLoadingGeometry] = useState(false);
  const geometryInFlightRef = useRef(new Map<string, Promise<Route>>());
  const [tripOriginMode, setTripOriginMode] = useState<'gps' | 'custom'>('gps');
  const [tripOriginQuery, setTripOriginQuery] = useState('');
  const [customTripOrigin, setCustomTripOrigin] = useState<Coordinates | null>(null);
  const [departureTime, setDepartureTime] = useState(() => new Date());
  const [activeSearchField, setActiveSearchField] = useState<'origin' | 'destination'>(
    'destination'
  );
  const [tripAssistMessage, setTripAssistMessage] = useState<string | null>(null);
  const [tripAssistPhase, setTripAssistPhase] = useState<TripAssistPhase>('idle');
  const [pendingDestQuery, setPendingDestQuery] = useState<string | null>(null);
  const [savedTrip, setSavedTrip] = useState<ScheduledTrip | null>(null);
  const [tripJustSaved, setTripJustSaved] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [chatState, setChatState] = useState<ChatSessionState>(() =>
    createInitialChatState((key) => key)
  );
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const chatBusyRef = useRef(false);

  const {
    searchQuery,
    isSearching,
    activeRoute,
    routeOptions,
    selectedRouteIndex,
    previewRouteIndex,
    destinationLabel,
    originCoordinates,
    destinationCoordinates,
    mapStops,
    mapPois,
    searchSuggestions,
    searchScope,
    selectedStops,
    routeStops,
    boardingStop,
    navigationStepIndex,
    navigationSteps,
    setSearchQuery,
    setIsSearching,
    setActiveRoute,
    setRouteOptions,
    setPlannedRoutes,
    setSelectedRouteIndex,
    setPreviewRouteIndex,
    setDestinationLabel,
    setOriginCoordinates,
    setDestinationCoordinates,
    setMapStops,
    setMapPois,
    setSearchSuggestions,
    setSelectedStops,
    setRouteStops,
    setBoardingStop,
    startNavigation,
    advanceNavigationStep,
    stopNavigation,
    clearRouteNavigation,
  } = useTransitStore();

  const hapticFeedback = useAppStore((s) => s.accessibility.hapticFeedback);
  const enabledTransportModes = useAppStore((s) => s.enabledTransportModes);
  const modesKey = useMemo(
    () => [...enabledTransportModes].sort().join(','),
    [enabledTransportModes]
  );
  const planSeqRef = useRef(0);
  const prevModesKeyRef = useRef<string | null>(null);

  const applyPlannedRoutes = useCallback(
    (routes: Route[], seq: number) => {
      if (seq !== planSeqRef.current) return;

      if (!routes.length) {
        setIsPlanningRoute(false);
        setRouteSearchSettled(true);
        return;
      }

      const stops = useTransitStore.getState().mapStops;
      const quickStops = collectRouteStopsSync(routes[0], stops);
      setLineDetail(null);
      setPlannedRoutes(routes, quickStops, findBoardingStop(routes[0], quickStops));
      setIsPlanningRoute(false);
      setRouteSearchSettled(true);
    },
    [setPlannedRoutes]
  );

  const enterWalkStreetView = useCallback(
    (step: NavigationStep, coords: Coordinates, compassHeading?: number | null) => {
      const heading = walkGuidanceHeading(
        coords,
        step.pathCoordinates,
        step.to,
        compassHeading
      );
      mapRef.current?.followUser(coords, heading);
      // Seconde passe : gagne contre un éventuel fitRoute / animation overview encore en cours.
      setTimeout(() => {
        mapRef.current?.followUser(coords, heading);
      }, 450);
    },
    []
  );

  const enrichedRoutesRef = useRef(enrichedRoutesById);
  const routePathsRef = useRef(routePathsById);
  enrichedRoutesRef.current = enrichedRoutesById;
  routePathsRef.current = routePathsById;

  const fetchRouteGeometry = useCallback(
    async (
      route: Route,
      origin: Coordinates,
      destination: Coordinates,
      options?: { fit?: boolean }
    ) => {
      const cached = enrichedRoutesRef.current[route.id];
      const cachedPath = routePathsRef.current[route.id];
      if (cached?.geometry?.length && cachedPath?.length) {
        if (options?.fit) mapRef.current?.fitRoute(cachedPath);
        return cached;
      }

      const inFlight = geometryInFlightRef.current.get(route.id);
      if (inFlight) {
        const result = await inFlight;
        if (options?.fit && result.geometry?.length) {
          mapRef.current?.fitRoute(result.geometry);
        }
        return result;
      }

      const promise = (async () => {
        setIsLoadingGeometry(true);
        try {
          return await buildRouteGeometryApi(route, origin, destination);
        } finally {
          geometryInFlightRef.current.delete(route.id);
          if (geometryInFlightRef.current.size === 0) {
            setIsLoadingGeometry(false);
          }
        }
      })();

      geometryInFlightRef.current.set(route.id, promise);

      try {
        const enriched = await promise;
        setEnrichedRoutesById((prev) => ({ ...prev, [route.id]: enriched }));
        if (enriched.geometry?.length) {
          setRoutePathsById((prev) => ({ ...prev, [route.id]: enriched.geometry! }));
        }
        if (options?.fit && enriched.geometry?.length) {
          mapRef.current?.fitRoute(enriched.geometry);
        }
        return enriched;
      } catch (error) {
        geometryInFlightRef.current.delete(route.id);
        throw error;
      }
    },
    []
  );

  useEffect(() => {
    if (!originCoordinates || !destinationCoordinates || routeOptions.length === 0) return;
    // Pendant la navigation, ne pas recentrer en vue d’ensemble (écrase le POV rue).
    if (navigationActive) return;
    const preview = routeOptions[previewRouteIndex] ?? routeOptions[0];
    void fetchRouteGeometry(preview, originCoordinates, destinationCoordinates, { fit: true });
    for (const route of routeOptions) {
      if (route.id !== preview.id) {
        void fetchRouteGeometry(route, originCoordinates, destinationCoordinates);
      }
    }
  }, [
    routeOptions,
    previewRouteIndex,
    originCoordinates,
    destinationCoordinates,
    fetchRouteGeometry,
    navigationActive,
  ]);

  useEffect(() => {
    if (!location || hasCentered.current) return;
    hasCentered.current = true;
    if (isInMontpellierServiceArea(location.latitude, location.longitude)) {
      mapRef.current?.recenter(location);
    } else {
      mapRef.current?.recenter({ ...MONTPELLIER_BOUNDS.center });
      setMapRegion(defaultMapRegion());
    }
  }, [location]);

  useEffect(() => {
    const center = {
      latitude: mapRegion.latitude,
      longitude: mapRegion.longitude,
    };
    if (!isMapRegionInServiceArea(mapRegion)) {
      setMapPois([]);
      return;
    }
    fetchNearbyPOIs(center, 1500).then(setMapPois).catch(() => setMapPois([]));
  }, [mapRegion.latitude, mapRegion.longitude, mapRegion.latitudeDelta, setMapPois]);

  const itineraryVisible = routeOptions.length > 0 || navigationActive;
  const viewportStopsEnabled = showStops && !lineDetail && !itineraryVisible;

  useEffect(() => {
    let cancelled = false;

    const loadShapes = () => {
      void listLineShapesApi()
        .then((shapes) => {
          if (!cancelled && shapes.length > 0) setNetworkLineShapes(shapes);
        })
        .catch(() => {
          // Conserver les tracés déjà en mémoire si l’API est temporairement indisponible.
        });
    };

    loadShapes();
    // Nouvelle tentative si l’API démarre après l’app (ex. simulateur).
    const retry = setTimeout(loadShapes, 2500);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [modesKey]);

  const handleViewportStops = useCallback(
    (stops: Stop[]) => {
      const { routeOptions: plannedRoutes, navigationActive: navigating } =
        useTransitStore.getState();
      if (plannedRoutes.length > 0 || navigating) return;
      setMapStops(stops);
    },
    [setMapStops]
  );
  useViewportStops(mapRegion, viewportStopsEnabled, handleViewportStops);

  useEffect(() => {
    if (selectedStops.length === 0) {
      gtfsService.stopRealtimePolling();
      setDeparturesByStop({});
      setStopDeparturesLoading(false);
      return;
    }

    const stopIds = selectedStops.map((stop) => stop.id);
    setStopDeparturesLoading(true);
    gtfsService.startRealtimePollingForStops(stopIds, (nextDeparturesByStop) => {
      setDeparturesByStop(nextDeparturesByStop);
      setStopDeparturesLoading(false);
    });

    return () => gtfsService.stopRealtimePolling();
  }, [selectedStops]);

  const handleStopClusterPress = useCallback(
    (stops: Stop[]) => {
      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const filtered = stops.filter((stop) =>
        stopMatchesEnabledModes(stop, enabledTransportModes)
      );
      if (filtered.length === 0) {
        setSelectedStops([]);
        return;
      }
      const nextClusterId = clusterId(filtered);
      const currentClusterId =
        selectedStops.length > 0 ? clusterId(selectedStops) : null;
      if (currentClusterId === nextClusterId) {
        setSelectedStops([]);
        return;
      }
      setSelectedStops(filtered);
    },
    [selectedStops, setSelectedStops, hapticFeedback, enabledTransportModes]
  );

  const resolveTripOrigin = useCallback(async (): Promise<Coordinates | null> => {
    if (tripOriginMode === 'custom' && customTripOrigin) {
      return customTripOrigin;
    }
    return location ?? (await refreshLocation());
  }, [tripOriginMode, customTripOrigin, location, refreshLocation]);

  const handleNavigateToStop = useCallback(
    async (stop: Stop) => {
      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const origin = await resolveTripOrigin();
      if (!origin) return;

      const seq = ++planSeqRef.current;
      prevModesKeyRef.current = modesKey;
      setSelectedStops([]);
      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      Keyboard.dismiss();

      try {
        const startWalkingNavigation = async () => {
          const walking = await routingService.fetchWalkingRoute(origin, stop.coordinates);
          if (seq !== planSeqRef.current) return;

          const walkRoute = createWalkOnlyRoute(
            origin,
            stop.coordinates,
            stop.name,
            walking.path,
            walking.minutes
          );

          routePathSeq.current += 1;
          setRoutePathsById({ [walkRoute.id]: walking.path });
          setEnrichedRoutesById({ [walkRoute.id]: walkRoute });
          setOriginCoordinates(origin);
          setDestinationCoordinates(stop.coordinates);
          setDestinationLabel(stop.name);
          setSearchQuery('');
          setRouteOptions([]);
          setActiveRoute(walkRoute);
          setRouteStops([stop]);
          setBoardingStop(null);
          setRouteSearchSettled(false);

          const steps = buildWalkingNavigationSteps(
            origin,
            stop.coordinates,
            stop.name,
            walking.path,
            walking.minutes
          );
          startNavigation(steps);
          if (steps[0]) enterWalkStreetView(steps[0], origin, null);

          if (hapticFeedback) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        };

        const routes = await routingService.planRoutes(
          origin,
          stop.coordinates,
          3,
          departureTime,
          enabledTransportModes
        );
        if (seq !== planSeqRef.current) return;

        if (routes.length > 0) {
          routePathSeq.current += 1;
          setRoutePathsById({});
          setEnrichedRoutesById({});
          setOriginCoordinates(origin);
          setDestinationCoordinates(stop.coordinates);
          setDestinationLabel(stop.name);
          setSearchQuery('');
          stopNavigation();
          setActiveRoute(null);
          applyPlannedRoutes(routes, seq);
          if (hapticFeedback) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return;
        }

        // Marche seule uniquement pour les arrêts vraiment proches.
        const walkMeters = haversineMeters(origin, stop.coordinates);
        if (walkMeters <= 2_500) {
          await startWalkingNavigation();
          return;
        }

        setOriginCoordinates(origin);
        setDestinationCoordinates(stop.coordinates);
        setDestinationLabel(stop.name);
        setSearchQuery('');
        setRouteSearchSettled(true);
        if (hapticFeedback) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch {
        if (seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
        }
      } finally {
        if (seq === planSeqRef.current) setIsPlanningRoute(false);
      }
    },
    [
      modesKey,
      resolveTripOrigin,
      departureTime,
      hapticFeedback,
      enabledTransportModes,
      setSelectedStops,
      setOriginCoordinates,
      setDestinationCoordinates,
      setDestinationLabel,
      setSearchQuery,
      setActiveRoute,
      setRouteOptions,
      setRouteStops,
      setBoardingStop,
      stopNavigation,
      startNavigation,
      applyPlannedRoutes,
      enterWalkStreetView,
    ]
  );

  const handleCloseStopInfo = useCallback(() => {
    setSelectedStops([]);
  }, [setSelectedStops]);

  const handleLineSelect = useCallback(
    async (line: TransitLine | null) => {
      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setLayersSheetOpen(false);

      if (!line) {
        setSelectedLine(null);
        setLineDetail(null);
        return;
      }

      setSelectedLine(line);
      setSelectedStops([]);

      try {
        const detail = await getLineDetailApi(line.id);
        setLineDetail(detail);
        if (detail.shape.length > 1) {
          mapRef.current?.fitRoute(detail.shape);
        }
      } catch {
        // Fallback : tracé déjà chargé avec le réseau
        const segs = networkLineShapes.filter((s) => s.id === line.id);
        const shape = segs.flatMap((s) => s.coordinates);
        if (shape.length > 1) {
          setLineDetail({
            id: line.id,
            shortName: line.shortName,
            longName: line.longName,
            color: line.color,
            mode: line.mode,
            directions: [],
            stops: [],
            shape,
          });
          mapRef.current?.fitRoute(shape);
        } else {
          setLineDetail(null);
        }
      }
    },
    [hapticFeedback, setSelectedStops, networkLineShapes]
  );

  const handleMapRegionChange = useCallback((region: Region) => {
    // Évite les re-renders à haute fréquence (marqueurs / météo qui clignotent).
    setMapRegion((prev) => {
      const sameCell =
        prev.latitude.toFixed(3) === region.latitude.toFixed(3) &&
        prev.longitude.toFixed(3) === region.longitude.toFixed(3) &&
        Math.abs(prev.latitudeDelta - region.latitudeDelta) < prev.latitudeDelta * 0.08;
      return sameCell ? prev : region;
    });
  }, []);

  const previewItineraryRoute = routeOptions[previewRouteIndex] ?? activeRoute;
  const previewRouteForStops = useMemo(() => {
    if (!previewItineraryRoute) return null;
    const enriched = enrichedRoutesById[previewItineraryRoute.id];
    if (enriched?.itineraryStopIds?.length) return enriched;
    return previewItineraryRoute;
  }, [previewItineraryRoute, enrichedRoutesById]);

  const visibleStops = useMemo(() => {
    if (itineraryVisible && previewRouteForStops) {
      return mergeRouteStops(previewRouteForStops, routeStops, mapStops);
    }
    if (itineraryVisible) return routeStops;
    if (lineDetail) return [];
    return showStops ? mapStops : [];
  }, [
    lineDetail,
    itineraryVisible,
    previewRouteForStops,
    routeStops,
    mapStops,
    showStops,
  ]);

  useEffect(() => {
    if (!itineraryVisible || !previewRouteForStops) return;

    let cancelled = false;
    const cachedStops = useTransitStore.getState().mapStops;

    void collectRouteStops(previewRouteForStops, cachedStops).then((fullStops) => {
      if (cancelled) return;
      setRouteStops(fullStops);
      setBoardingStop(findBoardingStop(previewRouteForStops, fullStops));
    });

    return () => {
      cancelled = true;
    };
  }, [
    itineraryVisible,
    previewRouteForStops,
    setRouteStops,
    setBoardingStop,
  ]);

  const lineStops = lineDetail?.stops ?? [];
  const mapDisplayStops = useMemo(() => {
    // Pendant un itinéraire, ne montrer que les arrêts de l’itinéraire (pas le détail de ligne).
    if (itineraryVisible) return visibleStops;
    const base = lineStops.length > 0 ? lineStops : visibleStops;
    if (lineStops.length > 0) return base;
    return base.filter((stop) => stopMatchesEnabledModes(stop, enabledTransportModes));
  }, [
    lineStops,
    visibleStops,
    itineraryVisible,
    enabledTransportModes,
  ]);
  const stopClusters = useMemo(
    () => clusterStops(mapDisplayStops, mapRegion.latitudeDelta),
    [mapDisplayStops, mapRegion.latitudeDelta]
  );
  const selectedStopIds = useMemo(
    () => selectedStops.map((stop) => stop.id),
    [selectedStops]
  );
  const lineCoordinates = routeOptions.length > 0 || navigationActive ? undefined : lineDetail?.shape;
  const layersActive = showStops || showPois || selectedLine != null;

  const previewRoute = routeOptions[previewRouteIndex] ?? activeRoute;
  const navigationRoute =
    navigationActive
      ? (routeOptions[selectedRouteIndex] ?? activeRoute)
      : activeRoute;
  const displayedRoute = navigationActive ? navigationRoute ?? previewRoute : previewRoute;
  const displayedPath = displayedRoute ? routePathsById[displayedRoute.id] : undefined;
  const displayedEnrichedRoute = displayedRoute
    ? enrichedRoutesById[displayedRoute.id] ?? displayedRoute
    : undefined;
  const routeMapSegments = useMemo(
    () => buildRouteMapSegments(displayedEnrichedRoute),
    [displayedEnrichedRoute]
  );

  const currentNavigationStep = navigationActive
    ? navigationSteps[navigationStepIndex]
    : undefined;

  const walkNavigationActive =
    navigationActive && currentNavigationStep?.kind === 'walk';
  const userHeading = useUserHeading(!!walkNavigationActive);

  useNavigationTracking({
    navigationActive,
    navigationStepIndex,
    navigationSteps,
    currentStep: currentNavigationStep,
    location,
    hapticFeedback,
    advanceNavigationStep,
  });

  const lastFollowAtRef = useRef(0);
  const lastFollowHeadingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!navigationActive || !location || !currentNavigationStep) return;
    const now = Date.now();
    const isWalk = currentNavigationStep.kind === 'walk';
    const guidanceHeading = isWalk
      ? walkGuidanceHeading(
          location,
          currentNavigationStep.pathCoordinates,
          currentNavigationStep.to,
          userHeading
        )
      : userHeading ?? 0;
    const headingDelta =
      lastFollowHeadingRef.current != null
        ? Math.abs(guidanceHeading - lastFollowHeadingRef.current)
        : 999;
    const headingChanged = headingDelta > 6 && headingDelta < 354;
    if (now - lastFollowAtRef.current < 250 && !headingChanged) return;
    lastFollowAtRef.current = now;
    lastFollowHeadingRef.current = guidanceHeading;
    // Centre la position au milieu de la zone carte visible (mapPadding).
    mapRef.current?.followUser(
      location,
      isWalk ? guidanceHeading : 0,
      isWalk ? undefined : { altitude: 420, zoom: 16.2 }
    );
  }, [
    navigationActive,
    location?.latitude,
    location?.longitude,
    userHeading,
    currentNavigationStep,
  ]);

  // Entrée / retour en vue guidage dès qu’une étape commence.
  useEffect(() => {
    if (!navigationActive || !currentNavigationStep) return;
    const coords = location ?? currentNavigationStep.from;
    if (currentNavigationStep.kind === 'walk') {
      enterWalkStreetView(currentNavigationStep, coords, userHeading);
    } else {
      mapRef.current?.followUser(coords, 0, { altitude: 420, zoom: 16.2 });
    }
  }, [navigationActive, navigationStepIndex]);

  const fullRoutePath = useMemo(() => {
    if (displayedPath?.length) return displayedPath;
    if (routeMapSegments.length > 0) {
      return routeMapSegments.flatMap((segment) => segment.coordinates);
    }
    return undefined;
  }, [displayedPath, routeMapSegments]);

  const activeStepPath =
    navigationActive && currentNavigationStep?.pathCoordinates?.length
      ? currentNavigationStep.pathCoordinates
      : undefined;

  const routeProgressCoordinate = useMemo(() => {
    if (!navigationActive || !location) return null;
    const path =
      (fullRoutePath && fullRoutePath.length >= 2 ? fullRoutePath : null) ??
      (activeStepPath && activeStepPath.length >= 2 ? activeStepPath : null);
    if (!path) return null;
    return nearestPointOnPath(location, path);
  }, [navigationActive, location, fullRoutePath, activeStepPath]);

  const activeMapPath =
    displayedPath?.length
      ? displayedPath
      : activeStepPath;

  // Pendant la navigation, followUser centre la position — pas de fitRoute.

  const handlePreviewRoute = useCallback(
    (index: number) => {
      setPreviewRouteIndex(index);
      const route = routeOptions[index];
      const path = route ? routePathsById[route.id] : undefined;
      if (path?.length && originCoordinates && destinationCoordinates) {
        mapRef.current?.fitRoute(path);
        return;
      }
      if (route && originCoordinates && destinationCoordinates) {
        void fetchRouteGeometry(route, originCoordinates, destinationCoordinates, { fit: true });
      }
    },
    [routeOptions, routePathsById, originCoordinates, destinationCoordinates, setPreviewRouteIndex, fetchRouteGeometry]
  );

  const handleStartRoute = useCallback(
    async (index: number) => {
      const route = routeOptions[index];
      const origin = originCoordinates;
      const destination = destinationCoordinates;
      if (!route || !origin || !destination) return;

      setSelectedRouteIndex(index);
      Keyboard.dismiss();

      const enriched = await fetchRouteGeometry(route, origin, destination, { fit: false });
      setActiveRoute(enriched);
      const stops = await collectRouteStops(enriched, mapStops);
      setRouteStops(stops);
      setBoardingStop(findBoardingStop(enriched, stops));

      const steps = buildNavigationSteps(enriched, origin, destination, stops);
      startNavigation(steps);

      const firstStep = steps[0];
      const followCoords = location ?? origin;
      if (firstStep?.kind === 'walk') {
        enterWalkStreetView(firstStep, followCoords, null);
      } else {
        mapRef.current?.followUser(followCoords, 0, { altitude: 420, zoom: 16.2 });
      }

      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [
      routeOptions,
      originCoordinates,
      destinationCoordinates,
      location,
      mapStops,
      setSelectedRouteIndex,
      setActiveRoute,
      setRouteStops,
      setBoardingStop,
      startNavigation,
      fetchRouteGeometry,
      enterWalkStreetView,
      hapticFeedback,
    ]
  );

  const resolveDestination = useCallback(
    async (coords: Coordinates, label?: string) => {
      const seq = ++planSeqRef.current;
      prevModesKeyRef.current = modesKey;
      searchSeq.current += 1;
      routePathSeq.current += 1;
      geometryInFlightRef.current.clear();
      setSearchSuggestions([]);
      setIsSearching(false);
      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      setRoutePathsById({});
      setEnrichedRoutesById({});
      setSelectedLine(null);
      setLineDetail(null);
      Keyboard.dismiss();

      // Enregistrer la destination tout de suite (même si l’origine GPS n’est pas prête).
      setDestinationCoordinates(coords);
      setDestinationLabel(label ?? null);
      setSearchQuery(label ?? '');
      setActiveSearchField('destination');
      stopNavigation();
      setActiveRoute(null);
      setRouteOptions([]);

      const origin =
        (await resolveTripOrigin()) ??
        (location
          ? location
          : isMapRegionInServiceArea(mapRegion)
            ? { latitude: mapRegion.latitude, longitude: mapRegion.longitude }
            : { ...MONTPELLIER_BOUNDS.center });

      setOriginCoordinates(origin);

      try {
        const routes = await routingService.planRoutes(
          origin,
          coords,
          3,
          departureTime,
          enabledTransportModes
        );
        applyPlannedRoutes(routes, seq);

        if (seq === planSeqRef.current && routes.length > 0 && hapticFeedback) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        if (seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
        }
      }
    },
    [
      modesKey,
      resolveTripOrigin,
      departureTime,
      location,
      mapRegion,
      setOriginCoordinates,
      setDestinationCoordinates,
      setDestinationLabel,
      setSearchSuggestions,
      setActiveRoute,
      setRouteOptions,
      setSearchQuery,
      stopNavigation,
      setIsSearching,
      hapticFeedback,
      enabledTransportModes,
      applyPlannedRoutes,
    ]
  );

  useEffect(() => {
    if (selectedStops.length === 0) return;
    const next = selectedStops.filter((stop) =>
      stopMatchesEnabledModes(stop, enabledTransportModes)
    );
    if (next.length === selectedStops.length) return;
    setSelectedStops(next);
  }, [enabledTransportModes, selectedStops, setSelectedStops]);

  useEffect(() => {
    if (!destinationCoordinates) {
      prevModesKeyRef.current = modesKey;
      return;
    }

    if (prevModesKeyRef.current === modesKey) return;
    prevModesKeyRef.current = modesKey;

    const seq = ++planSeqRef.current;
    let cancelled = false;

    const replan = async () => {
      const origin =
        (tripOriginMode === 'custom' ? customTripOrigin : null) ??
        originCoordinates ??
        location ??
        (await refreshLocation());
      if (!origin || cancelled || seq !== planSeqRef.current) return;

      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      setRoutePathsById({});
      setEnrichedRoutesById({});
      setRouteOptions([]);

      try {
        const routes = await routingService.planRoutes(
          origin,
          destinationCoordinates,
          3,
          departureTime,
          enabledTransportModes
        );
        if (cancelled || seq !== planSeqRef.current) return;
        applyPlannedRoutes(routes, seq);
      } catch {
        if (!cancelled && seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
        }
      }
    };

    void replan();
    return () => {
      cancelled = true;
    };
  }, [
    modesKey,
    destinationCoordinates,
    originCoordinates,
    location,
    refreshLocation,
    enabledTransportModes,
    departureTime,
    tripOriginMode,
    customTripOrigin,
    applyPlannedRoutes,
    setRouteOptions,
  ]);

  useEffect(() => {
    if (!destinationCoordinates || navigationActive) return;
    if (tripOriginMode === 'custom' && !customTripOrigin) return;
    // En chat, runChatTrip planifie déjà avec l’origine / l’heure exactes —
    // éviter un second plan qui invalide le seq et affiche un faux « aucun trajet ».
    if (chatActive) return;

    const seq = ++planSeqRef.current;
    let cancelled = false;

    const replan = async () => {
      const origin = await resolveTripOrigin();
      if (!origin || cancelled || seq !== planSeqRef.current) return;

      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      setRoutePathsById({});
      setEnrichedRoutesById({});
      setRouteOptions([]);
      setOriginCoordinates(origin);

      try {
        const routes = await routingService.planRoutes(
          origin,
          destinationCoordinates,
          3,
          departureTime,
          enabledTransportModes
        );
        if (cancelled || seq !== planSeqRef.current) return;
        applyPlannedRoutes(routes, seq);
      } catch {
        if (!cancelled && seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
        }
      }
    };

    void replan();
    return () => {
      cancelled = true;
    };
    // Intentionally tied to departure / custom origin changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureTime, tripOriginMode, customTripOrigin, chatActive]);

  useEffect(() => {
    if (destinationCoordinates && activeSearchField === 'destination') {
      setSearchSuggestions([]);
      return;
    }

    const query =
      activeSearchField === 'origin' ? tripOriginQuery.trim() : searchQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSearchSuggestions([]);
      setIsSearching(false);
      return;
    }

    const localResults = searchPlacesLocally(query, mapStops);
    setSearchSuggestions(localResults);

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);

      try {
        const bias =
          activeSearchField === 'origin'
            ? location
            : customTripOrigin ?? location;
        const places = await searchPlacesApi(query, {
          scope: searchScope,
          userLat: bias?.latitude ?? mapRegion.latitude,
          userLon: bias?.longitude ?? mapRegion.longitude,
        });

        if (seq !== searchSeq.current) return;
        if (destinationCoordinates && activeSearchField === 'destination') return;

        setSearchSuggestions(mergeSearchSuggestions(localResults, places));
      } catch {
        if (seq === searchSeq.current) {
          setSearchSuggestions(localResults);
        }
      } finally {
        if (seq === searchSeq.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    searchQuery,
    tripOriginQuery,
    activeSearchField,
    searchScope,
    location,
    customTripOrigin,
    mapStops,
    mapRegion.latitude,
    mapRegion.longitude,
    destinationCoordinates,
    setSearchSuggestions,
    setIsSearching,
  ]);

  const handleChangeText = useCallback(
    (text: string) => {
      setActiveSearchField('destination');
      setSearchQuery(text);
      if (tripAssistPhase !== 'pick_destination' && tripAssistPhase !== 'pick_origin') {
        setTripAssistMessage(null);
      }
      if (!text.trim()) {
        searchSeq.current += 1;
        routePathSeq.current += 1;
        setSearchSuggestions([]);
        setIsSearching(false);
        setIsPlanningRoute(false);
        setRouteSearchSettled(false);
        setRoutePathsById({});
        setEnrichedRoutesById({});
        clearRouteNavigation();
        return;
      }
      // Nouvelle saisie = nouvelle destination (annuler le choix précédent).
      if (destinationCoordinates) {
        setDestinationCoordinates(null);
        setDestinationLabel(null);
      }
      if (text.trim().length >= MIN_QUERY_LENGTH) {
        setSelectedStops([]);
      }
      if (routeOptions.length > 0 || destinationCoordinates) {
        routePathSeq.current += 1;
        setRoutePathsById({});
        setEnrichedRoutesById({});
        setIsPlanningRoute(false);
        clearRouteNavigation();
        stopNavigation();
      }
    },
    [
      tripAssistPhase,
      setSearchQuery,
      setSearchSuggestions,
      setIsSearching,
      clearRouteNavigation,
      stopNavigation,
      setSelectedStops,
      setDestinationCoordinates,
      setDestinationLabel,
      routeOptions.length,
      destinationCoordinates,
    ]
  );

  const handleOriginChange = useCallback(
    (text: string) => {
      setActiveSearchField('origin');
      setTripOriginMode('custom');
      setTripOriginQuery(text);
      setCustomTripOrigin(null);
      if (!text.trim()) {
        setTripOriginMode('gps');
        setSearchSuggestions([]);
      }
    },
    [setSearchSuggestions]
  );

  const resolvePlaceQuery = useCallback(
    async (query: string): Promise<SearchSuggestion[]> => {
      const local = searchPlacesLocally(query, mapStops);
      try {
        const places = await searchPlacesApi(query, {
          scope: searchScope,
          userLat: location?.latitude ?? mapRegion.latitude,
          userLon: location?.longitude ?? mapRegion.longitude,
          limit: 8,
        });
        return mergeSearchSuggestions(local, places).slice(0, 8);
      } catch {
        return local.slice(0, 8);
      }
    },
    [mapStops, searchScope, location, mapRegion.latitude, mapRegion.longitude]
  );

  const chatCtx = useMemo(
    () => ({
      userLocation: location,
      mapStops,
      t: (key: string, opts?: Record<string, string | number>) => t(key, opts),
      resolveUserLocation: refreshLocation,
    }),
    [location, mapStops, t, refreshLocation]
  );

  const runChatTrip = useCallback(
    async (trip: ChatTripRequest) => {
      // Appliquer l’origine / l’heure du trajet chat (pas le state React encore stale).
      setDepartureTime(trip.departureTime);
      setTripOriginMode('custom');
      setCustomTripOrigin(trip.origin);
      setTripOriginQuery(trip.originLabel);
      setSearchQuery(trip.destinationLabel);
      setTripJustSaved(false);

      const seq = ++planSeqRef.current;
      prevModesKeyRef.current = modesKey;
      searchSeq.current += 1;
      routePathSeq.current += 1;
      geometryInFlightRef.current.clear();
      setSearchSuggestions([]);
      setIsSearching(false);
      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      setRoutePathsById({});
      setEnrichedRoutesById({});
      setSelectedLine(null);
      setLineDetail(null);
      Keyboard.dismiss();

      setOriginCoordinates(trip.origin);
      setDestinationCoordinates(trip.destination);
      setDestinationLabel(trip.destinationLabel);
      setActiveSearchField('destination');
      stopNavigation();
      setActiveRoute(null);
      setRouteOptions([]);

      try {
        const routes = await routingService.planRoutes(
          trip.origin,
          trip.destination,
          3,
          trip.departureTime,
          enabledTransportModes
        );

        if (seq !== planSeqRef.current) {
          // Un autre replan a pris le relais : lire le résultat courant.
          const current = useTransitStore.getState().routeOptions;
          if (current[0]) {
            const best = current[0];
            const summary = t('chat.routeSummary', {
              duration: best.totalDurationMinutes,
              walk: best.walkingMinutes,
              departure: best.departureTime.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              arrival: best.arrivalTime.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            });
            setChatState((prev) => {
              const next = chatPhaseAfterRoute(prev, summary, true, (key) => t(key));
              chatStateRef.current = next;
              return next;
            });
          }
          return;
        }

        applyPlannedRoutes(routes, seq);

        const best = routes[0];
        if (!best) {
          setChatState((prev) => {
            const next = chatPhaseAfterRoute(prev, t('chat.noRoute'), false, (key) => t(key));
            chatStateRef.current = next;
            return next;
          });
          return;
        }

        if (hapticFeedback) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        const summary = t('chat.routeSummary', {
          duration: best.totalDurationMinutes,
          walk: best.walkingMinutes,
          departure: best.departureTime.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          arrival: best.arrivalTime.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
        setChatState((prev) => {
          const next = chatPhaseAfterRoute(prev, summary, true, (key) => t(key));
          chatStateRef.current = next;
          return next;
        });
      } catch {
        if (seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
          setChatState((prev) => {
            const next = chatPhaseAfterRoute(prev, t('chat.noRoute'), false, (key) => t(key));
            chatStateRef.current = next;
            return next;
          });
        }
      }
    },
    [
      modesKey,
      enabledTransportModes,
      applyPlannedRoutes,
      stopNavigation,
      setSearchQuery,
      setSearchSuggestions,
      setIsSearching,
      setOriginCoordinates,
      setDestinationCoordinates,
      setDestinationLabel,
      setActiveRoute,
      setRouteOptions,
      hapticFeedback,
      t,
    ]
  );

  const applyChatResult = useCallback(
    async (result: { state: ChatSessionState; tripRequest?: ChatTripRequest }) => {
      setChatState(result.state);
      chatStateRef.current = result.state;
      if (result.state.pendingSuggestions?.length) {
        setSearchSuggestions(result.state.pendingSuggestions);
        setFocusedProposalIndex(0);
      } else {
        setSearchSuggestions([]);
      }
      if (result.tripRequest) {
        await runChatTrip(result.tripRequest);
      }
    },
    [runChatTrip, setSearchSuggestions]
  );

  const onChatSend = useCallback(
    async (text: string) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      try {
        const result = await handleChatUserText(chatStateRef.current, text, chatCtx);
        await applyChatResult(result);
      } finally {
        chatBusyRef.current = false;
      }
    },
    [chatCtx, applyChatResult]
  );

  const onChatQuickReply = useCallback(
    async (id: string) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      try {
        const result = await handleChatQuickReply(chatStateRef.current, id, chatCtx);
        await applyChatResult(result);
      } finally {
        chatBusyRef.current = false;
      }
    },
    [chatCtx, applyChatResult]
  );

  const onChatPlaceSelect = useCallback(
    async (place: SearchSuggestion) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      try {
        let result = handleChatPlaceSelect(chatStateRef.current, place, chatCtx);
        if (result.state.pendingDestQuery && result.state.origin && !result.state.destination) {
          result = await continueAfterOriginSelect(result.state, chatCtx);
        } else if (
          !result.tripRequest &&
          result.state.origin &&
          result.state.destination &&
          result.state.departureTime &&
          result.state.phase !== 'planning' &&
          result.state.phase !== 'done'
        ) {
          result = await continueAfterOriginSelect(result.state, chatCtx);
        }
        await applyChatResult(result);
      } finally {
        chatBusyRef.current = false;
      }
    },
    [chatCtx, applyChatResult]
  );

  const openAssistChat = useCallback(
    async (phrase: string) => {
      setChatActive(true);
      setTripAssistMessage(null);
      setTripAssistPhase('idle');
      const initial = createInitialChatState((key) => t(key));
      chatStateRef.current = initial;
      setChatState(initial);
      await onChatSend(phrase);
    },
    [t, onChatSend]
  );

  const closeAssistChat = useCallback(() => {
    setChatActive(false);
    chatBusyRef.current = false;
    setChatState(createInitialChatState((key) => t(key)));
    setSearchSuggestions([]);
  }, [t, setSearchSuggestions]);

  const beginDestinationPick = useCallback(
    async (destQuery: string) => {
      setActiveSearchField('destination');
      setSearchQuery(destQuery);
      setTripAssistPhase('pick_destination');

      const destinations = await resolvePlaceQuery(destQuery);
      if (destinations.length === 0) {
        setTripAssistMessage(t('chat.destinationNotFound'));
        setSearchSuggestions([]);
        return false;
      }
      if (destinations.length > 1) {
        setDestinationCoordinates(null);
        setDestinationLabel(null);
        setSearchSuggestions(destinations);
        setTripAssistMessage(t('tripAssist.chooseDestination'));
        return false;
      }

      const label = destinations[0].displayName || destinations[0].name;
      setTripAssistMessage(t('tripAssist.destinationSet', { destination: label }));
      setTripAssistPhase('idle');
      setPendingDestQuery(null);
      setSearchSuggestions([]);
      await resolveDestination(destinations[0].coordinates, label);
      return true;
    },
    [
      t,
      resolvePlaceQuery,
      resolveDestination,
      setSearchQuery,
      setSearchSuggestions,
      setDestinationCoordinates,
      setDestinationLabel,
    ]
  );

  const handleUseMyLocation = useCallback(() => {
    setTripOriginMode('gps');
    setTripOriginQuery('');
    setCustomTripOrigin(null);
    setActiveSearchField('destination');
    setSearchSuggestions([]);
    if (tripAssistPhase === 'pick_origin') {
      const nextDest = pendingDestQuery ?? searchQuery.trim();
      setTripAssistMessage(t('tripAssist.originSet', { origin: t('trip.origin') }));
      if (nextDest) {
        void (async () => {
          setIsSearching(true);
          try {
            await beginDestinationPick(nextDest);
          } finally {
            setIsSearching(false);
          }
        })();
      } else {
        setTripAssistPhase('pick_destination');
        setTripAssistMessage(t('tripAssist.chooseDestination'));
      }
    }
  }, [
    setSearchSuggestions,
    tripAssistPhase,
    pendingDestQuery,
    searchQuery,
    beginDestinationPick,
    setIsSearching,
    t,
  ]);

  const handleSubmitSearch = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      Keyboard.dismiss();
      setIsSearching(true);
      setTripAssistMessage(null);
      setTripJustSaved(false);

      try {
        const intent = parseTripIntent(text);

        // Phrase complète → mode conversation (chat) sur la page carte
        if (intent.isStructured && tripAssistPhase === 'idle') {
          setIsSearching(false);
          await openAssistChat(text);
          return;
        }

        // Pendant le wizard carte, une saisie courte = refinement du champ actif
        if (
          (tripAssistPhase === 'pick_origin' || tripAssistPhase === 'pick_destination') &&
          text.split(/\s+/).length <= 4 &&
          !intent.isStructured
        ) {
          const field = tripAssistPhase === 'pick_origin' ? 'origin' : 'destination';
          setActiveSearchField(field);
          const places = await resolvePlaceQuery(text);
          if (places.length === 0) {
            setTripAssistMessage(
              field === 'origin' ? t('tripAssist.askOrigin') : t('chat.destinationNotFound')
            );
            setSearchSuggestions([]);
            return;
          }
          setSearchSuggestions(places);
          setTripAssistMessage(
            field === 'origin'
              ? t('tripAssist.chooseOrigin')
              : t('tripAssist.chooseDestination')
          );
          if (field === 'origin') {
            setTripOriginMode('custom');
            setTripOriginQuery(text);
            setCustomTripOrigin(null);
          } else {
            setSearchQuery(text);
          }
          return;
        }

        if (intent.departureTime) {
          setDepartureTime(intent.departureTime);
        }

        if (intent.missing.includes('when') && intent.isStructured) {
          setTripAssistMessage(t('tripAssist.askWhen'));
          return;
        }

        if (
          intent.missing.includes('destination') ||
          (intent.isStructured && !intent.destinationQuery)
        ) {
          if (!intent.destinationQuery) {
            setTripAssistMessage(t('tripAssist.askDestination'));
            setTripAssistPhase('pick_destination');
            return;
          }
        }

        const destQuery = intent.destinationQuery ?? text;

        // Origine explicite → confirmation guidée avant la destination
        if (intent.originQuery) {
          setActiveSearchField('origin');
          setTripOriginMode('custom');
          setTripOriginQuery(intent.originQuery);
          setCustomTripOrigin(null);
          setPendingDestQuery(destQuery);
          setSearchQuery(destQuery);

          const origins = await resolvePlaceQuery(intent.originQuery);
          if (origins.length === 0) {
            setTripAssistPhase('pick_origin');
            setTripAssistMessage(t('tripAssist.askOrigin'));
            setSearchSuggestions([]);
            return;
          }

          setTripAssistPhase('pick_origin');
          setSearchSuggestions(origins);
          setTripAssistMessage(t('tripAssist.chooseOrigin'));

          if (origins.length === 1) {
            setCustomTripOrigin(origins[0].coordinates);
            setTripOriginQuery(origins[0].displayName || origins[0].name);
            setTripAssistMessage(
              t('tripAssist.originSet', {
                origin: origins[0].displayName || origins[0].name,
              })
            );
            setSearchSuggestions([]);
            await beginDestinationPick(destQuery);
          }
          return;
        }

        if (intent.useCurrentLocationOrigin) {
          setTripOriginMode('gps');
          setTripOriginQuery('');
          setCustomTripOrigin(null);
        }

        setPendingDestQuery(null);
        await beginDestinationPick(destQuery);
      } finally {
        setIsSearching(false);
      }
    },
    [
      t,
      tripAssistPhase,
      resolvePlaceQuery,
      beginDestinationPick,
      openAssistChat,
      setSearchQuery,
      setSearchSuggestions,
      setIsSearching,
    ]
  );

  const handleDepartureChange = useCallback((date: Date) => {
    setDepartureTime(date);
    setTripJustSaved(false);
    setTripAssistMessage((msg) =>
      msg === t('tripAssist.askWhen') ? null : msg
    );
  }, [t]);

  const handleSuggestionSelect = useCallback(
    (suggestion: SearchSuggestion, field: 'origin' | 'destination' = activeSearchField) => {
      const label = suggestion.displayName || suggestion.name;

      if (field === 'origin' || tripAssistPhase === 'pick_origin') {
        setTripOriginMode('custom');
        setCustomTripOrigin(suggestion.coordinates);
        setTripOriginQuery(label);
        setSearchSuggestions([]);
        setActiveSearchField('destination');

        const nextDest = pendingDestQuery ?? searchQuery.trim();
        setTripAssistMessage(t('tripAssist.originSet', { origin: label }));

        if (nextDest) {
          void (async () => {
            setIsSearching(true);
            try {
              await beginDestinationPick(nextDest);
            } finally {
              setIsSearching(false);
            }
          })();
        } else {
          setTripAssistPhase('pick_destination');
          setTripAssistMessage(t('tripAssist.chooseDestination'));
        }
        return;
      }

      setSearchSuggestions([]);
      setTripAssistPhase('idle');
      setPendingDestQuery(null);
      setTripAssistMessage(t('tripAssist.destinationSet', { destination: label }));
      void resolveDestination(suggestion.coordinates, label);
    },
    [
      activeSearchField,
      tripAssistPhase,
      pendingDestQuery,
      searchQuery,
      beginDestinationPick,
      resolveDestination,
      setSearchSuggestions,
      setIsSearching,
      t,
    ]
  );

  const refreshSavedTrip = useCallback(async () => {
    const next = await scheduledTripReminderService.tick();
    setSavedTrip(next);
    if (next) {
      const mins = minutesUntilDeparture(new Date(next.departureTimeIso));
      if (mins <= scheduledTripReminderService.leadMinutes && mins >= -5) {
        setTripAssistMessage(
          t('tripAssist.leaveSoon', { destination: next.destinationLabel })
        );
      }
    }
  }, [t]);

  useEffect(() => {
    void refreshSavedTrip();
    const id = setInterval(() => {
      void refreshSavedTrip();
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshSavedTrip]);

  const handleSaveTrip = useCallback(async () => {
    if (!destinationCoordinates || !destinationLabel) return;
    const origin =
      (await resolveTripOrigin()) ??
      originCoordinates ??
      location;
    if (!origin) return;

    const originLabel =
      tripOriginMode === 'gps'
        ? t('trip.origin')
        : tripOriginQuery || t('trip.origin');

    const saved = await saveScheduledTrip({
      originLabel,
      origin,
      destinationLabel,
      destination: destinationCoordinates,
      departureTimeIso: departureTime.toISOString(),
      summary: `${originLabel} → ${destinationLabel}`,
    });
    await scheduledTripReminderService.scheduleNotification(saved);
    setSavedTrip(saved);
    setTripJustSaved(true);
    setTripAssistMessage(t('tripAssist.tripSaved'));
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [
    destinationCoordinates,
    destinationLabel,
    resolveTripOrigin,
    originCoordinates,
    location,
    tripOriginMode,
    tripOriginQuery,
    departureTime,
    hapticFeedback,
    t,
  ]);

  const handleOpenSavedTrip = useCallback(async () => {
    const trip = savedTrip ?? (await getNextScheduledTrip());
    if (!trip) return;
    setSavedTrip(trip);
    setTripJustSaved(true);
    setTripOriginMode('custom');
    setCustomTripOrigin(trip.origin);
    setTripOriginQuery(trip.originLabel);
    setDepartureTime(new Date(trip.departureTimeIso));
    setTripAssistMessage(
      t('tripAssist.savedTripHint', { destination: trip.destinationLabel })
    );
    await resolveDestination(trip.destination, trip.destinationLabel);
  }, [savedTrip, resolveDestination, t]);

  const handleRemoveSavedTrip = useCallback(async () => {
    const trip = savedTrip ?? (await getNextScheduledTrip());
    if (!trip) {
      setTripJustSaved(false);
      setSavedTrip(null);
      return;
    }
    await scheduledTripReminderService.cancelTrip(trip.id);
    setSavedTrip(null);
    setTripJustSaved(false);
    setTripAssistMessage(t('tripAssist.tripRemoved'));
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [savedTrip, hapticFeedback, t]);

  const canSaveCurrentTrip = useMemo(
    () =>
      Boolean(destinationCoordinates && destinationLabel && routeOptions.length > 0) &&
      isFutureDeparture(departureTime),
    [destinationCoordinates, destinationLabel, routeOptions.length, departureTime]
  );

  const isCurrentTripSaved = useMemo(() => {
    if (tripJustSaved && savedTrip) return true;
    if (!savedTrip || !destinationLabel) return false;
    const sameDest =
      savedTrip.destinationLabel.trim().toLowerCase() ===
      destinationLabel.trim().toLowerCase();
    const sameTime =
      Math.abs(
        new Date(savedTrip.departureTimeIso).getTime() - departureTime.getTime()
      ) < 60_000;
    return sameDest && sameTime;
  }, [tripJustSaved, savedTrip, destinationLabel, departureTime]);

  const savedTripUrgent = useMemo(() => {
    if (!savedTrip) return false;
    const mins = minutesUntilDeparture(new Date(savedTrip.departureTimeIso));
    return mins <= scheduledTripReminderService.leadMinutes;
  }, [savedTrip]);

  const handleAbortItinerary = useCallback(() => {
    planSeqRef.current += 1;
    routePathSeq.current += 1;
    searchSeq.current += 1;
    geometryInFlightRef.current.clear();
    setRoutePathsById({});
    setEnrichedRoutesById({});
    setRouteSearchSettled(false);
    setIsPlanningRoute(false);
    setIsSearching(false);
    setSearchSuggestions([]);
    setSearchQuery('');
    setSelectedStops([]);
    setSelectedLine(null);
    setLineDetail(null);
    setTripAssistPhase('idle');
    setPendingDestQuery(null);
    setTripJustSaved(false);
    setChatActive(false);
    clearRouteNavigation();
    const homeRegion =
      location && isInMontpellierServiceArea(location.latitude, location.longitude)
        ? { ...location, latitudeDelta: 0.025, longitudeDelta: 0.025 }
        : defaultMapRegion();
    setMapRegion(homeRegion);
    mapRef.current?.resetToInitialView(
      location && isInMontpellierServiceArea(location.latitude, location.longitude)
        ? location
        : { ...MONTPELLIER_BOUNDS.center }
    );
  }, [
    clearRouteNavigation,
    location,
    setSearchQuery,
    setSearchSuggestions,
    setIsSearching,
    setSelectedStops,
  ]);

  const handleCloseRouteOptions = useCallback(() => {
    handleAbortItinerary();
  }, [handleAbortItinerary]);

  const handleDismissNoRoute = useCallback(() => {
    handleAbortItinerary();
  }, [handleAbortItinerary]);

  const handleRecenter = useCallback(async () => {
    if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const coords = (await refreshLocation()) ?? location;
    if (coords) mapRef.current?.recenter(coords);
  }, [refreshLocation, location, hapticFeedback]);

  const mapNetworkLineShapes = useMemo(() => {
    if (itineraryVisible) return [];
    return networkLineShapes
      .filter((line) => enabledTransportModes.includes(line.mode))
      .map((line) => ({
        id: line.segmentId ?? line.id,
        routeId: line.id,
        color: line.color,
        coordinates: line.coordinates,
        highlighted: selectedLine?.id === line.id,
      }));
  }, [
    itineraryVisible,
    networkLineShapes,
    enabledTransportModes,
    selectedLine?.id,
  ]);

  const placeProposals = useMemo((): SearchSuggestion[] => {
    if (chatActive) {
      return chatState.pendingSuggestions ?? [];
    }
    if (destinationCoordinates && activeSearchField !== 'origin') return [];
    return searchSuggestions;
  }, [
    chatActive,
    chatState.pendingSuggestions,
    destinationCoordinates,
    activeSearchField,
    searchSuggestions,
  ]);

  const [focusedProposalIndex, setFocusedProposalIndex] = useState(0);

  const placeProposalKey = useMemo(
    () =>
      placeProposals
        .map(
          (p) =>
            `${p.coordinates.latitude.toFixed(5)},${p.coordinates.longitude.toFixed(5)}`
        )
        .join('|'),
    [placeProposals]
  );

  useEffect(() => {
    setFocusedProposalIndex(0);
  }, [placeProposalKey]);

  useEffect(() => {
    if (placeProposals.length === 0) return;
    const index = Math.min(focusedProposalIndex, placeProposals.length - 1);
    const place = placeProposals[index];
    if (!place) return;
    mapRef.current?.recenter(place.coordinates);
  }, [placeProposals, focusedProposalIndex]);

  const placeMarkers = useMemo(
    () =>
      placeProposals.map((place, index) => {
        const parts = getPlaceProposalParts(place);
        return {
          number: index + 1,
          coordinates: place.coordinates,
          name: parts.name,
          streetLine: parts.streetLine,
          city: parts.city,
          quarter: parts.quarter,
          selectHint: t('map.chooseThisDestination'),
        };
      }),
    [placeProposals, t]
  );

  const handlePlaceMarkerPress = useCallback(
    (number: number) => {
      const place = placeProposals[number - 1];
      if (!place) return;
      if (hapticFeedback) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (chatActive) {
        void onChatPlaceSelect(place);
        return;
      }
      handleSuggestionSelect(place, activeSearchField);
    },
    [
      placeProposals,
      chatActive,
      onChatPlaceSelect,
      handleSuggestionSelect,
      hapticFeedback,
      activeSearchField,
    ]
  );

  const handlePrevPlaceProposal = useCallback(() => {
    if (placeProposals.length < 2) return;
    if (hapticFeedback) {
      void Haptics.selectionAsync();
    }
    setFocusedProposalIndex((i) => (i - 1 + placeProposals.length) % placeProposals.length);
  }, [placeProposals.length, hapticFeedback]);

  const handleNextPlaceProposal = useCallback(() => {
    if (placeProposals.length < 2) return;
    if (hapticFeedback) {
      void Haptics.selectionAsync();
    }
    setFocusedProposalIndex((i) => (i + 1) % placeProposals.length);
  }, [placeProposals.length, hapticFeedback]);

  const showRouteOptions = routeOptions.length > 0 && !navigationActive;
  const showNoRouteFound =
    routeSearchSettled &&
    !!destinationCoordinates &&
    !isPlanningRoute &&
    routeOptions.length === 0 &&
    !navigationActive;
  const bottomStackHeight = navigationActive
    ? 150
    : chatActive
      ? 420
      : showRouteOptions || isPlanningRoute || showNoRouteFound
        ? 360
        : 130;
  const mapBottomClearance = bottomStackHeight + insets.bottom + spacing.lg;
  const stopInfoContentTop = insets.top + 56 + spacing.sm;
  const vignette = useMapVignetteLayout(mapBottomClearance);
  const navigationMapPadding = useMemo(
    () =>
      navigationActive
        ? {
            top: insets.top + 56,
            right: spacing.lg,
            bottom: mapBottomClearance,
            left: spacing.lg,
          }
        : undefined,
    [navigationActive, insets.top, mapBottomClearance]
  );
  const { weather: mapWeather, loading: mapWeatherLoading } = useMapWeather(mapRegion);
  const proposalArrowTop = useMemo(
    () => insets.top + (Dimensions.get('window').height - mapBottomClearance - insets.top) * 0.42,
    [insets.top, mapBottomClearance]
  );

  return (
    <View style={styles.container}>
      <View style={styles.mapLayer} pointerEvents="auto">
        <TransitMap
          ref={mapRef}
          userLocation={
            navigationActive
              ? location ?? currentNavigationStep?.from ?? null
              : location
          }
          userHeading={walkNavigationActive ? userHeading : null}
          showNavigationPuck={!!navigationActive}
          mapPadding={navigationMapPadding}
          origin={originCoordinates}
          destination={destinationCoordinates}
          routeCoordinates={routeMapSegments.length > 0 ? undefined : activeMapPath}
          routeSegments={routeMapSegments.length > 0 ? routeMapSegments : undefined}
          walkCoordinates={undefined}
          activeStepCoordinates={activeStepPath}
          progressCoordinate={routeProgressCoordinate}
          stepTarget={
            navigationActive && currentNavigationStep && currentNavigationStep.kind !== 'arrive'
              ? currentNavigationStep.to
              : null
          }
          placeMarkers={placeMarkers}
          focusedPlaceNumber={
            placeProposals.length > 0 ? focusedProposalIndex + 1 : null
          }
          onPlaceMarkerPress={handlePlaceMarkerPress}
          boardingStop={navigationActive ? boardingStop : null}
          lineCoordinates={lineCoordinates}
          lineColor={selectedLine?.color}
          networkLineShapes={mapNetworkLineShapes}
          stopClusters={stopClusters}
          pois={showPois ? mapPois : []}
          clearRadius={vignette.clearRadius}
          vignette={vignette}
          selectedStopIds={selectedStopIds}
          onStopClusterPress={handleStopClusterPress}
          onRegionChangeComplete={handleMapRegionChange}
        />
      </View>

      {selectedStops.length > 0 ? (
        <StopInfoCard
          stops={selectedStops}
          departuresByStop={departuresByStop}
          loading={stopDeparturesLoading}
          top={0}
          contentTop={stopInfoContentTop}
          userLocation={location}
          allowedModes={enabledTransportModes}
          onClose={handleCloseStopInfo}
          onNavigate={handleNavigateToStop}
        />
      ) : null}

      <MapTopBar
        top={insets.top + spacing.sm}
        weather={mapWeather}
        weatherLoading={mapWeatherLoading}
        onRecenter={handleRecenter}
        onOpenLayers={() => setLayersSheetOpen(true)}
        layersActive={layersActive}
        savedTripLabel={
          savedTrip
            ? t('tripAssist.savedTripHint', { destination: savedTrip.destinationLabel })
            : null
        }
        savedTripUrgent={savedTripUrgent}
        onOpenSavedTrip={savedTrip ? handleOpenSavedTrip : undefined}
        onRemoveSavedTrip={savedTrip ? handleRemoveSavedTrip : undefined}
        removeSavedTripLabel={t('tripAssist.removeSavedTrip')}
      />

      {placeProposals.length > 1 ? (
        <PlaceProposalControls
          total={placeProposals.length}
          arrowTop={proposalArrowTop}
          onPrev={handlePrevPlaceProposal}
          onNext={handleNextPlaceProposal}
        />
      ) : null}

      <MapLayersSheet
        visible={layersSheetOpen}
        top={insets.top + spacing.sm + 56}
        mapRegion={mapRegion}
        selectedLineId={selectedLine?.id ?? null}
        showStops={showStops}
        showPois={showPois}
        onClose={() => setLayersSheetOpen(false)}
        onToggleStops={setShowStops}
        onTogglePois={setShowPois}
        onSelectLine={handleLineSelect}
      />

      <KeyboardAvoidingView
        style={styles.bottomSheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View
          style={[styles.bottomContent, { paddingBottom: insets.bottom + spacing.sm }]}
          pointerEvents="box-none"
        >
          {navigationActive && currentNavigationStep ? (
            <InAppNavigationCard
              step={currentNavigationStep}
              stepIndex={navigationStepIndex}
              totalSteps={navigationSteps.length}
              userLocation={location}
              onStop={() => {
                handleAbortItinerary();
                if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          ) : null}

          {showRouteOptions && destinationLabel ? (
            <RouteOptionsSheet
              routes={routeOptions}
              destinationLabel={destinationLabel}
              selectedIndex={previewRouteIndex}
              onPreview={handlePreviewRoute}
              onStart={handleStartRoute}
              onClose={() => {
                handleCloseRouteOptions();
                if (chatActive) closeAssistChat();
              }}
              canSaveTrip={canSaveCurrentTrip || isCurrentTripSaved}
              onSaveTrip={handleSaveTrip}
              onRemoveSavedTrip={handleRemoveSavedTrip}
              tripSaved={isCurrentTripSaved}
            />
          ) : showNoRouteFound && !chatActive ? (
            <NoRouteFoundCard
              destinationLabel={destinationLabel}
              onClose={handleDismissNoRoute}
            />
          ) : isPlanningRoute && !chatActive ? (
            <PlanningRouteCard />
          ) : null}

          {chatActive ? (
            <ChatModePanel
              state={chatState}
              onSend={(text) => {
                void onChatSend(text);
              }}
              onQuickReply={(id) => {
                void onChatQuickReply(id);
              }}
              onClose={() => {
                if (showRouteOptions || navigationActive) {
                  handleAbortItinerary();
                }
                closeAssistChat();
              }}
              bottomInset={insets.bottom}
            />
          ) : (
            <SearchBar
              value={searchQuery}
              onChangeText={handleChangeText}
              onSubmitSearch={handleSubmitSearch}
              isLoading={isSearching || isPlanningRoute}
              originValue={tripOriginMode === 'gps' ? '' : tripOriginQuery}
              onOriginChange={handleOriginChange}
              onOriginFocus={() => setActiveSearchField('origin')}
              onDestinationFocus={() => setActiveSearchField('destination')}
              usingMyLocation={tripOriginMode === 'gps'}
              onUseMyLocation={handleUseMyLocation}
              departureLabel={formatDepartureLabel(departureTime, (key, opts) =>
                t(key, opts as Record<string, string | number> | undefined)
              )}
              departureTime={departureTime}
              onDepartureChange={handleDepartureChange}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  mapLayer: { ...StyleSheet.absoluteFill },
  bottomSheet: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 30,
    elevation: 30,
  },
  bottomContent: {
    gap: spacing.sm,
  },
});
