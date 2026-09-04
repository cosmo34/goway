import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, Text } from 'react-native';
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
import { useMapVignetteLayout } from '../../src/hooks/useMapVignetteLayout';
import { useViewportStops } from '../../src/hooks/useViewportStops';
import { MapWeatherWidget } from '../../src/components/MapWeatherWidget';
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
import { buildNavigationSteps, buildWalkingNavigationSteps, createWalkOnlyRoute } from '../../src/services/routing/navigationSteps';
import { searchPlacesApi, getLineDetailApi, buildRouteGeometryApi } from '../../src/services/api/transitApi';
import { colors, spacing } from '../../src/theme';
import type { Region } from 'react-native-maps';
import { defaultMapRegion } from '../../src/utils/mapRegion';
import { clusterId, clusterStops } from '../../src/utils/clusterStops';
import { mergeSearchSuggestions, searchPlacesLocally } from '../../src/utils/localPlaceSearch';
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
  const [showStops, setShowStops] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(defaultMapRegion());
  const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
  const [lineDetail, setLineDetail] = useState<TransitLineDetail | null>(null);
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
      setPlannedRoutes(routes, quickStops, findBoardingStop(routes[0], quickStops));
      setIsPlanningRoute(false);
      setRouteSearchSettled(true);
    },
    [setPlannedRoutes]
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
      const nextClusterId = clusterId(stops);
      const currentClusterId =
        selectedStops.length > 0 ? clusterId(selectedStops) : null;
      if (currentClusterId === nextClusterId) {
        setSelectedStops([]);
        return;
      }
      setSelectedStops(stops);
    },
    [selectedStops, setSelectedStops, hapticFeedback]
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
          mapRef.current?.fitRoute(walking.path);

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

        await startWalkingNavigation();
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
    setMapRegion(region);
  }, []);

  const previewItineraryRoute = routeOptions[previewRouteIndex] ?? activeRoute;

  const visibleStops = useMemo(() => {
    if (lineDetail) return [];
    if (itineraryVisible && previewItineraryRoute) {
      return mergeRouteStops(previewItineraryRoute, routeStops, mapStops);
    }
    if (itineraryVisible) return routeStops;
    return showStops ? mapStops : [];
  }, [
    lineDetail,
    itineraryVisible,
    previewItineraryRoute,
    routeStops,
    mapStops,
    showStops,
  ]);

  useEffect(() => {
    if (!itineraryVisible || !previewItineraryRoute) return;

    let cancelled = false;
    const cachedStops = useTransitStore.getState().mapStops;

    void collectRouteStops(previewItineraryRoute, cachedStops).then((fullStops) => {
      if (cancelled) return;
      setRouteStops(fullStops);
      setBoardingStop(findBoardingStop(previewItineraryRoute, fullStops));
    });

    return () => {
      cancelled = true;
    };
  }, [
    itineraryVisible,
    previewItineraryRoute,
    setRouteStops,
    setBoardingStop,
  ]);

  const lineStops = lineDetail?.stops ?? [];
  const mapDisplayStops = lineStops.length > 0 ? lineStops : visibleStops;
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

  useNavigationTracking({
    navigationActive,
    navigationStepIndex,
    navigationSteps,
    currentStep: currentNavigationStep,
    location,
    hapticFeedback,
    advanceNavigationStep,
  });

  const activeMapPath =
    displayedPath?.length
      ? displayedPath
      : navigationActive && currentNavigationStep?.pathCoordinates?.length
        ? currentNavigationStep.pathCoordinates
        : undefined;

  useEffect(() => {
    if (!navigationActive || !displayedPath?.length) return;
    mapRef.current?.fitRoute(displayedPath);
  }, [navigationActive, displayedPath]);

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

      const enriched = await fetchRouteGeometry(route, origin, destination, { fit: true });
      setActiveRoute(enriched);
      const stops = await collectRouteStops(enriched, mapStops);
      setRouteStops(stops);
      setBoardingStop(findBoardingStop(enriched, stops));

      const steps = buildNavigationSteps(enriched, origin, destination, stops);
      startNavigation(steps);

      if (enriched.geometry?.length) {
        mapRef.current?.fitRoute(enriched.geometry);
      }

      if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [
      routeOptions,
      originCoordinates,
      destinationCoordinates,
      mapStops,
      setSelectedRouteIndex,
      setActiveRoute,
      setRouteStops,
      setBoardingStop,
      startNavigation,
      fetchRouteGeometry,
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

  const handleCloseRouteOptions = useCallback(() => {
    routePathSeq.current += 1;
    geometryInFlightRef.current.clear();
    setRoutePathsById({});
    setEnrichedRoutesById({});
    setRouteSearchSettled(false);
    clearRouteNavigation();
  }, [clearRouteNavigation]);

  const handleDismissNoRoute = useCallback(() => {
    routePathSeq.current += 1;
    geometryInFlightRef.current.clear();
    setRoutePathsById({});
    setEnrichedRoutesById({});
    setRouteSearchSettled(false);
    clearRouteNavigation();
  }, [clearRouteNavigation]);

  const handleRecenter = useCallback(async () => {
    if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const coords = (await refreshLocation()) ?? location;
    if (coords) mapRef.current?.recenter(coords);
  }, [refreshLocation, location, hapticFeedback]);

  const showRouteOptions = routeOptions.length > 0 && !navigationActive;
  const showNoRouteFound =
    routeSearchSettled &&
    !!destinationCoordinates &&
    !isPlanningRoute &&
    routeOptions.length === 0 &&
    !navigationActive;
  const bottomStackHeight = navigationActive
    ? 260
    : showRouteOptions || isPlanningRoute || showNoRouteFound
      ? 340
      : 72;
  const showSearchSuggestions = !destinationCoordinates && searchSuggestions.length > 0;
  const floatingControlsBottom = insets.bottom + bottomStackHeight + spacing.md;
  const mapBottomClearance = bottomStackHeight + insets.bottom + spacing.lg;
  const stopInfoContentTop = insets.top + 56 + spacing.sm;
  const vignette = useMapVignetteLayout(mapBottomClearance);
  const { weather: mapWeather, loading: mapWeatherLoading } = useMapWeather(mapRegion);

  return (
    <View style={styles.container}>
      <TransitMap
        ref={mapRef}
        userLocation={location}
        origin={originCoordinates}
        destination={destinationCoordinates}
        routeCoordinates={routeMapSegments.length > 0 ? undefined : activeMapPath}
        routeSegments={routeMapSegments.length > 0 ? routeMapSegments : undefined}
        walkCoordinates={undefined}
        boardingStop={navigationActive ? boardingStop : null}
        lineCoordinates={lineCoordinates}
        lineColor={selectedLine?.color}
        stopClusters={stopClusters}
        pois={showPois ? mapPois : []}
        clearRadius={vignette.clearRadius}
        vignette={vignette}
        selectedStopIds={selectedStopIds}
        onStopClusterPress={handleStopClusterPress}
        onRegionChangeComplete={handleMapRegionChange}
      />

      {selectedStops.length > 0 ? (
        <StopInfoCard
          stops={selectedStops}
          departuresByStop={departuresByStop}
          loading={stopDeparturesLoading}
          top={0}
          contentTop={stopInfoContentTop}
          userLocation={location}
          onClose={handleCloseStopInfo}
          onNavigate={handleNavigateToStop}
        />
      ) : null}

      <AppMenuButton
        top={insets.top + spacing.sm}
        onRecenter={handleRecenter}
        onOpenLayers={() => setLayersSheetOpen(true)}
        layersActive={layersActive}
      />

      <MapWeatherWidget
        top={insets.top + spacing.sm}
        left={spacing.md}
        weather={mapWeather}
        loading={mapWeatherLoading}
      />

      <MapFloatingControls
        bottom={floatingControlsBottom}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
      />

      <MapLayersSheet
        visible={layersSheetOpen}
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
          {navigationActive && currentNavigationStep ? (
            <InAppNavigationCard
              step={currentNavigationStep}
              stepIndex={navigationStepIndex}
              totalSteps={navigationSteps.length}
              userLocation={location}
              onStop={() => {
                stopNavigation();
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
            suggestions={showSearchSuggestions ? searchSuggestions : []}
            onSelectSuggestion={handleSuggestionSelect}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
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
