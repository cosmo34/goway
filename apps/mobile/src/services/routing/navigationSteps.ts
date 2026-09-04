import type { Coordinates, Route, RouteLeg, Stop } from '../../stores/transitStore';

export type NavigationStepKind = 'walk' | 'transit' | 'arrive';

export interface NavigationStep {
  id: string;
  kind: NavigationStepKind;
  title: string;
  subtitle: string;
  from: Coordinates;
  to: Coordinates;
  pathCoordinates: Coordinates[];
  lineName?: string;
  lineColor?: string;
  durationMinutes: number;
}

function findStop(stops: Stop[], stopId?: string, stopName?: string): Stop | undefined {
  if (stopId) {
    const byId = stops.find((stop) => stop.id === stopId);
    if (byId) return byId;
  }
  if (!stopName) return undefined;
  const normalized = stopName.toLowerCase();
  return stops.find(
    (stop) =>
      stop.name.toLowerCase() === normalized ||
      normalized.includes(stop.name.toLowerCase()) ||
      stop.name.toLowerCase().includes(normalized)
  );
}

function legPath(
  leg: RouteLeg,
  cursor: Coordinates,
  destination: Coordinates,
  stops: Stop[]
): Coordinates[] {
  if (leg.geometry && leg.geometry.length >= 2) {
    return leg.geometry;
  }

  if (leg.mode === 'walk') {
    const end =
      leg.to === 'Arrivée'
        ? destination
        : findStop(stops, leg.toStopId, leg.to)?.coordinates ?? destination;
    return [cursor, end];
  }

  const board = findStop(stops, leg.fromStopId, leg.from);
  const alight = findStop(stops, leg.toStopId, leg.to);
  const points: Coordinates[] = [cursor];
  if (board) points.push(board.coordinates);
  if (alight) points.push(alight.coordinates);
  return points;
}

export function buildNavigationSteps(
  route: Route,
  origin: Coordinates,
  destination: Coordinates,
  stops: Stop[]
): NavigationStep[] {
  const steps: NavigationStep[] = [];
  let cursor = origin;

  for (let index = 0; index < route.legs.length; index++) {
    const leg = route.legs[index];
    const isLast = index === route.legs.length - 1;
    const targetStop = findStop(
      stops,
      leg.toStopId,
      leg.to === 'Arrivée' ? undefined : leg.to
    );
    const target =
      leg.to === 'Arrivée' || isLast
        ? destination
        : (targetStop?.coordinates ?? destination);

    const pathCoordinates = legPath(leg, cursor, destination, stops);
    if (pathCoordinates.length >= 2) {
      cursor = pathCoordinates[pathCoordinates.length - 1];
    } else {
      cursor = target;
    }

    if (leg.mode === 'walk') {
      steps.push({
        id: `walk-${index}`,
        kind: 'walk',
        title: isLast ? 'Marchez vers la destination' : `Marchez vers ${leg.to}`,
        subtitle: `${leg.durationMinutes} min à pied`,
        from: pathCoordinates[0] ?? cursor,
        to: target,
        pathCoordinates,
        durationMinutes: leg.durationMinutes,
      });
    } else {
      steps.push({
        id: `transit-${index}`,
        kind: 'transit',
        title: `Prenez ${leg.lineName ?? 'le tram'}`,
        subtitle: `Direction ${leg.to} · ${leg.durationMinutes} min`,
        from: pathCoordinates[0] ?? cursor,
        to: target,
        pathCoordinates,
        lineName: leg.lineName,
        lineColor: leg.lineColor,
        durationMinutes: leg.durationMinutes,
      });
    }
  }

  steps.push({
    id: 'arrive',
    kind: 'arrive',
    title: 'Vous êtes arrivé',
    subtitle: 'Bon voyage !',
    from: destination,
    to: destination,
    pathCoordinates: route.geometry?.length ? route.geometry : [destination],
    durationMinutes: 0,
  });

  return steps;
}

export function buildWalkingNavigationSteps(
  origin: Coordinates,
  destination: Coordinates,
  destinationName: string,
  path: Coordinates[],
  durationMinutes: number
): NavigationStep[] {
  const routePath = path.length >= 2 ? path : [origin, destination];

  return [
    {
      id: 'walk-0',
      kind: 'walk',
      title: `Marchez vers ${destinationName}`,
      subtitle: `${durationMinutes} min à pied`,
      from: origin,
      to: destination,
      pathCoordinates: routePath,
      durationMinutes,
    },
    {
      id: 'arrive',
      kind: 'arrive',
      title: 'Vous êtes arrivé',
      subtitle: destinationName,
      from: destination,
      to: destination,
      pathCoordinates: routePath,
      durationMinutes: 0,
    },
  ];
}

export function createWalkOnlyRoute(
  origin: Coordinates,
  destination: Coordinates,
  destinationName: string,
  path: Coordinates[],
  durationMinutes: number
): Route {
  const now = new Date();
  const routePath = path.length >= 2 ? path : [origin, destination];

  return {
    id: `walk-${now.getTime()}`,
    legs: [
      {
        mode: 'walk',
        from: 'Départ',
        to: destinationName,
        durationMinutes,
        geometry: routePath,
      },
    ],
    totalDurationMinutes: durationMinutes,
    departureTime: now,
    arrivalTime: new Date(now.getTime() + durationMinutes * 60_000),
    walkingMinutes: durationMinutes,
    geometry: routePath,
  };
}
