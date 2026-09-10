import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TransitMap, type TransitMapHandle } from '../../src/components/TransitMap';
import { SearchBar } from '../../src/components/SearchBar';
import { NoRouteFoundCard } from '../../src/components/NoRouteFoundCard';
import { RouteOptionsSheet } from '../../src/components/RouteOptionsSheet';
import { InAppNavigationCard } from '../../src/components/InAppNavigationCard';
import { AppMenuButton } from '../../src/components/AppMenuButton';
import { MapFloatingControls } from '../../src/components/MapFloatingControls';
import { MapLayersSheet } from '../../src/components/MapLayersSheet';
import { StopInfoCard } from '../../src/components/StopInfoCard';
import { PlanningRouteCard } from '../../src/components/PlanningRouteCard';
import { ChatModePanel } from '../../src/components/ChatModePanel';
import { MapModeToggle, type MapInteractionMode } from '../../src/components/MapModeToggle';
import { PlaceProposalControls } from '../../src/components/PlaceProposalControls';
import { useMapVignetteLayout } from '../../src/hooks/useMapVignetteLayout';
import { useViewportStops } from '../../src/hooks/useViewportStops';
import { MapWeatherWidget, MAP_WEATHER_WIDGET_SIZE } from '../../src/components/MapWeatherWidget';
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
import {
  createInitialChatState,
  handleChatUserText,
  handleChatQuickReply,
  handleChatPlaceSelect,
  chatPhaseAfterRoute,
  setNavigationGuidance,
} from '../../src/services/chat/chatAgent';
import {
  formatStepGuidance,
  type ChatSessionState,
  type ChatTripRequest,
} from '../../src/services/chat/chatTypes';
import { colors, spacing } from '../../src/theme';
import type { Region } from 'react-native-maps';
import { defaultMapRegion } from '../../src/utils/mapRegion';
import { clusterId, clusterStops } from '../../src/utils/clusterStops';
import { stopMatchesEnabledModes } from '../../src/utils/transportModeFilter';
import { mergeSearchSuggestions, searchPlacesLocally } from '../../src/utils/localPlaceSearch';
import { getPlaceProposalParts } from '../../src/utils/placeProposalLabel';
import { haversineMeters, nearestPointOnPath, walkGuidanceHeading } from '../../src/utils/geo';
import type { Departure } from '../../src/stores/transitStore';
import { useTranslation } from 'react-i18next';

const SEARCH_DEBOUNCE_MS = 120;
const MIN_QUERY_LENGTH = 2;

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<TransitMapHandle>(null);
  const searchSeq = useRef(0);
  const routePathSeq = useRef(0);
  const hasCentered = useRef(false);
  const navigationActive = useTransitStore((state) => state.navigationActive);
  const { location, refresh: refreshLocation } = useUserLocation(true, navigationActive);
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('chat');
  const [chatState, setChatState] = useState<ChatSessionState>(() =>
    createInitialChatState((key) => t(key))
  );
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const chatBusyRef = useRef(false);
  const lastGuidedStepRef = useRef<number>(-1);
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
    mapRef.current?.recenter(location);
  }, [location]);

  useEffect(() => {
    if (!location) return;
    fetchNearbyPOIs(location, 1500).then(setMapPois).catch(() => setMapPois([]));
  }, [location, setMapPois]);

  const itineraryVisible = routeOptions.length > 0 || navigationActive;
  const viewportStopsEnabled = showStops && !lineDetail && !itineraryVisible;

  useEffect(() => {
    if (interactionMode !== 'map') return;
    let cancelled = false;

    const loadShapes = () => {
      void listLineShapesApi()
        .then((shapes) => {
          if (!cancelled) setNetworkLineShapes(shapes);
        })
        .catch(() => {
          if (!cancelled) setNetworkLineShapes([]);
        });
    };

    loadShapes();
    return () => {
      cancelled = true;
    };
  }, [interactionMode, modesKey]);

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

  const handleNavigateToStop = useCallback(
    async (stop: Stop) => {
      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const origin = location ?? (await refreshLocation());
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
          new Date(),
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
      location,
      refreshLocation,
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
        setLineDetail(null);
      }
    },
    [hapticFeedback, setSelectedStops]
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
    if (!walkNavigationActive || !location || !currentNavigationStep) return;
    const now = Date.now();
    const guidanceHeading = walkGuidanceHeading(
      location,
      currentNavigationStep.pathCoordinates,
      currentNavigationStep.to,
      userHeading
    );
    const headingDelta =
      lastFollowHeadingRef.current != null
        ? Math.abs(guidanceHeading - lastFollowHeadingRef.current)
        : 999;
    const headingChanged = headingDelta > 6 && headingDelta < 354;
    if (now - lastFollowAtRef.current < 250 && !headingChanged) return;
    lastFollowAtRef.current = now;
    lastFollowHeadingRef.current = guidanceHeading;
    mapRef.current?.followUser(location, guidanceHeading);
  }, [
    walkNavigationActive,
    location?.latitude,
    location?.longitude,
    userHeading,
    currentNavigationStep,
  ]);

  // Entrée / retour en vue rue dès qu’une étape marche commence.
  useEffect(() => {
    if (!walkNavigationActive || !currentNavigationStep) return;
    const coords = location ?? currentNavigationStep.from;
    enterWalkStreetView(currentNavigationStep, coords, userHeading);
  }, [walkNavigationActive, navigationStepIndex]);

  useEffect(() => {
    if (interactionMode !== 'chat' || !navigationActive || !currentNavigationStep) return;
    if (lastGuidedStepRef.current === navigationStepIndex) return;
    lastGuidedStepRef.current = navigationStepIndex;
    const distanceMeters = location
      ? Math.round(haversineMeters(location, currentNavigationStep.to) / 25) * 25
      : null;
    const guidance = formatStepGuidance(
      currentNavigationStep,
      navigationStepIndex,
      navigationSteps.length,
      distanceMeters
    );
    setChatState((prev) => {
      const next = setNavigationGuidance(prev, guidance);
      chatStateRef.current = next;
      return next;
    });
  }, [
    interactionMode,
    navigationActive,
    currentNavigationStep,
    navigationStepIndex,
    navigationSteps.length,
  ]);

  // Rafraîchir la distance affichée (~25 m) sans empiler de messages.
  useEffect(() => {
    if (interactionMode !== 'chat' || !navigationActive || !currentNavigationStep || !location) {
      return;
    }
    if (lastGuidedStepRef.current !== navigationStepIndex) return;
    if (currentNavigationStep.kind === 'arrive') return;

    const distanceMeters = Math.round(haversineMeters(location, currentNavigationStep.to) / 25) * 25;
    const guidance = formatStepGuidance(
      currentNavigationStep,
      navigationStepIndex,
      navigationSteps.length,
      distanceMeters
    );
    setChatState((prev) => {
      const last = [...prev.messages].reverse().find((m) => m.kind === 'nav-step');
      if (!last || last.text === guidance) return prev;
      const next = setNavigationGuidance(prev, guidance);
      chatStateRef.current = next;
      return next;
    });
  }, [
    interactionMode,
    navigationActive,
    currentNavigationStep,
    navigationStepIndex,
    navigationSteps.length,
    location?.latitude,
    location?.longitude,
  ]);

  const wasNavigatingRef = useRef(false);
  useEffect(() => {
    if (interactionMode !== 'chat') return;
    if (navigationActive) {
      wasNavigatingRef.current = true;
      return;
    }
    if (!wasNavigatingRef.current) return;
    wasNavigatingRef.current = false;
    if (chatStateRef.current.phase !== 'navigating') return;
    setChatState((prev) => {
      const next = chatPhaseAfterRoute({ ...prev, phase: 'done' }, t('chat.arrived'), true, t);
      chatStateRef.current = next;
      return next;
    });
  }, [interactionMode, navigationActive, t]);

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

  useEffect(() => {
    if (!navigationActive || !activeStepPath?.length) return;
    // En marche : le followUser gère le POV — ne pas fitRoute.
    if (currentNavigationStep?.kind === 'walk') return;
    mapRef.current?.fitRoute(activeStepPath);
  }, [navigationActive, navigationStepIndex, activeStepPath, currentNavigationStep?.kind]);

  // Eviter le fit global qui écrase le focus étape / POV marche.
  useEffect(() => {
    if (!navigationActive || activeStepPath?.length) return;
    if (currentNavigationStep?.kind === 'walk') return;
    if (!displayedPath?.length) return;
    mapRef.current?.fitRoute(displayedPath);
  }, [navigationActive, displayedPath, activeStepPath, currentNavigationStep?.kind]);

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
      if (firstStep?.kind === 'walk') {
        const followCoords = location ?? origin;
        enterWalkStreetView(firstStep, followCoords, null);
      } else if (firstStep?.pathCoordinates?.length) {
        mapRef.current?.fitRoute(firstStep.pathCoordinates);
      } else if (enriched.geometry?.length) {
        mapRef.current?.fitRoute(enriched.geometry);
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

  const runChatTrip = useCallback(
    async (trip: ChatTripRequest) => {
      const seq = ++planSeqRef.current;
      prevModesKeyRef.current = modesKey;
      setSelectedStops([]);
      setIsPlanningRoute(true);
      setRouteSearchSettled(false);
      setRoutePathsById({});
      setEnrichedRoutesById({});
      setSelectedLine(null);
      setLineDetail(null);
      stopNavigation();
      setActiveRoute(null);
      setRouteOptions([]);

      setOriginCoordinates(trip.origin);
      setDestinationCoordinates(trip.destination);
      setDestinationLabel(trip.destinationLabel);

      try {
        const routes = await routingService.planRoutes(
          trip.origin,
          trip.destination,
          3,
          trip.departureTime,
          enabledTransportModes
        );

        if (seq !== planSeqRef.current) return;

        if (!routes.length) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
          setChatState((prev) => chatPhaseAfterRoute(prev, t('chat.noRoute'), false, t));
          return;
        }

        applyPlannedRoutes(routes, seq);

        const best = routes[0];
        const enriched = await fetchRouteGeometry(best, trip.origin, trip.destination, {
          fit: false,
        });
        if (seq !== planSeqRef.current) return;

        setSelectedRouteIndex(0);
        setActiveRoute(enriched);
        const stops = await collectRouteStops(enriched, mapStops);
        setRouteStops(stops);
        setBoardingStop(findBoardingStop(enriched, stops));

        const steps = buildNavigationSteps(enriched, trip.origin, trip.destination, stops);
        startNavigation(steps);
        lastGuidedStepRef.current = -1;

        const departure = enriched.departureTime.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const arrival = enriched.arrivalTime.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const summary = t('chat.routeSummary', {
          duration: enriched.totalDurationMinutes,
          walk: enriched.walkingMinutes,
          departure,
          arrival,
        });

        setChatState((prev) => {
          const withSummary = chatPhaseAfterRoute(prev, summary, true, t);
          chatStateRef.current = withSummary;
          return withSummary;
        });

        const firstStep = steps[0];
        if (firstStep?.kind === 'walk') {
          enterWalkStreetView(firstStep, trip.origin, null);
        } else if (firstStep?.pathCoordinates?.length) {
          mapRef.current?.fitRoute(firstStep.pathCoordinates);
        } else if (enriched.geometry?.length) {
          mapRef.current?.fitRoute(enriched.geometry);
        }
        if (hapticFeedback) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        if (seq === planSeqRef.current) {
          setIsPlanningRoute(false);
          setRouteSearchSettled(true);
          setChatState((prev) => chatPhaseAfterRoute(prev, t('chat.noRoute'), false, t));
        }
      }
    },
    [
      modesKey,
      enabledTransportModes,
      applyPlannedRoutes,
      fetchRouteGeometry,
      enterWalkStreetView,
      mapStops,
      setSelectedStops,
      setOriginCoordinates,
      setDestinationCoordinates,
      setDestinationLabel,
      stopNavigation,
      setActiveRoute,
      setRouteOptions,
      setSelectedRouteIndex,
      setRouteStops,
      setBoardingStop,
      startNavigation,
      hapticFeedback,
      t,
    ]
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

  const onChatSend = useCallback(
    async (text: string) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      try {
        const result = await handleChatUserText(chatStateRef.current, text, chatCtx);
        setChatState(result.state);
        chatStateRef.current = result.state;
        if (result.tripRequest) {
          await runChatTrip(result.tripRequest);
        }
      } finally {
        chatBusyRef.current = false;
      }
    },
    [chatCtx, runChatTrip]
  );

  const onChatQuickReply = useCallback(
    async (id: string) => {
      if (chatBusyRef.current) return;
      chatBusyRef.current = true;
      try {
        const result = await handleChatQuickReply(chatStateRef.current, id, chatCtx);
        setChatState(result.state);
        chatStateRef.current = result.state;
        if (result.tripRequest) {
          await runChatTrip(result.tripRequest);
        }
      } finally {
        chatBusyRef.current = false;
      }
    },
    [chatCtx, runChatTrip]
  );

  const onChatPlaceSelect = useCallback(
    (place: SearchSuggestion) => {
      const result = handleChatPlaceSelect(chatStateRef.current, place, chatCtx);
      setChatState(result.state);
      chatStateRef.current = result.state;
    },
    [chatCtx]
  );

  const handleInteractionModeChange = useCallback(
    (mode: MapInteractionMode) => {
      setInteractionMode(mode);
      if (mode === 'chat') {
        setSelectedStops([]);
        setLayersSheetOpen(false);
        setChatState((prev) => {
          const stillAtStart =
            prev.phase === 'awaiting_destination' &&
            !prev.destination &&
            prev.messages.length <= 2 &&
            prev.messages.every((m) => m.role === 'assistant');
          if (stillAtStart || prev.messages.length === 0) {
            return createInitialChatState((key) => t(key));
          }
          return prev;
        });
      }
    },
    [setSelectedStops, t]
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

      const origin = location ?? (await refreshLocation());
      if (!origin) {
        if (seq === planSeqRef.current) setIsPlanningRoute(false);
        return;
      }

      setOriginCoordinates(origin);
      setDestinationCoordinates(coords);
      setDestinationLabel(label ?? null);
      setSearchQuery('');
      stopNavigation();
      setActiveRoute(null);
      setRouteOptions([]);

      try {
        const routes = await routingService.planRoutes(
          origin,
          coords,
          3,
          new Date(),
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
      location,
      refreshLocation,
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
      const origin = originCoordinates ?? location ?? (await refreshLocation());
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
          new Date(),
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
    applyPlannedRoutes,
    setRouteOptions,
  ]);

  useEffect(() => {
    if (destinationCoordinates) {
      setSearchSuggestions([]);
      return;
    }

    const query = searchQuery.trim();
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
        const places = await searchPlacesApi(query, {
          scope: searchScope,
          userLat: location?.latitude,
          userLon: location?.longitude,
        });

        if (seq !== searchSeq.current) return;
        if (destinationCoordinates) return;

        setSearchSuggestions(mergeSearchSuggestions(localResults, places));
      } catch {
        if (seq === searchSeq.current && !destinationCoordinates) {
          setSearchSuggestions(localResults);
        }
      } finally {
        if (seq === searchSeq.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    searchQuery,
    searchScope,
    location,
    mapStops,
    destinationCoordinates,
    setSearchSuggestions,
    setIsSearching,
  ]);

  const handleChangeText = useCallback(
    (text: string) => {
      setSearchQuery(text);
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
      setSearchQuery,
      setSearchSuggestions,
      setIsSearching,
      clearRouteNavigation,
      stopNavigation,
      setSelectedStops,
      routeOptions.length,
      destinationCoordinates,
    ]
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: SearchSuggestion) => {
      void resolveDestination(suggestion.coordinates, suggestion.name);
    },
    [resolveDestination]
  );

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
    clearRouteNavigation();
    const homeRegion = location
      ? { ...location, latitudeDelta: 0.025, longitudeDelta: 0.025 }
      : defaultMapRegion();
    setMapRegion(homeRegion);
    mapRef.current?.resetToInitialView(location);
  }, [
    clearRouteNavigation,
    location,
    setSearchQuery,
    setSearchSuggestions,
    setIsSearching,
    setSelectedStops,
  ]);

  const handleAbortChatItinerary = useCallback(() => {
    handleAbortItinerary();
    const next = createInitialChatState((key) => t(key));
    setChatState(next);
    chatStateRef.current = next;
    chatBusyRef.current = false;
    if (hapticFeedback) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [handleAbortItinerary, t, hapticFeedback]);

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

  const chatMode = interactionMode === 'chat';

  const mapNetworkLineShapes = useMemo(() => {
    if (chatMode || itineraryVisible) return [];
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
    chatMode,
    itineraryVisible,
    networkLineShapes,
    enabledTransportModes,
    selectedLine?.id,
  ]);

  const placeProposals = useMemo((): SearchSuggestion[] => {
    if (chatMode) {
      return chatState.pendingSuggestions ?? [];
    }
    if (destinationCoordinates) return [];
    return searchSuggestions;
  }, [chatMode, chatState.pendingSuggestions, destinationCoordinates, searchSuggestions]);

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
      if (chatMode) {
        onChatPlaceSelect(place);
      } else {
        handleSuggestionSelect(place);
      }
    },
    [placeProposals, chatMode, onChatPlaceSelect, handleSuggestionSelect, hapticFeedback]
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

  useEffect(() => {
    if (!chatMode || navigationActive || isPlanningRoute) return;
    if (chatState.pendingSuggestions && chatState.pendingSuggestions.length > 0) {
      return;
    }

    if (chatState.destination) {
      setDestinationCoordinates(chatState.destination);
      setDestinationLabel(chatState.destinationLabel ?? null);
      if (chatState.origin) {
        setOriginCoordinates(chatState.origin);
        mapRef.current?.fitRoute([chatState.origin, chatState.destination]);
      } else {
        mapRef.current?.recenter(chatState.destination);
      }
    }
  }, [
    chatMode,
    navigationActive,
    isPlanningRoute,
    chatState.destination,
    chatState.destinationLabel,
    chatState.origin,
    chatState.pendingSuggestions,
    setDestinationCoordinates,
    setDestinationLabel,
    setOriginCoordinates,
  ]);

  const showChatCloseItinerary =
    chatMode &&
    (navigationActive ||
      isPlanningRoute ||
      routeOptions.length > 0 ||
      !!destinationCoordinates ||
      chatState.phase === 'planning' ||
      chatState.phase === 'navigating' ||
      chatState.phase === 'done');
  const showRouteOptions = routeOptions.length > 0 && !navigationActive && !chatMode;
  const showNoRouteFound =
    !chatMode &&
    routeSearchSettled &&
    !!destinationCoordinates &&
    !isPlanningRoute &&
    routeOptions.length === 0 &&
    !navigationActive;
  const bottomStackHeight = chatMode
    ? navigationActive
      ? 300
      : 490
    : navigationActive
      ? 400
      : showRouteOptions || isPlanningRoute || showNoRouteFound
        ? 340
        : 72;
  const floatingControlsBottom =
    insets.bottom +
    bottomStackHeight +
    spacing.md +
    (!chatMode && navigationActive ? spacing.xl : 0);
  const mapBottomClearance = bottomStackHeight + insets.bottom + spacing.lg;
  const stopInfoContentTop = insets.top + 56 + spacing.sm;
  const vignette = useMapVignetteLayout(mapBottomClearance);
  const { weather: mapWeather, loading: mapWeatherLoading } = useMapWeather(mapRegion);
  const mapInteractive =
    !chatMode || placeProposals.length > 0 || navigationActive;
  const proposalArrowTop = useMemo(
    () => insets.top + (Dimensions.get('window').height - mapBottomClearance - insets.top) * 0.42,
    [insets.top, mapBottomClearance]
  );

  return (
    <View style={styles.container}>
      <View style={styles.mapLayer} pointerEvents={mapInteractive ? 'auto' : 'none'}>
        <TransitMap
          ref={mapRef}
          userLocation={
            walkNavigationActive
              ? location ?? currentNavigationStep?.from ?? null
              : location
          }
          userHeading={walkNavigationActive ? userHeading : null}
          showNavigationPuck={!!walkNavigationActive}
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
          stopClusters={chatMode && !itineraryVisible ? [] : stopClusters}
          pois={chatMode || !showPois ? [] : mapPois}
          clearRadius={vignette.clearRadius}
          vignette={vignette}
          selectedStopIds={selectedStopIds}
          onStopClusterPress={chatMode && !itineraryVisible ? undefined : handleStopClusterPress}
          onRegionChangeComplete={handleMapRegionChange}
        />
      </View>

      {!chatMode && selectedStops.length > 0 ? (
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

      <AppMenuButton
        top={insets.top + spacing.sm}
        onRecenter={chatMode ? undefined : handleRecenter}
        onOpenLayers={chatMode ? undefined : () => setLayersSheetOpen(true)}
        layersActive={layersActive}
      />

      <MapWeatherWidget
        top={insets.top + spacing.sm}
        left={spacing.md}
        weather={mapWeather}
        loading={mapWeatherLoading}
      />

      <MapModeToggle
        mode={interactionMode}
        onChange={handleInteractionModeChange}
        top={insets.top + spacing.sm}
        left={spacing.md + MAP_WEATHER_WIDGET_SIZE + spacing.sm}
      />

      {placeProposals.length > 1 ? (
        <PlaceProposalControls
          total={placeProposals.length}
          arrowTop={proposalArrowTop}
          onPrev={handlePrevPlaceProposal}
          onNext={handleNextPlaceProposal}
        />
      ) : null}

      {!chatMode ? (
        <MapFloatingControls
          bottom={floatingControlsBottom}
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
        />
      ) : null}

      <MapLayersSheet
        visible={layersSheetOpen && !chatMode}
        top={insets.top + 48 + spacing.sm}
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
          {chatMode ? (
            navigationActive && currentNavigationStep ? (
              <InAppNavigationCard
                step={currentNavigationStep}
                steps={navigationSteps}
                stepIndex={navigationStepIndex}
                totalSteps={navigationSteps.length}
                userLocation={location}
                onStop={() => {
                  handleAbortChatItinerary();
                  if (hapticFeedback) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
              />
            ) : (
              <ChatModePanel
                state={chatState}
                onSend={onChatSend}
                onQuickReply={onChatQuickReply}
                showCloseItinerary={showChatCloseItinerary}
                onCloseItinerary={handleAbortChatItinerary}
                bottomInset={0}
              />
            )
          ) : (
            <>
              {navigationActive && currentNavigationStep ? (
                <InAppNavigationCard
                  step={currentNavigationStep}
                  steps={navigationSteps}
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
                  onClose={handleCloseRouteOptions}
                />
              ) : showNoRouteFound ? (
                <NoRouteFoundCard
                  destinationLabel={destinationLabel}
                  onClose={handleDismissNoRoute}
                />
              ) : isPlanningRoute ? (
                <PlanningRouteCard />
              ) : null}

              <SearchBar
                value={searchQuery}
                onChangeText={handleChangeText}
                isLoading={isSearching || isPlanningRoute}
              />
            </>
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
