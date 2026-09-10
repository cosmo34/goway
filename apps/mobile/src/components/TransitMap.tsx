import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from 'react';
import { StyleSheet, View, Text, useWindowDimensions, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Svg, { Defs, LinearGradient, Stop as SvgStop, Path } from 'react-native-svg';
import { MAP_ATTRIBUTION } from '../config/mapTiles';
import { colors, typography } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import type { Coordinates, PointOfInterest, Stop } from '../stores/transitStore';
import type { StopCluster } from '../utils/clusterStops';
import { defaultMapRegion } from '../utils/mapRegion';
import { MapCircularVignette } from './MapCircularVignette';

const RNMapView = MapView as any;
const RNMarker = Marker as any;

const INITIAL_REGION: Region = defaultMapRegion();

const MIN_ZOOM_DELTA = 0.00015;
const MAX_ZOOM_DELTA = 0.35;
/** Facteur proche de 1 = zoom +/- plus progressif. */
const ZOOM_FACTOR = 0.9;
const ZOOM_ALTITUDE_FACTOR = 1.12;
/** Zoom marche : vue plate serrée, orientée selon le cap. */
const WALK_FOLLOW_ZOOM = 21.8;
const WALK_FOLLOW_ALTITUDE = 25;
const WALK_FOLLOW_DELTA = 0.00025;

/** Tracé à pied : ligne continue (pas de tirets — instables au zoom rue). */
const WALK_ROUTE_CORE_WIDTH = 4;
const WALK_ROUTE_HALO_WIDTH = 9;

const PLACE_MARKER_SIZE = 36;
const PLACE_CALLOUT_BG = 'rgba(15, 20, 28, 0.94)';
const PLACE_CALLOUT_BG_SOLID = '#0F141C';
/** Ancre fixe callout focalisé — évite le clignotement onLayout. */
const FOCUSED_PLACE_ANCHOR = { x: 0.11, y: 0.28 };
/** Entonnoir coin sup. gauche → point */
const PLACE_FUNNEL_W = 26;
const PLACE_FUNNEL_MOUTH = 20;
/** Y du tip (centre du point) dans le SVG entonnoir, près du haut. */
const PLACE_FUNNEL_TIP_Y = 5;

export interface TransitMapHandle {
  recenter: (coords: Coordinates, animated?: boolean) => void;
  fitRoute: (coords: Coordinates[]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Suit l’utilisateur en mode guidage à pied (caméra + cap). */
  followUser: (coords: Coordinates, heading?: number | null) => void;
  /** Revient à la vue d’accueil (plate), comme à l’ouverture de l’app. */
  resetToInitialView: (coords?: Coordinates | null) => void;
}

export interface RouteMapSegment {
  coordinates: Coordinates[];
  dashed?: boolean;
  color?: string;
}

interface TransitMapProps {
  userLocation?: Coordinates | null;
  /** Cap en degrés (0 = nord) pour le puck de navigation à pied. */
  userHeading?: number | null;
  /** Affiche un puck directionnel à la place du point bleu système. */
  showNavigationPuck?: boolean;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  routeCoordinates?: Coordinates[];
  routeSegments?: RouteMapSegment[];
  walkCoordinates?: Coordinates[];
  /** Tracé de l’étape de guidage en cours (mis en avant). */
  activeStepCoordinates?: Coordinates[];
  /** Position projetée sur l’itinéraire (suivi temps réel). */
  progressCoordinate?: Coordinates | null;
  /** Cible de l’étape courante. */
  stepTarget?: Coordinates | null;
  /** Propositions de lieux numérotées (recherche carte ou chat). */
  placeMarkers?: Array<{
    number: number;
    coordinates: Coordinates;
    name: string;
    streetLine?: string;
    city?: string;
    quarter?: string;
    selectHint?: string;
  }>;
  /** Numéro (1-based) de la proposition mise en avant. */
  focusedPlaceNumber?: number | null;
  onPlaceMarkerPress?: (number: number) => void;
  boardingStop?: Stop | null;
  lineCoordinates?: Coordinates[];
  lineColor?: string;
  /** Tracés réseau (mode carte) — couleur propre à chaque ligne. */
  networkLineShapes?: Array<{
    id: string;
    routeId?: string;
    color: string;
    coordinates: Coordinates[];
    highlighted?: boolean;
  }>;
  stops?: Stop[];
  lineStops?: Stop[];
  stopClusters?: StopCluster[];
  pois?: PointOfInterest[];
  clearRadius?: number;
  selectedStopIds?: string[];
  onStopClusterPress?: (stops: Stop[]) => void;
  onRegionChangeComplete?: (region: Region) => void;
  vignette?: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    clearRadius: number;
    fadeWidth: number;
  };
}

function toCoord(coords: Coordinates) {
  return { latitude: coords.latitude, longitude: coords.longitude };
}

/** Tracé marche lisible à tous les zooms (halo + ligne nette). */
function WalkRoutePolylines({
  coordinates,
  zIndex = 5,
  emphasized = false,
}: {
  coordinates: Coordinates[];
  zIndex?: number;
  emphasized?: boolean;
}) {
  if (coordinates.length < 2) return null;
  const coords = coordinates.map(toCoord);
  const coreWidth = emphasized ? WALK_ROUTE_CORE_WIDTH + 1 : WALK_ROUTE_CORE_WIDTH;
  const haloWidth = emphasized ? WALK_ROUTE_HALO_WIDTH + 2 : WALK_ROUTE_HALO_WIDTH;

  return (
    <>
      <Polyline
        coordinates={coords}
        strokeColor={colors.mapRouteGlow}
        strokeWidth={haloWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={zIndex}
      />
      <Polyline
        coordinates={coords}
        strokeColor={colors.mapRouteActive}
        strokeWidth={coreWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={zIndex + 1}
      />
    </>
  );
}

/** Puck guidage + halo pulsé pour signaler la position live. */
function NavigationPuck() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
      pulse.setValue(0);
    };
  }, [pulse]);

  const haloStyle = {
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 2.4],
        }),
      },
    ],
    opacity: pulse.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0.5, 0.35, 0],
    }),
  };

  const haloOuterStyle = {
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 3.1],
        }),
      },
    ],
    opacity: pulse.interpolate({
      inputRange: [0, 0.2, 1],
      outputRange: [0.28, 0.18, 0],
    }),
  };

  return (
    <View style={styles.navPuck}>
      <Animated.View style={[styles.navPuckHalo, haloOuterStyle]} />
      <Animated.View style={[styles.navPuckHalo, haloStyle]} />
      <View style={styles.navPuckCone} />
      <View style={styles.navPuckCore} />
    </View>
  );
}

/** Entonnoir SVG : large côté bulle, fin côté point, dégradé bulle → accent. */
function PlaceCalloutFunnel({ pointColor }: { pointColor: string }) {
  const w = PLACE_FUNNEL_W;
  const mouth = PLACE_FUNNEL_MOUTH;
  const tipY = PLACE_FUNNEL_TIP_Y;
  // Tip à gauche (point), bouche à droite (coin sup. gauche de la bulle)
  const d = [
    `M 0 ${tipY}`,
    `C ${w * 0.4} ${tipY} ${w * 0.65} 0 ${w} 0`,
    `L ${w} ${mouth}`,
    `C ${w * 0.65} ${mouth * 0.55} ${w * 0.4} ${tipY} 0 ${tipY}`,
    'Z',
  ].join(' ');

  return (
    <Svg
      width={w}
      height={mouth}
      viewBox={`0 0 ${w} ${mouth}`}
      style={styles.placeCalloutFunnel}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="placeFunnelGrad" x1="0" y1="0" x2="1" y2="0">
          <SvgStop offset="0" stopColor={pointColor} stopOpacity="1" />
          <SvgStop offset="0.55" stopColor={pointColor} stopOpacity="0.55" />
          <SvgStop offset="1" stopColor={PLACE_CALLOUT_BG_SOLID} stopOpacity="0.94" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#placeFunnelGrad)" />
    </Svg>
  );
}

export const TransitMap = forwardRef<TransitMapHandle, TransitMapProps>(function TransitMap(
  {
    userLocation,
    userHeading = null,
    showNavigationPuck = false,
    origin,
    destination,
    routeCoordinates,
    routeSegments,
    walkCoordinates,
    activeStepCoordinates,
    progressCoordinate,
    stepTarget,
    placeMarkers = [],
    focusedPlaceNumber = null,
    onPlaceMarkerPress,
    boardingStop,
    lineCoordinates,
    lineColor,
    networkLineShapes = [],
    stops = [],
    lineStops = [],
    stopClusters,
    pois = [],
    clearRadius = 160,
    selectedStopIds = [],
    onStopClusterPress,
    onRegionChangeComplete,
    vignette,
  },
  ref
) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef(INITIAL_REGION);
  const cameraHeadingRef = useRef(0);
  const calloutMaxWidth = Math.min(280, Math.max(160, windowWidth * 0.72));

  const recenter = useCallback((coords: Coordinates, animated = true) => {
    const region = { ...coords, latitudeDelta: 0.025, longitudeDelta: 0.025 };
    regionRef.current = region;
    cameraHeadingRef.current = 0;
    if (animated) {
      mapRef.current?.animateCamera(
        {
          center: toCoord(coords),
          heading: 0,
          pitch: 0,
          altitude: 2200,
          zoom: 13.8,
        },
        { duration: 500 }
      );
    } else {
      mapRef.current?.animateToRegion(region, 0);
    }
  }, []);

  const fitRoute = useCallback(
    (coords: Coordinates[]) => {
      if (coords.length < 2) return;
      const pad = Math.round(clearRadius * 0.2);
      cameraHeadingRef.current = 0;
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: pad, right: pad, bottom: pad, left: pad },
        animated: true,
      });
    },
    [clearRadius]
  );

  const zoomBy = useCallback((factor: number) => {
    const region = regionRef.current;
    const nextLat = Math.min(MAX_ZOOM_DELTA, Math.max(MIN_ZOOM_DELTA, region.latitudeDelta * factor));
    const nextLon = Math.min(MAX_ZOOM_DELTA, Math.max(MIN_ZOOM_DELTA, region.longitudeDelta * factor));
    const next = { ...region, latitudeDelta: nextLat, longitudeDelta: nextLon };
    regionRef.current = next;

    const zoomingIn = factor < 1;
    void (async () => {
      try {
        const camera = await mapRef.current?.getCamera?.();
        if (camera) {
          const altitude = camera.altitude;
          const nextAltitude =
            altitude != null && Number.isFinite(altitude)
              ? Math.max(
                  18,
                  Math.min(
                    14000,
                    zoomingIn ? altitude / ZOOM_ALTITUDE_FACTOR : altitude * ZOOM_ALTITUDE_FACTOR
                  )
                )
              : undefined;
          const currentZoom = camera.zoom;
          const nextZoom =
            currentZoom != null && Number.isFinite(currentZoom)
              ? Math.max(11, Math.min(22.5, currentZoom + (zoomingIn ? 0.35 : -0.35)))
              : undefined;

          mapRef.current?.animateCamera(
            {
              center: { latitude: next.latitude, longitude: next.longitude },
              heading: camera.heading ?? cameraHeadingRef.current,
              pitch: 0,
              ...(nextAltitude != null ? { altitude: nextAltitude } : {}),
              ...(nextZoom != null ? { zoom: nextZoom } : {}),
            },
            { duration: 220 }
          );
          return;
        }
      } catch {
        // Fallback région ci-dessous.
      }
      mapRef.current?.animateToRegion(next, 220);
    })();
  }, []);

  const zoomIn = useCallback(() => zoomBy(ZOOM_FACTOR), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_FACTOR), [zoomBy]);

  const followUser = useCallback((coords: Coordinates, heading?: number | null) => {
    regionRef.current = {
      ...coords,
      latitudeDelta: WALK_FOLLOW_DELTA,
      longitudeDelta: WALK_FOLLOW_DELTA,
    };
    const resolvedHeading = heading != null && Number.isFinite(heading) ? heading : 0;
    cameraHeadingRef.current = resolvedHeading;
    mapRef.current?.animateCamera(
      {
        center: toCoord(coords),
        heading: resolvedHeading,
        pitch: 0,
        altitude: WALK_FOLLOW_ALTITUDE,
        zoom: WALK_FOLLOW_ZOOM,
      },
      { duration: 550 }
    );
  }, []);

  /** Vue plate d’accueil : position user (comme après ouverture) ou Montpellier. */
  const resetToInitialView = useCallback((coords?: Coordinates | null) => {
    const region = coords
      ? { ...coords, latitudeDelta: 0.025, longitudeDelta: 0.025 }
      : { ...INITIAL_REGION };
    regionRef.current = region;
    cameraHeadingRef.current = 0;
    mapRef.current?.animateCamera(
      {
        center: { latitude: region.latitude, longitude: region.longitude },
        heading: 0,
        pitch: 0,
        altitude: coords ? 2200 : 9000,
        zoom: coords ? 13.8 : 12.2,
      },
      { duration: 600 }
    );
    mapRef.current?.animateToRegion(region, 600);
  }, []);

  useImperativeHandle(ref, () => ({ recenter, fitRoute, zoomIn, zoomOut, followUser, resetToInitialView }), [
    recenter,
    fitRoute,
    zoomIn,
    zoomOut,
    followUser,
    resetToInitialView,
  ]);

  const selectedIdSet = new Set(selectedStopIds);
  const clusters =
    stopClusters ??
    (lineStops.length > 0 ? lineStops : stops).map((stop) => ({
      id: stop.id,
      stops: [stop],
      coordinates: stop.coordinates,
    }));

  const puckCoordinate = userLocation ?? null;
  const puckHeading = userHeading;

  const placeTitleByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const place of placeMarkers) {
      const title = place.quarter?.trim()
        ? `${place.name} - ${place.quarter.trim()}`
        : place.name;
      map.set(place.number, title);
    }
    return map;
  }, [placeMarkers]);

  const [trackPlaceMarkers, setTrackPlaceMarkers] = useState(true);

  useEffect(() => {
    setTrackPlaceMarkers(true);
    const timer = setTimeout(() => setTrackPlaceMarkers(false), 450);
    return () => clearTimeout(timer);
  }, [focusedPlaceNumber, placeMarkers.length]);

  return (
    <View style={styles.container}>
      <RNMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        userInterfaceStyle={scheme}
        showsUserLocation={!showNavigationPuck}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        showsBuildings={false}
        pitchEnabled={false}
        rotateEnabled={showNavigationPuck}
        scrollEnabled
        zoomEnabled
        onRegionChange={(region: Region) => {
          regionRef.current = region;
        }}
        onRegionChangeComplete={(region: Region) => {
          regionRef.current = region;
          onRegionChangeComplete?.(region);
        }}
        accessibilityLabel="Carte interactive Montpellier"
      >
        {showNavigationPuck && puckCoordinate ? (
          <RNMarker
            coordinate={toCoord(puckCoordinate)}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={puckHeading ?? 0}
            tracksViewChanges
            zIndex={40}
          >
            <NavigationPuck />
          </RNMarker>
        ) : null}

        {networkLineShapes.map((line, index) =>
          line.coordinates.length > 1 ? (
            <Polyline
              key={`network-line-${line.id}-${index}`}
              coordinates={line.coordinates}
              strokeColor={
                line.highlighted ? line.color : `${line.color}99`
              }
              strokeWidth={line.highlighted ? 5 : 3}
              lineCap="round"
              lineJoin="round"
              zIndex={line.highlighted ? 2 : 1}
            />
          ) : null
        )}

        {lineCoordinates && lineCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={lineCoordinates}
              strokeColor={`${lineColor ?? colors.accent}55`}
              strokeWidth={12}
              zIndex={3}
            />
            <Polyline
              coordinates={lineCoordinates}
              strokeColor={lineColor ?? colors.accent}
              strokeWidth={5}
              zIndex={4}
            />
          </>
        )}

        {routeSegments && routeSegments.length > 0
          ? routeSegments.map((segment, index) =>
              segment.coordinates.length > 1 ? (
                segment.dashed ? (
                  // Pendant le guidage marche, l’étape active porte le tracé (évite le double dessin).
                  showNavigationPuck ? null : (
                    <WalkRoutePolylines
                      key={`route-walk-${index}`}
                      coordinates={segment.coordinates}
                      zIndex={5}
                    />
                  )
                ) : (
                  <Polyline
                    key={`route-segment-${index}`}
                    coordinates={segment.coordinates}
                    strokeColor={segment.color ?? colors.mapRoute}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={5}
                  />
                )
              ) : null
            )
          : null}

        {!routeSegments?.length && routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={colors.mapRoute}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
            zIndex={5}
          />
        )}

        {walkCoordinates && walkCoordinates.length > 1 && (
          <WalkRoutePolylines coordinates={walkCoordinates} zIndex={5} />
        )}

        {activeStepCoordinates && activeStepCoordinates.length > 1 ? (
          showNavigationPuck ? (
            <WalkRoutePolylines
              coordinates={activeStepCoordinates}
              zIndex={8}
              emphasized
            />
          ) : (
            <>
              <Polyline
                coordinates={activeStepCoordinates.map(toCoord)}
                strokeColor={`${colors.mapRouteActive}66`}
                strokeWidth={12}
                lineCap="round"
                lineJoin="round"
                zIndex={8}
              />
              <Polyline
                coordinates={activeStepCoordinates.map(toCoord)}
                strokeColor={colors.mapRouteActive}
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
                zIndex={9}
              />
            </>
          )
        ) : null}

        {boardingStop && walkCoordinates && (
          <RNMarker
            coordinate={toCoord(boardingStop.coordinates)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.boardingMarker}>
              <Ionicons name="bus" size={12} color={colors.textInverse} />
            </View>
          </RNMarker>
        )}

        {stepTarget ? (
          <RNMarker
            coordinate={toCoord(stepTarget)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.stepTargetMarker}>
              <View style={styles.stepTargetCore} />
            </View>
          </RNMarker>
        ) : null}

        {placeMarkers.map((place) => {
          const focused = focusedPlaceNumber === place.number;
          const title = placeTitleByNumber.get(place.number) ?? place.name;
          const selectHint = place.selectHint ?? t('map.chooseThisDestination');
          return (
            <RNMarker
              key={`place-${place.number}`}
              coordinate={toCoord(place.coordinates)}
              anchor={focused ? FOCUSED_PLACE_ANCHOR : { x: 0.5, y: 0.5 }}
              tracksViewChanges={trackPlaceMarkers}
              tappable={focused}
              onPress={() => {
                if (!focused) return;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPlaceMarkerPress?.(place.number);
              }}
            >
              <View
                style={focused ? styles.placeMarkerRow : styles.placeMarkerRoot}
                collapsable={false}
              >
                <View style={styles.placeMarkerSlot}>
                  <View style={[styles.placeMarker, focused && styles.placeMarkerFocused]}>
                    <Text style={styles.placeMarkerText}>{place.number}</Text>
                  </View>
                </View>
                {focused ? (
                  <View style={styles.placeCalloutCluster}>
                    <PlaceCalloutFunnel pointColor={colors.accent} />
                    <View
                      style={[styles.placeCallout, { maxWidth: calloutMaxWidth }]}
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={selectHint}
                    >
                      <Text style={styles.placeCalloutName} numberOfLines={3}>
                        {title}
                      </Text>
                      {place.streetLine ? (
                        <Text style={styles.placeCalloutAddress} numberOfLines={2}>
                          {place.streetLine}
                        </Text>
                      ) : null}
                      {place.city ? (
                        <Text style={styles.placeCalloutAddress} numberOfLines={1}>
                          {place.city}
                        </Text>
                      ) : null}
                      <View style={styles.placeCalloutHint}>
                        <Text style={styles.placeCalloutHintText} numberOfLines={2}>
                          {selectHint}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            </RNMarker>
          );
        })}

        {progressCoordinate ? (
          <RNMarker
            coordinate={toCoord(progressCoordinate)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
          >
            <View style={styles.progressMarker}>
              <View style={styles.progressCore} />
            </View>
          </RNMarker>
        ) : null}

        {origin && (
          <RNMarker coordinate={toCoord(origin)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.originGlow}>
              <View style={styles.originCore} />
            </View>
          </RNMarker>
        )}

        {destination && (
          <RNMarker coordinate={toCoord(destination)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.destMarker}>
              <View style={styles.destInner} />
            </View>
          </RNMarker>
        )}

        {pois.map((poi) => (
          <RNMarker
            key={`poi-${poi.id}`}
            coordinate={toCoord(poi.coordinates)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.poiMarker}>
              <View style={styles.poiMarkerCore} />
            </View>
          </RNMarker>
        ))}

        {clusters.map((cluster) => {
          const isSelected = cluster.stops.some((stop) => selectedIdSet.has(stop.id));
          const isGroup = cluster.stops.length > 1;

          return (
            <RNMarker
              key={`stop-cluster-${cluster.id}`}
              coordinate={toCoord(cluster.coordinates)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSelected}
              onPress={() => onStopClusterPress?.(cluster.stops)}
            >
              <View
                style={[
                  styles.stopMarker,
                  isGroup && styles.stopMarkerGroup,
                  isSelected && styles.stopMarkerSelected,
                ]}
              >
                {isGroup ? (
                  <Text style={styles.stopMarkerCount}>{cluster.stops.length}</Text>
                ) : (
                  <View
                    style={[
                      styles.stopMarkerCore,
                      isSelected && styles.stopMarkerCoreSelected,
                    ]}
                  />
                )}
              </View>
            </RNMarker>
          );
        })}
      </RNMapView>

      {vignette ? (
        <View style={styles.vignetteOverlay} pointerEvents="none">
          <MapCircularVignette
            width={vignette.width}
            height={vignette.height}
            centerX={vignette.centerX}
            centerY={vignette.centerY}
            clearRadius={vignette.clearRadius}
            fadeWidth={vignette.fadeWidth}
          />
        </View>
      ) : null}

      <Text style={styles.attribution} accessibilityLabel={MAP_ATTRIBUTION}>
        {MAP_ATTRIBUTION}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    elevation: 5,
  },
  originGlow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  originCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  progressMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentGlow,
    borderWidth: 2.5,
    borderColor: colors.mapRouteActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  stepTargetMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.mapRouteActive,
    backgroundColor: 'rgba(13, 17, 23, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTargetCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mapRouteActive,
  },
  placeMarkerRoot: {
    width: PLACE_MARKER_SIZE,
    height: PLACE_MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeMarkerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  placeMarkerSlot: {
    width: PLACE_MARKER_SIZE,
    height: PLACE_MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeMarker: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91, 141, 239, 0.72)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  placeMarkerFocused: {
    minWidth: PLACE_MARKER_SIZE,
    height: PLACE_MARKER_SIZE,
    borderRadius: PLACE_MARKER_SIZE / 2,
    backgroundColor: colors.accent,
    borderColor: colors.textPrimary,
    borderWidth: 2.5,
  },
  placeMarkerText: {
    ...typography.labelMedium,
    color: colors.highContrastText,
    fontWeight: '800',
    fontSize: 13,
  },
  placeCalloutCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // Aligne le tip de l’entonnoir sur le centre vertical du point
    marginTop: PLACE_MARKER_SIZE / 2 - PLACE_FUNNEL_TIP_Y,
    flexShrink: 1,
  },
  placeCalloutFunnel: {
    marginRight: -1,
  },
  placeCallout: {
    flexShrink: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: PLACE_CALLOUT_BG,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    gap: 2,
  },
  placeCalloutName: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
  },
  placeCalloutAddress: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 15,
    flexShrink: 1,
  },
  placeCalloutHint: {
    marginTop: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  placeCalloutHintText: {
    ...typography.labelSmall,
    color: colors.highContrastText,
    fontWeight: '800',
    flexShrink: 1,
  },
  destMarker: {
    width: 22,
    height: 22,
    borderWidth: 2.5,
    borderColor: colors.accent,
    backgroundColor: 'rgba(13, 17, 23, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destInner: {
    width: 8,
    height: 8,
    backgroundColor: colors.textPrimary,
  },
  poiMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.mapPoi,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.mapPoiStroke,
  },
  poiMarkerCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFBEB',
  },
  stopMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.mapStop,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.mapStopStroke,
  },
  stopMarkerGroup: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.9)',
  },
  stopMarkerCount: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
  },
  stopMarkerSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderColor: colors.accent,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
  },
  stopMarkerCore: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.textPrimary,
  },
  stopMarkerCoreSelected: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
  },
  boardingMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  navPuck: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPuckHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  navPuckCone: {
    position: 'absolute',
    top: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.accent,
    zIndex: 2,
  },
  navPuckCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 2.5,
    borderColor: colors.textPrimary,
    marginTop: 10,
    zIndex: 3,
  },
  attribution: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    ...typography.labelSmall,
    fontSize: 9,
    color: colors.textTertiary,
    opacity: 0.55,
  },
});
