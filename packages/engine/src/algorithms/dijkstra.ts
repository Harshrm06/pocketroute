/**
 * Multi-criteria Dijkstra solver for Route A (Fastest) and Route B (Cheapest).
 * PRD Section 8.2.
 */
import type { GeometryQuality, LineId, Mode } from '@pocketroute/shared';
import type { Edge, StateGraph } from '../graph/index.js';
import { decodeState, encodeState } from '../graph/index.js';
import { formatHHmm24 } from '../timing/index.js';
import { BinaryHeap } from '../structures/heap.js';
import type { Profiler } from '../profiler/index.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DijkstraLeg {
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  departMinutes: number;
  arriveMinutes: number;
  durationMin: number;
  fare: number;
  fareINR: number;
  line: LineId;
  mode: Mode;
  distanceKm: number;
  stops: number;
  geometryQuality?: GeometryQuality;
  geometryRef?: string;
  edge?: Edge;
  meta?: import('../graph/index.js').EdgeMeta;
}

export interface RouteResult {
  feasible: true;
  totalTimeMin: number;
  totalFareINR: number;
  arrivalTime: string;
  departureTime: string;
  arrivalMinutes: number;
  departureMinutes: number;
  durationMin: number;
  legs: DijkstraLeg[];
}

export interface Infeasible {
  feasible: false;
  minimumRequiredFareINR?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Search state entry
// ---------------------------------------------------------------------------

interface HeapEntry {
  searchState: string;
  nodeId: string;
  lineId: LineId | 'NONE';
  busTransfers: number;
  t: number;
  c: number;
}

interface DistEntry {
  t: number;
  c: number;
  busTransfers: number;
  parentEdge?: Edge;
  parentSearchState?: string;
}

// ---------------------------------------------------------------------------
// Path reconstruction helper
// ---------------------------------------------------------------------------

function encodeSearchState(
  nodeId: string,
  lineId: LineId | 'NONE',
  busTransfers: number,
): string {
  if (lineId.startsWith('BUS_')) {
    return `${nodeId}|${lineId}|${busTransfers}`;
  }
  return `${nodeId}|${lineId}`;
}

function reconstructPath(
  destSearchState: string,
  dist: Map<string, DistEntry>,
  t0: number,
): RouteResult {
  const destDist = dist.get(destSearchState)!;
  const legs: DijkstraLeg[] = [];
  let currSearchState: string | undefined = destSearchState;

  while (currSearchState) {
    const info = dist.get(currSearchState);
    if (!info || !info.parentEdge || !info.parentSearchState) break;

    const parentInfo = dist.get(info.parentSearchState);
    const departT = parentInfo ? parentInfo.t : t0;
    const arriveT = info.t;
    const edge = info.parentEdge;

    const fromNode = decodeState(edge.from).nodeId;
    const toNode = decodeState(edge.to).nodeId;

    legs.push({
      from: fromNode,
      to: toNode,
      departAt: formatHHmm24(departT),
      arriveAt: formatHHmm24(arriveT),
      departMinutes: departT,
      arriveMinutes: arriveT,
      durationMin: arriveT - departT,
      fare: edge.fareINR,
      fareINR: edge.fareINR,
      line: edge.line,
      mode: edge.mode,
      distanceKm: edge.meta.distanceKm,
      stops: edge.meta.stops,
      geometryQuality: edge.meta.geometryQuality,
      geometryRef: edge.meta.geometryRef,
      edge,
      meta: edge.meta,
    });

    currSearchState = info.parentSearchState;
  }

  legs.reverse();

  return {
    feasible: true,
    totalTimeMin: destDist.t - t0,
    totalFareINR: destDist.c,
    arrivalTime: formatHHmm24(destDist.t),
    departureTime: formatHHmm24(t0),
    arrivalMinutes: destDist.t,
    departureMinutes: t0,
    durationMin: destDist.t - t0,
    legs,
  };
}

// ---------------------------------------------------------------------------
// Dijkstra algorithm
// ---------------------------------------------------------------------------

export interface DijkstraOptions {
  maxBusTransfers?: number;
  transferFrictionMin?: number;
}

/**
 * Executes multi-criteria Dijkstra over the state graph.
 *
 * PRD §8.2 & v1.2.0:
 * - Route A (Fastest): key = "TIME", priority = arrival time t (ties broken by c, then transfers).
 * - Route B (Cheapest): key = "COST", priority = (c, t, transfers) lexicographic.
 *
 * Hard constraints:
 * - Rule C: skips edges where edge.line === state.line (no consecutive rides on the same line).
 * - busTransfers <= maxBusTransfers (default 2).
 *
 * @param graph The line-expanded state graph.
 * @param origin Origin node identifier (e.g. 'O' or station id).
 * @param dest Destination node identifier (e.g. 'D' or station id).
 * @param key Optimization criterion: 'TIME' for fastest, 'COST' for cheapest.
 * @param profiler Optional profiler to track pushes, pops, relaxations.
 * @param t0 Departure time in minutes since midnight IST (default 0).
 * @param options Optional maxBusTransfers and transferFrictionMin.
 * @returns RouteResult if a path exists, otherwise Infeasible.
 */
export function dijkstra(
  graph: StateGraph,
  origin: string,
  dest: string,
  key: 'TIME' | 'COST',
  profiler?: Profiler,
  t0 = 0,
  options?: DijkstraOptions,
): RouteResult | Infeasible {
  const maxBusTransfers = options?.maxBusTransfers ?? 2;
  const transferFrictionMin = options?.transferFrictionMin ?? 2;

  const comparator = (a: HeapEntry, b: HeapEntry): number => {
    if (key === 'TIME') {
      if (a.t !== b.t) return a.t - b.t;
      if (a.c !== b.c) return a.c - b.c;
      return a.busTransfers - b.busTransfers;
    } else {
      if (a.c !== b.c) return a.c - b.c;
      if (a.t !== b.t) return a.t - b.t;
      return a.busTransfers - b.busTransfers;
    }
  };

  const heap = new BinaryHeap<HeapEntry>(comparator);
  const dist = new Map<string, DistEntry>();

  const startSearchState = encodeSearchState(origin, 'NONE', 0);
  dist.set(startSearchState, { t: t0, c: 0, busTransfers: 0 });
  heap.push({
    searchState: startSearchState,
    nodeId: origin,
    lineId: 'NONE',
    busTransfers: 0,
    t: t0,
    c: 0,
  });
  profiler?.push();

  while (!heap.isEmpty()) {
    const item = heap.pop()!;
    profiler?.pop();

    const currDist = dist.get(item.searchState);
    if (!currDist) continue;

    // Check if stale
    if (key === 'TIME') {
      if (
        item.t > currDist.t ||
        (item.t === currDist.t && item.c > currDist.c)
      ) {
        continue;
      }
    } else {
      if (
        item.c > currDist.c ||
        (item.c === currDist.c && item.t > currDist.t)
      ) {
        continue;
      }
    }

    const currNode = item.nodeId;
    const currLine = item.lineId;

    // Goal check
    if (currNode === dest) {
      return reconstructPath(item.searchState, dist, t0);
    }

    // Outgoing edges from currNode
    const outgoing =
      graph.nodeAdj?.get(currNode) ??
      graph.adj.get(encodeState(currNode, currLine)) ??
      [];

    for (const e of outgoing) {
      // Rule C: In any path, two consecutive edges may not share the same line identifier
      if (e.line === currLine) continue;

      const isPrevBus = currLine.startsWith('BUS_');
      const isNextBus = e.mode === 'BUS';
      const isBusToBus = isPrevBus && isNextBus;
      const nextTransfers = isBusToBus
        ? item.busTransfers + 1
        : item.busTransfers;

      if (nextTransfers > maxBusTransfers) continue;

      profiler?.relax();

      const readyTime = isBusToBus
        ? currDist.t + transferFrictionMin
        : currDist.t;
      const arrTime = e.timeAt(readyTime);
      if (!Number.isFinite(arrTime)) continue;

      const candT = arrTime;
      const candC = currDist.c + e.fareINR;
      const targetNode = decodeState(e.to).nodeId;
      const targetSearchState = encodeSearchState(
        targetNode,
        e.line,
        nextTransfers,
      );

      const targetDist = dist.get(targetSearchState);
      let isBetter = false;

      if (!targetDist) {
        isBetter = true;
      } else if (key === 'TIME') {
        isBetter =
          candT < targetDist.t ||
          (candT === targetDist.t && candC < targetDist.c) ||
          (candT === targetDist.t &&
            candC === targetDist.c &&
            nextTransfers < targetDist.busTransfers);
      } else {
        isBetter =
          candC < targetDist.c ||
          (candC === targetDist.c && candT < targetDist.t) ||
          (candC === targetDist.c &&
            candT === targetDist.t &&
            nextTransfers < targetDist.busTransfers);
      }

      if (isBetter) {
        dist.set(targetSearchState, {
          t: candT,
          c: candC,
          busTransfers: nextTransfers,
          parentEdge: e,
          parentSearchState: item.searchState,
        });
        heap.push({
          searchState: targetSearchState,
          nodeId: targetNode,
          lineId: e.line,
          busTransfers: nextTransfers,
          t: candT,
          c: candC,
        });
        profiler?.push();
      }
    }
  }

  return {
    feasible: false,
    message: `No feasible route found from ${origin} to ${dest}`,
  };
}
