import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import { MAP_ATTRIBUTION } from '../config/mapTiles';
import { colors, typography } from '../theme';
import type { Coordinates, PointOfInterest, Stop } from '../stores/transitStore';
import type { StopCluster } from '../utils/clusterStops';
import { defaultMapRegion } from '../utils/mapRegion';
import { MapCircularVignette } from './MapCircularVignette';

const RNMapView = MapView as any;
const RNMarker = Marker as any;

const INITIAL_REGION: Region = defaultMapRegion();

const MIN_ZOOM_DELTA = 0.004;
const MAX_ZOOM_DELTA = 0.35;
const ZOOM_FACTOR = 0.72;

/** Tracé à pied sur l’itinéraire : fin et discret */
const WALK_ROUTE_STROKE_WIDTH = 3;
const WALK_ROUTE_DASH_PATTERN: [number, number] = [4, 4];

export interface TransitMapHandle {
  recenter: (coords: Coordinates, animated?: boolean) => void;
  fitRoute: (coords: Coordinates[]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface RouteMapSegment {
  coordinates: Coordinates[];
  dashed?: boolean;
  color?: string;
}

interface TransitMapProps {
  userLocation?: Coordinates | null;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  routeCoordinates?: Coordinates[];
  routeSegments?: RouteMapSegment[];
  walkCoordinates?: Coordinates[];
  boardingStop?: Stop | null;
  lineCoordinates?: Coordinates[];
  lineColor?: string;
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

export const TransitMap = forwardRef<TransitMapHandle, TransitMapProps>(function TransitMap(
  {
    origin,
    destination,
    routeCoordinates,
    routeSegments,
    walkCoordinates,
    boardingStop,
    lineCoordinates,
    lineColor,
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
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef(INITIAL_REGION);

  const recenter = useCallback((coords: Coordinates, animated = true) => {
    const region = { ...coords, latitudeDelta: 0.025, longitudeDelta: 0.025 };
    regionRef.current = region;
    if (animated) mapRef.current?.animateToRegion(region, 500);
    else mapRef.current?.animateToRegion(region, 0);
  }, []);

  const fitRoute = useCallback(
    (coords: Coordinates[]) => {
      if (coords.length < 2) return;
      const pad = Math.round(clearRadius * 0.2);
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
    mapRef.current?.animateToRegion(next, 220);
  }, []);

  const zoomIn = useCallback(() => zoomBy(ZOOM_FACTOR), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_FACTOR), [zoomBy]);

  useImperativeHandle(ref, () => ({ recenter, fitRoute, zoomIn, zoomOut }), [
    recenter,
    fitRoute,
    zoomIn,
    zoomOut,
  ]);

  const selectedIdSet = new Set(selectedStopIds);
  const clusters =
    stopClusters ??
    (lineStops.length > 0 ? lineStops : stops).map((stop) => ({
      id: stop.id,
      stops: [stop],
      coordinates: stop.coordinates,
    }));

  return (
    <View style={styles.container}>
      <RNMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(region: Region) => {
          regionRef.current = region;
          onRegionChangeComplete?.(region);
        }}
        accessibilityLabel="Carte interactive Montpellier"
      >
        {lineCoordinates && lineCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={lineCoordinates}
              strokeColor={`${lineColor ?? colors.accent}55`}
              strokeWidth={12}
            />
            <Polyline
              coordinates={lineCoordinates}
              strokeColor={lineColor ?? colors.accent}
              strokeWidth={5}
            />
          </>
        )}

        {routeSegments && routeSegments.length > 0
          ? routeSegments.map((segment, index) =>
              segment.coordinates.length > 1 ? (
                <Polyline
                  key={`route-segment-${index}`}
                  coordinates={segment.coordinates}
                  strokeColor={segment.color ?? (segment.dashed ? colors.mapRouteActive : colors.mapRoute)}
                  strokeWidth={segment.dashed ? WALK_ROUTE_STROKE_WIDTH : 6}
                  lineDashPattern={segment.dashed ? WALK_ROUTE_DASH_PATTERN : undefined}
                />
              ) : null
            )
          : null}

        {!routeSegments?.length && routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline coordinates={routeCoordinates} strokeColor={colors.mapRoute} strokeWidth={6} />
        )}

        {walkCoordinates && walkCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={walkCoordinates}
              strokeColor={colors.mapRouteActive}
              strokeWidth={WALK_ROUTE_STROKE_WIDTH}
              lineDashPattern={WALK_ROUTE_DASH_PATTERN}
            />
          </>
        )}

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
