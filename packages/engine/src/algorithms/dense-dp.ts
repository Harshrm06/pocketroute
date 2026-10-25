/**
 * Dense cost-indexed Dynamic Programming solver (Algorithm D, Unit III reference).
 * PRD Section 8.4.
 *
 * Used for cross-validation in tests and to render the DP table for small graphs.
 */
import type { GeometryQuality } from '@pocketroute/shared';
import type { Edge, StateGraph, StateId } from '../graph/index.js';
import { decodeState, encodeState } from '../graph/index.js';
import { formatHHmm24 } from '../timing/index.js';
import { BinaryHeap } from '../structures/heap.js';
import type { Profiler } from '../profiler/index.js';
import type { DijkstraLeg, Infeasible, RouteResult } from './dijkstra.js';

interface HeapItem {
  t: number;
  sIdx: number;
  c: number;
}

/**
 * Dense cost-indexed dynamic programming solver.
 *
 * PRD §8.4:
 * dp[(v, l)][c] = minimum arrival time at state (v, l) with fare exactly c.
 * Uses a typed Float64Array of size S * (B + 1).
 *
 * @param graph The line-expanded state graph.
 * @param origin Origin node identifier.
 * @param dest Destination node identifier.
 * @param budget Maximum allowable budget in INR (integer).
 * @param profiler Optional profiler to track metrics.
 * @param t0 Departure time in minutes since midnight IST (default 0).
 * @returns RouteResult if feasible, otherwise Infeasible.
 */
export function denseDP(
  graph: StateGraph,
  origin: string,
  dest: string,
  budget: number,
  profiler?: Profiler,
  t0 = 0,
): RouteResult | Infeasible {
  const B = Math.floor(budget);
  if (B < 0) {
    return {
      feasible: false,
      message: `Invalid budget: ${budget}`,
    };
  }

  // 1. Assign each unique state an integer index 0 <= sIdx < S
  const stateToIndex = new Map<StateId, number>();
  const indexToState: StateId[] = [];

  const getOrAddState = (state: StateId): number => {
    let idx = stateToIndex.get(state);
    if (idx === undefined) {
      idx = indexToState.length;
      stateToIndex.set(state, idx);
      indexToState.push(state);
    }
    return idx;
  };

  const startState = encodeState(origin, 'NONE');
  const startStateIdx = getOrAddState(startState);

  // Register all existing states from graph nodes and edges
  for (const [nodeId, node] of graph.nodes) {
    for (const l of node.lines) {
      getOrAddState(encodeState(nodeId, l));
    }
  }

  for (const [state, edges] of graph.adj) {
    getOrAddState(state);
    for (const e of edges) {
      getOrAddState(e.from);
      getOrAddState(e.to);
    }
  }

  const S = indexToState.length;
  const stride = B + 1;
  const tableSize = S * stride;

  // 2. Allocate 1D typed arrays for dp table and parent pointers
  // dp[sIdx * stride + c] = arrival time
  const dp = new Float64Array(tableSize);
  dp.fill(Infinity);

  const parentEdge = new Array<Edge | undefined>(tableSize);
  const parentStateIdx = new Int32Array(tableSize);
  parentStateIdx.fill(-1);
  const parentCost = new Int16Array(tableSize);
  parentCost.fill(-1);

  profiler?.setStatesTotal(tableSize);

  // 3. Priority queue ordered by time t, tie-breaker cost c
  const heap = new BinaryHeap<HeapItem>((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    return a.c - b.c;
  });

  dp[startStateIdx * stride + 0] = t0;
  heap.push({ t: t0, sIdx: startStateIdx, c: 0 });
  profiler?.push();

  while (!heap.isEmpty()) {
    const item = heap.pop()!;
    profiler?.pop();

    const { t, sIdx, c } = item;
    const flatIdx = sIdx * stride + c;

    // Stale check
    if (t > dp[flatIdx]!) continue;

    profiler?.exploreState();

    const s = indexToState[sIdx]!;
    const { nodeId: v, lineId: l } = decodeState(s);

    const outgoing = graph.nodeAdj?.get(v) ?? graph.adj.get(s) ?? [];

    for (const e of outgoing) {
      // Rule C: In any path, two consecutive edges may not share the same line identifier
      if (e.line === l) continue;

      const cPrime = c + e.fareINR;
      if (cPrime > B) continue;

      profiler?.relax();

      const tPrime = e.timeAt(t);
      if (!Number.isFinite(tPrime)) continue;

      const targetStateIdx = getOrAddState(e.to);
      const targetFlatIdx = targetStateIdx * stride + cPrime;

      if (tPrime < dp[targetFlatIdx]!) {
        dp[targetFlatIdx] = tPrime;
        parentEdge[targetFlatIdx] = e;
        parentStateIdx[targetFlatIdx] = sIdx;
        parentCost[targetFlatIdx] = c;

        heap.push({ t: tPrime, sIdx: targetStateIdx, c: cPrime });
        profiler?.push();
      }
    }
  }

  // 4. Find min over c in [0, B] of dp[(D, l)][c], for all l
  let bestT = Infinity;
  let bestSIdx = -1;
  let bestCost = -1;

  for (let sIdx = 0; sIdx < S; sIdx++) {
    const s = indexToState[sIdx]!;
    const { nodeId: v } = decodeState(s);
    if (v === dest) {
      for (let c = 0; c <= B; c++) {
        const val = dp[sIdx * stride + c]!;
        if (
          val < bestT ||
          (val === bestT && (bestCost === -1 || c < bestCost))
        ) {
          bestT = val;
          bestSIdx = sIdx;
          bestCost = c;
        }
      }
    }
  }

  if (!Number.isFinite(bestT) || bestSIdx === -1) {
    return {
      feasible: false,
      message: `No feasible route found from ${origin} to ${dest} within budget ₹${B}`,
    };
  }

  // 5. Reconstruct path via parent array
  const legs: DijkstraLeg[] = [];
  let currSIdx = bestSIdx;
  let currCost = bestCost;

  while (currSIdx !== -1 && currCost !== -1) {
    const flatIdx = currSIdx * stride + currCost;
    const edge = parentEdge[flatIdx];
    const pSIdx = parentStateIdx[flatIdx]!;
    const pCost = parentCost[flatIdx]!;

    if (!edge || pSIdx === -1 || pCost === -1) break;

    const pFlatIdx = pSIdx * stride + pCost;
    const departT = dp[pFlatIdx]!;
    const arriveT = dp[flatIdx]!;

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
      geometryQuality: edge.meta.geometryQuality as GeometryQuality,
      geometryRef: edge.meta.geometryRef,
    });

    currSIdx = pSIdx;
    currCost = pCost;
  }

  legs.reverse();

  return {
    feasible: true,
    totalTimeMin: bestT - t0,
    totalFareINR: bestCost,
    arrivalTime: formatHHmm24(bestT),
    departureTime: formatHHmm24(t0),
    arrivalMinutes: bestT,
    departureMinutes: t0,
    durationMin: bestT - t0,
    legs,
  };
}
