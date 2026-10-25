/**
 * Multi-criteria Dijkstra solver for Route A (Fastest) and Route B (Cheapest).
 * PRD Section 8.2.
 */
import type { GeometryQuality, LineId, Mode } from '@pocketroute/shared';
import type { Edge, StateGraph, StateId } from '../graph/index.js';
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
  state: StateId;
  t: number;
  c: number;
}

interface DistEntry {
  t: number;
  c: number;
  parentEdge?: Edge;
  parentState?: StateId;
}

// ---------------------------------------------------------------------------
// Path reconstruction helper
// ---------------------------------------------------------------------------

function reconstructPath(
  destState: StateId,
  dist: Map<StateId, DistEntry>,
  t0: number,
): RouteResult {
  const destDist = dist.get(destState)!;
  const legs: DijkstraLeg[] = [];
  let currState: StateId | undefined = destState;

  while (currState) {
    const info = dist.get(currState);
    if (!info || !info.parentEdge || !info.parentState) break;

    const parentInfo = dist.get(info.parentState);
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
    });

    currState = info.parentState;
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

/**
 * Executes multi-criteria Dijkstra over the state graph.
 *
 * PRD §8.2:
 * - Route A (Fastest): key = "TIME", priority = arrival time t (ties broken by c).
 * - Route B (Cheapest): key = "COST", priority = (c, t) lexicographic.
 *
 * Hard constraints:
 * - Rule C: skips edges where edge.line === state.line (no consecutive rides on the same line).
 *
 * @param graph The line-expanded state graph.
 * @param origin Origin node identifier (e.g. 'O' or station id).
 * @param dest Destination node identifier (e.g. 'D' or station id).
 * @param key Optimization criterion: 'TIME' for fastest, 'COST' for cheapest.
 * @param profiler Optional profiler to track pushes, pops, relaxations.
 * @param t0 Departure time in minutes since midnight IST (default 0).
 * @returns RouteResult if a path exists, otherwise Infeasible.
 */
export function dijkstra(
  graph: StateGraph,
  origin: string,
  dest: string,
  key: 'TIME' | 'COST',
  profiler?: Profiler,
  t0 = 0,
): RouteResult | Infeasible {
  const comparator = (a: HeapEntry, b: HeapEntry): number => {
    if (key === 'TIME') {
      if (a.t !== b.t) return a.t - b.t;
      return a.c - b.c;
    } else {
      if (a.c !== b.c) return a.c - b.c;
      return a.t - b.t;
    }
  };

  const heap = new BinaryHeap<HeapEntry>(comparator);
  const dist = new Map<StateId, DistEntry>();

  const startState = encodeState(origin, 'NONE');
  dist.set(startState, { t: t0, c: 0 });
  heap.push({ state: startState, t: t0, c: 0 });
  profiler?.push();

  while (!heap.isEmpty()) {
    const item = heap.pop()!;
    profiler?.pop();

    const currDist = dist.get(item.state);
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

    const { nodeId: currNode, lineId: currLine } = decodeState(item.state);

    // Goal check
    if (currNode === dest) {
      return reconstructPath(item.state, dist, t0);
    }

    // Outgoing edges from currNode
    const outgoing =
      graph.nodeAdj?.get(currNode) ?? graph.adj.get(item.state) ?? [];

    for (const e of outgoing) {
      // Rule C: In any path, two consecutive edges may not share the same line identifier
      if (e.line === currLine) continue;

      profiler?.relax();

      const arrTime = e.timeAt(currDist.t);
      if (!Number.isFinite(arrTime)) continue;

      const candT = arrTime;
      const candC = currDist.c + e.fareINR;
      const targetState = e.to;

      const targetDist = dist.get(targetState);
      let isBetter = false;

      if (!targetDist) {
        isBetter = true;
      } else if (key === 'TIME') {
        isBetter =
          candT < targetDist.t ||
          (candT === targetDist.t && candC < targetDist.c);
      } else {
        isBetter =
          candC < targetDist.c ||
          (candC === targetDist.c && candT < targetDist.t);
      }

      if (isBetter) {
        dist.set(targetState, {
          t: candT,
          c: candC,
          parentEdge: e,
          parentState: item.state,
        });
        heap.push({ state: targetState, t: candT, c: candC });
        profiler?.push();
      }
    }
  }

  return {
    feasible: false,
    message: `No feasible route found from ${origin} to ${dest}`,
  };
}
