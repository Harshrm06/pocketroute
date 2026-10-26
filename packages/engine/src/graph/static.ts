/**
 * Static graph builder: macro-ride edges for metro lines and bus corridors.
 * PRD Sections 7.3, 7.4.
 *
 * All macro-ride edges are built once at process start and reused across
 * queries. No I/O happens here; the caller must supply parsed network data.
 */
import type { LineId } from '@pocketroute/shared';
import { METRO_SPEED_KM_PER_H } from '@pocketroute/shared';
import { metroFareINR, busFareINR } from '../pricing/index.js';
import {
  metroNextTrain,
  busHeadwayAt,
  busSpeedAt,
  nextDeparture,
  walkMinutes,
  METRO_OPERATING_START_MIN,
  METRO_OPERATING_END_MIN,
} from '../timing/index.js';
import { haversineKm } from '../geometry/index.js';
import type {
  Edge,
  GraphNode,
  MetroLine,
  BusRoute,
  NetworkData,
  StateGraph,
  TransitStop,
} from './types.js';
import { encodeState } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sums segmentDistanceKm from stop index i to stop index k (exclusive of k's
 * own segment distance, which points to the *next* stop).
 */
function busRoadDistanceKm(
  stops: { segmentDistanceKm: number }[],
  i: number,
  k: number,
): number {
  let total = 0;
  for (let s = i; s < k; s++) {
    total += stops[s]!.segmentDistanceKm;
  }
  return total;
}

/**
 * Sum of haversine distances station-to-station for metro (no road segments).
 * Metro distance is measured as consecutive station-to-station sum.
 */
function metroRoadDistanceKm(
  stations: { lat: number; lng: number }[],
  i: number,
  k: number,
): number {
  let total = 0;
  for (let s = i; s < k; s++) {
    total += haversineKm(
      { lat: stations[s]!.lat, lng: stations[s]!.lng },
      { lat: stations[s + 1]!.lat, lng: stations[s + 1]!.lng },
    );
  }
  return total;
}

// ---------------------------------------------------------------------------
// Metro macro-ride edges
// ---------------------------------------------------------------------------

function buildMetroMacroRides(line: MetroLine): {
  edges: Edge[];
  nodes: GraphNode[];
  stops: TransitStop[];
} {
  const lineId = line.id as LineId;
  const stations = line.stations;
  const edges: Edge[] = [];
  const nodes: GraphNode[] = [];
  const stops: TransitStop[] = [];

  // Register nodes
  for (const station of stations) {
    nodes.push({
      id: station.id,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      type: 'metro_station',
      lines: [lineId],
    });
    stops.push({
      nodeId: station.id,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      type: 'metro_station',
      line: lineId,
    });
  }

  // Create macro-ride edges for every pair (i, k) with i < k
  // PRD §7.3: represents "stay on this vehicle from s_i to s_k"
  for (let i = 0; i < stations.length; i++) {
    for (let k = i + 1; k < stations.length; k++) {
      const fromStation = stations[i]!;
      const toStation = stations[k]!;
      const distKm = metroRoadDistanceKm(stations, i, k);
      const fare = metroFareINR(distKm);
      const rideTimeMin = (distKm / METRO_SPEED_KM_PER_H) * 60;
      const stopsBetween = k - i;

      const from = encodeState(fromStation.id, lineId);
      const to = encodeState(toStation.id, lineId);

      const timeAt = (t: number): number => {
        // Find next train departure using nextDeparture logic
        const dep = metroNextTrain(t, lineId);
        if (dep === null) return Infinity;
        // Metro boarding allowed strictly between 06:00 and 22:00 IST per data/pune/params.json
        const depTod = ((dep % 1440) + 1440) % 1440;
        if (
          depTod < METRO_OPERATING_START_MIN ||
          depTod > METRO_OPERATING_END_MIN
        ) {
          return Infinity;
        }
        return dep + rideTimeMin;
      };

      edges.push({
        from,
        to,
        line: lineId,
        mode: 'METRO',
        fareINR: fare,
        minTimeMin: rideTimeMin,
        timeAt,
        meta: {
          distanceKm: distKm,
          stops: stopsBetween,
          geometryRef: `metro/${lineId}`,
          geometryQuality: 'schematic',
        },
      });
    }
  }

  return { edges, nodes, stops };
}

// ---------------------------------------------------------------------------
// Bus macro-ride edges
// ---------------------------------------------------------------------------

function buildBusMacroRides(route: BusRoute): {
  edges: Edge[];
  nodes: GraphNode[];
  stops: TransitStop[];
} {
  const lineId = `BUS_${route.routeNo}` as LineId;
  const routeStops = route.stops;
  const edges: Edge[] = [];
  const nodes: GraphNode[] = [];
  const stops: TransitStop[] = [];

  // Register nodes
  for (const stop of routeStops) {
    nodes.push({
      id: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      type: 'bus_stop',
      lines: [lineId],
    });
    stops.push({
      nodeId: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      type: 'bus_stop',
      line: lineId,
    });
  }

  // Create macro-ride edges for every pair (i, k) with i < k
  for (let i = 0; i < routeStops.length; i++) {
    for (let k = i + 1; k < routeStops.length; k++) {
      const fromStop = routeStops[i]!;
      const toStop = routeStops[k]!;
      const distKm = busRoadDistanceKm(routeStops, i, k);
      const fare = busFareINR(distKm);
      const stopsBetween = k - i;

      const from = encodeState(fromStop.id, lineId);
      const to = encodeState(toStop.id, lineId);

      // Bus ride time is time-dependent (speed varies by time of day)
      const timeAt = (t: number): number => {
        // Find the next bus departure on this corridor
        const headway = busHeadwayAt(t, {
          peakHeadway: route.peakHeadway,
          offPeakHeadway: route.offPeakHeadway,
        });
        const dep = nextDeparture(t, route.firstDeparture, headway);
        if (dep === null) return Infinity;
        const speed = busSpeedAt(dep);
        const rideMin = (distKm / speed) * 60;
        return dep + rideMin;
      };

      // Minimum possible time: use best-case headway (0 wait) + fastest speed
      const minRideMin = (distKm / 22) * 60; // off-peak bus speed = 22 km/h

      edges.push({
        from,
        to,
        line: lineId,
        mode: 'BUS',
        fareINR: fare,
        minTimeMin: minRideMin,
        timeAt,
        meta: {
          distanceKm: distKm,
          stops: stopsBetween,
          geometryRef: `bus/${route.routeNo}`,
          geometryQuality: 'estimated',
          routeNumbers: route.routeNumbers ?? [route.routeNo],
          routeName: route.label,
          headsign: routeStops[routeStops.length - 1]!.name,
          intermediateStops: routeStops.slice(i + 1, k).map((s) => s.name),
          firstBusMin: route.firstBusMin ?? route.firstDeparture,
          lastBusMin: route.lastBusMin ?? 1380,
          peakHeadwayMin: route.peakHeadwayMin ?? route.peakHeadway,
          offPeakHeadwayMin: route.offPeakHeadwayMin ?? route.offPeakHeadway,
          nightHeadwayMin: route.nightHeadwayMin ?? 30,
          stopOffsetMin: route.stopOffsetMin,
          scheduleSource: route.scheduleSource,
        },
      });
    }
  }

  return { edges, nodes, stops };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StaticGraphResult {
  /** The static graph containing all macro-ride edges. */
  graph: StateGraph;
  /** Flat list of all transit stops for nearest-neighbor queries. */
  allStops: TransitStop[];
}

/**
 * Builds the static portion of the state graph: macro-ride edges for every
 * metro line and bus corridor in the network.
 *
 * This is called once at process start. The returned graph is immutable and
 * shared across queries; per-query origin/destination access edges are added
 * by `buildQueryGraph`.
 *
 * @param network Parsed metro and bus data from JSON files.
 * @returns Static graph result with macro-ride edges and transit stop index.
 */
export function buildStaticGraph(network: NetworkData): StaticGraphResult {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, Edge[]>();
  const nodeAdj = new Map<string, Edge[]>();
  let edgeCount = 0;
  const lineIds = new Set<string>();
  const allStops: TransitStop[] = [];

  // Always include NONE, WALK, AUTO, CAB in line count
  lineIds.add('NONE');
  lineIds.add('WALK');
  lineIds.add('AUTO');
  lineIds.add('CAB');

  const addEdge = (edge: Edge): void => {
    if (edge.fareINR < 0) {
      throw new Error(
        `Negative fare on edge ${edge.from} → ${edge.to}: ${edge.fareINR}`,
      );
    }
    const stateList = adj.get(edge.from) ?? [];
    stateList.push(edge);
    adj.set(edge.from, stateList);

    const fromNode = edge.from.slice(0, edge.from.indexOf('|'));
    const nodeList = nodeAdj.get(fromNode) ?? [];
    nodeList.push(edge);
    nodeAdj.set(fromNode, nodeList);

    edgeCount++;
  };

  // ---- Metro lines ----
  for (const line of network.metro.lines) {
    const result = buildMetroMacroRides(line);
    lineIds.add(line.id);

    for (const node of result.nodes) {
      const existing = nodes.get(node.id);
      if (existing) {
        // Merge line lists for interchange stations
        for (const l of node.lines) {
          if (!existing.lines.includes(l)) {
            existing.lines.push(l);
          }
        }
      } else {
        nodes.set(node.id, node);
      }
    }

    for (const edge of result.edges) {
      addEdge(edge);
    }

    allStops.push(...result.stops);
  }

  // ---- Bus corridors ----
  for (const route of network.bus.routes) {
    const result = buildBusMacroRides(route);
    lineIds.add(`BUS_${route.routeNo}`);

    for (const node of result.nodes) {
      const existing = nodes.get(node.id);
      if (existing) {
        for (const l of node.lines) {
          if (!existing.lines.includes(l)) {
            existing.lines.push(l);
          }
        }
      } else {
        nodes.set(node.id, node);
      }
    }

    for (const edge of result.edges) {
      addEdge(edge);
    }

    allStops.push(...result.stops);
  }

  return {
    graph: {
      nodes,
      adj,
      nodeAdj,
      edgeCount,
      lineCount: lineIds.size,
    },
    allStops,
  };
}

/**
 * Utility to compute walk time in minutes for a distance in meters,
 * re-exported for use in query graph building.
 */
export { walkMinutes };
