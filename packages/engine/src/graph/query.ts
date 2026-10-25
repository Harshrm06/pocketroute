/**
 * Query-time graph builder: adds origin/destination nodes, access edges,
 * transfer walk edges, and direct O→D edges.
 * PRD Sections 7.5, 7.7.
 */
import type { LatLng, LineId } from '@pocketroute/shared';
import {
  AUTO_PICKUP_MIN,
  AUTO_SPEED_KM_PER_H,
  CAB_PICKUP_MIN,
  CAB_SPEED_KM_PER_H,
  MAX_WALK_LEG_M,
  MIN_TRANSFER_MIN,
  METRO_BOARDING_PENALTY_MIN,
} from '@pocketroute/shared';
import { autoFareINR, cabFareINR } from '../pricing/index.js';
import { walkMinutes } from '../timing/index.js';
import { haversineKm } from '../geometry/index.js';
import type {
  Edge,
  QueryGraphOptions,
  StateGraph,
  TransitStop,
} from './types.js';
import { encodeState } from './types.js';
import type { StaticGraphResult } from './static.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FEEDER_RADIUS_KM = 4;
const DEFAULT_FEEDER_K = 8;
const DEFAULT_MAX_CANDIDATE_STOPS = 60;

const ORIGIN_NODE_ID = 'O';
const DEST_NODE_ID = 'D';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StopWithDistance {
  stop: TransitStop;
  distKm: number;
}

/**
 * Finds transit stops near a given point, sorted by distance.
 * Implements PRD §7.7 candidate pruning.
 */
function findNearbyStops(
  point: LatLng,
  allStops: TransitStop[],
  maxWalkM: number,
  maxCandidates: number,
): StopWithDistance[] {
  const maxWalkKm = maxWalkM / 1000;
  const withDist: StopWithDistance[] = [];

  for (const stop of allStops) {
    const distKm = haversineKm(point, { lat: stop.lat, lng: stop.lng });
    withDist.push({ stop, distKm });
  }

  // Sort by distance
  withDist.sort((a, b) => a.distKm - b.distKm);

  // PRD §7.7: at most maxCandidates nearest + any within walk range
  const candidates: StopWithDistance[] = [];
  const seen = new Set<string>();

  // First pass: all stops within walk range
  for (const sd of withDist) {
    if (sd.distKm <= maxWalkKm) {
      if (!seen.has(sd.stop.nodeId)) {
        candidates.push(sd);
        seen.add(sd.stop.nodeId);
      }
    }
  }

  // Second pass: fill up to maxCandidates with nearest
  for (const sd of withDist) {
    if (candidates.length >= maxCandidates) break;
    if (!seen.has(sd.stop.nodeId)) {
      candidates.push(sd);
      seen.add(sd.stop.nodeId);
    }
  }

  return candidates;
}

/**
 * K-nearest stops within a radius (for auto/cab feeder edges).
 */
function kNearestInRadius(
  point: LatLng,
  allStops: TransitStop[],
  radiusKm: number,
  k: number,
): StopWithDistance[] {
  const withDist: StopWithDistance[] = [];

  for (const stop of allStops) {
    const distKm = haversineKm(point, { lat: stop.lat, lng: stop.lng });
    if (distKm <= radiusKm) {
      withDist.push({ stop, distKm });
    }
  }

  withDist.sort((a, b) => a.distKm - b.distKm);

  // Deduplicate by nodeId and take k
  const result: StopWithDistance[] = [];
  const seen = new Set<string>();
  for (const sd of withDist) {
    if (result.length >= k) break;
    if (!seen.has(sd.stop.nodeId)) {
      result.push(sd);
      seen.add(sd.stop.nodeId);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Walk edge builder
// ---------------------------------------------------------------------------

function makeWalkEdge(
  fromNodeId: string,
  toNodeId: string,
  distKm: number,
  fromLine: LineId | 'NONE' = 'WALK',
): Edge {
  const distM = distKm * 1000;
  const walkMin = walkMinutes(distM);
  const from = encodeState(fromNodeId, fromLine);
  const to = encodeState(toNodeId, 'WALK');

  return {
    from,
    to,
    line: 'WALK',
    mode: 'WALK',
    fareINR: 0,
    minTimeMin: walkMin,
    timeAt: (t: number) => t + walkMin,
    meta: {
      distanceKm: distKm,
      stops: 0,
      geometryQuality: 'estimated',
    },
  };
}

// ---------------------------------------------------------------------------
// Auto edge builder
// ---------------------------------------------------------------------------

function makeAutoEdge(
  fromNodeId: string,
  toNodeId: string,
  distKm: number,
  fromLine: LineId | 'NONE' = 'AUTO',
): Edge {
  const roadKm = distKm * 1.25; // road estimate
  const rideMin = (roadKm / AUTO_SPEED_KM_PER_H) * 60;
  const totalMin = AUTO_PICKUP_MIN + rideMin;
  const from = encodeState(fromNodeId, fromLine);
  const to = encodeState(toNodeId, 'AUTO');

  return {
    from,
    to,
    line: 'AUTO',
    mode: 'AUTO',
    fareINR: autoFareINR(roadKm, 12), // use noon as default hour
    minTimeMin: totalMin,
    timeAt: (t: number) => {
      const localHour = Math.floor((((t % 1440) + 1440) % 1440) / 60);
      const fare = autoFareINR(roadKm, localHour);
      // We store the worst-case fare; runtime resolves exact fare on reconstruction
      void fare;
      return t + totalMin;
    },
    meta: {
      distanceKm: roadKm,
      stops: 0,
      geometryQuality: 'estimated',
    },
  };
}

// ---------------------------------------------------------------------------
// Cab edge builder
// ---------------------------------------------------------------------------

function makeCabEdge(
  fromNodeId: string,
  toNodeId: string,
  distKm: number,
  fromLine: LineId | 'NONE' = 'CAB',
): Edge {
  const roadKm = distKm * 1.25;
  const rideMin = (roadKm / CAB_SPEED_KM_PER_H) * 60;
  const totalMin = CAB_PICKUP_MIN + rideMin;
  const from = encodeState(fromNodeId, fromLine);
  const to = encodeState(toNodeId, 'CAB');

  // Use rush-hour fare as conservative estimate
  const fare = cabFareINR(roadKm, rideMin, true);

  return {
    from,
    to,
    line: 'CAB',
    mode: 'CAB',
    fareINR: fare,
    minTimeMin: totalMin,
    timeAt: (t: number) => {
      void t;
      return t + totalMin;
    },
    meta: {
      distanceKm: roadKm,
      stops: 0,
      geometryQuality: 'estimated',
    },
  };
}

// ---------------------------------------------------------------------------
// Transfer edge builder
// ---------------------------------------------------------------------------

function makeTransferWalkEdge(
  fromNodeId: string,
  toNodeId: string,
  distKm: number,
  targetIsMetro: boolean,
): Edge {
  const distM = distKm * 1000;
  const walkMin = walkMinutes(distM);
  // PRD §7.6: transfer adds MIN_TRANSFER_MIN and boarding penalty if target is metro
  const transferPenalty =
    MIN_TRANSFER_MIN + (targetIsMetro ? METRO_BOARDING_PENALTY_MIN : 0);
  const totalMin = walkMin + transferPenalty;
  const from = encodeState(fromNodeId, 'WALK');
  const to = encodeState(toNodeId, 'WALK');

  return {
    from,
    to,
    line: 'WALK',
    mode: 'WALK',
    fareINR: 0,
    minTimeMin: totalMin,
    timeAt: (t: number) => t + totalMin,
    meta: {
      distanceKm: distKm,
      stops: 0,
      geometryQuality: 'estimated',
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a per-query graph by adding origin/destination nodes and access
 * edges to the static macro-ride graph.
 *
 * PRD §7.5 (access and transfer edges) and §7.7 (candidate pruning).
 *
 * @param staticResult The static graph (macro-ride edges) from buildStaticGraph.
 * @param origin User's origin point.
 * @param destination User's destination point.
 * @param options Query options (walk distance, include auto/cab, etc.).
 * @returns A complete StateGraph ready for Dijkstra or RCSPP search.
 */
export function buildQueryGraph(
  staticResult: StaticGraphResult,
  origin: LatLng & { label?: string },
  destination: LatLng & { label?: string },
  options: QueryGraphOptions,
): StateGraph {
  const maxWalkM = options.maxWalkM ?? MAX_WALK_LEG_M;
  const maxWalkKm = maxWalkM / 1000;
  const feederRadiusKm = options.feederRadiusKm ?? DEFAULT_FEEDER_RADIUS_KM;
  const feederK = options.feederK ?? DEFAULT_FEEDER_K;
  const maxCandidates =
    options.maxCandidateStops ?? DEFAULT_MAX_CANDIDATE_STOPS;

  // Clone adjacency lists from static graph
  const nodes = new Map(staticResult.graph.nodes);
  const adj = new Map<string, Edge[]>();
  for (const [state, edges] of staticResult.graph.adj) {
    adj.set(state, [...edges]);
  }
  const nodeAdj = new Map<string, Edge[]>();
  for (const [nodeId, edges] of staticResult.graph.nodeAdj) {
    nodeAdj.set(nodeId, [...edges]);
  }
  let edgeCount = staticResult.graph.edgeCount;

  const addEdge = (edge: Edge): void => {
    if (edge.fareINR < 0) {
      throw new Error(
        `Negative fare on edge ${edge.from} → ${edge.to}: ${edge.fareINR}`,
      );
    }
    const list = adj.get(edge.from) ?? [];
    list.push(edge);
    adj.set(edge.from, list);

    const fromNode = edge.from.slice(0, edge.from.indexOf('|'));
    const nList = nodeAdj.get(fromNode) ?? [];
    nList.push(edge);
    nodeAdj.set(fromNode, nList);

    edgeCount++;
  };

  // ---- Register origin and destination nodes ----
  const allLines: (LineId | 'NONE')[] = ['NONE', 'WALK'];
  if (options.includeAuto) allLines.push('AUTO');
  if (options.includeCab) allLines.push('CAB');

  nodes.set(ORIGIN_NODE_ID, {
    id: ORIGIN_NODE_ID,
    name: origin.label ?? 'Origin',
    lat: origin.lat,
    lng: origin.lng,
    type: 'origin',
    lines: allLines,
  });

  nodes.set(DEST_NODE_ID, {
    id: DEST_NODE_ID,
    name: destination.label ?? 'Destination',
    lat: destination.lat,
    lng: destination.lng,
    type: 'destination',
    lines: allLines,
  });

  // ---- Find candidate stops near origin and destination ----
  const originCandidates = findNearbyStops(
    origin,
    staticResult.allStops,
    maxWalkM,
    maxCandidates,
  );
  const destCandidates = findNearbyStops(
    destination,
    staticResult.allStops,
    maxWalkM,
    maxCandidates,
  );

  // Build a set of all candidate node IDs for transfer edges
  const candidateNodeIds = new Set<string>();
  for (const sd of originCandidates) candidateNodeIds.add(sd.stop.nodeId);
  for (const sd of destCandidates) candidateNodeIds.add(sd.stop.nodeId);

  // ---- O → stop: walk access edges ----
  for (const { stop, distKm } of originCandidates) {
    if (distKm <= maxWalkKm) {
      addEdge(makeWalkEdge(ORIGIN_NODE_ID, stop.nodeId, distKm, 'NONE'));
    }
  }

  // ---- stop → D: walk egress edges ----
  for (const { stop, distKm } of destCandidates) {
    if (distKm <= maxWalkKm) {
      addEdge(makeWalkEdge(stop.nodeId, DEST_NODE_ID, distKm, 'WALK'));
    }
  }

  // ---- O → stop: auto/cab feeder edges ----
  if (options.includeAuto) {
    const autoStops = kNearestInRadius(
      origin,
      staticResult.allStops,
      feederRadiusKm,
      feederK,
    );
    for (const { stop, distKm } of autoStops) {
      addEdge(makeAutoEdge(ORIGIN_NODE_ID, stop.nodeId, distKm, 'NONE'));
    }
  }

  if (options.includeCab) {
    const cabStops = kNearestInRadius(
      origin,
      staticResult.allStops,
      feederRadiusKm,
      feederK,
    );
    for (const { stop, distKm } of cabStops) {
      addEdge(makeCabEdge(ORIGIN_NODE_ID, stop.nodeId, distKm, 'NONE'));
    }
  }

  // ---- stop → D: auto/cab egress edges ----
  if (options.includeAuto) {
    const autoStops = kNearestInRadius(
      destination,
      staticResult.allStops,
      feederRadiusKm,
      feederK,
    );
    for (const { stop, distKm } of autoStops) {
      addEdge(makeAutoEdge(stop.nodeId, DEST_NODE_ID, distKm, 'AUTO'));
    }
  }

  if (options.includeCab) {
    const cabStops = kNearestInRadius(
      destination,
      staticResult.allStops,
      feederRadiusKm,
      feederK,
    );
    for (const { stop, distKm } of cabStops) {
      addEdge(makeCabEdge(stop.nodeId, DEST_NODE_ID, distKm, 'CAB'));
    }
  }

  // ---- O → D: direct edges ----
  const odDistKm = haversineKm(origin, destination);

  // Direct walk (if ≤ maxWalkM)
  if (odDistKm * 1000 <= maxWalkM) {
    addEdge(makeWalkEdge(ORIGIN_NODE_ID, DEST_NODE_ID, odDistKm, 'NONE'));
  }

  // Direct auto
  if (options.includeAuto) {
    addEdge(makeAutoEdge(ORIGIN_NODE_ID, DEST_NODE_ID, odDistKm, 'NONE'));
  }

  // Direct cab
  if (options.includeCab) {
    addEdge(makeCabEdge(ORIGIN_NODE_ID, DEST_NODE_ID, odDistKm, 'NONE'));
  }

  // ---- Transfer edges: stop → stop (walk within maxWalkM) ----
  // Only among candidate stops to limit graph size
  const candidateStopsArr = staticResult.allStops.filter((s) =>
    candidateNodeIds.has(s.nodeId),
  );

  for (let i = 0; i < candidateStopsArr.length; i++) {
    for (let j = i + 1; j < candidateStopsArr.length; j++) {
      const a = candidateStopsArr[i]!;
      const b = candidateStopsArr[j]!;

      // Don't create transfer between same physical node
      if (a.nodeId === b.nodeId) continue;

      const distKm = haversineKm(
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      );

      if (distKm * 1000 <= maxWalkM) {
        const bIsMetro = b.type === 'metro_station';
        const aIsMetro = a.type === 'metro_station';
        addEdge(makeTransferWalkEdge(a.nodeId, b.nodeId, distKm, bIsMetro));
        addEdge(makeTransferWalkEdge(b.nodeId, a.nodeId, distKm, aIsMetro));
      }
    }
  }

  // ---- Transfer edges: auto/cab between stops ----
  if (options.includeAuto || options.includeCab) {
    for (const sd of candidateStopsArr) {
      const nearby = kNearestInRadius(
        { lat: sd.lat, lng: sd.lng },
        candidateStopsArr
          .filter((s) => s.nodeId !== sd.nodeId)
          .map((s) => ({
            ...s,
          })),
        feederRadiusKm,
        feederK,
      );
      for (const { stop: target, distKm } of nearby) {
        if (options.includeAuto) {
          addEdge(makeAutoEdge(sd.nodeId, target.nodeId, distKm, 'AUTO'));
        }
        if (options.includeCab) {
          addEdge(makeCabEdge(sd.nodeId, target.nodeId, distKm, 'CAB'));
        }
      }
    }
  }

  return {
    nodes,
    adj,
    nodeAdj,
    edgeCount,
    lineCount: staticResult.graph.lineCount,
  };
}

/** Re-export constants for convenience. */
export { ORIGIN_NODE_ID, DEST_NODE_ID };
