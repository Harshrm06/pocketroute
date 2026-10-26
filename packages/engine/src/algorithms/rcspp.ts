/**
 * Budget-constrained Resource-Constrained Shortest Path Problem (RCSPP) solver.
 * PRD Section 8.3 & Section 8.5 (Lemmas 4, 5 and Theorem 1, 2).
 */
import type { GeometryQuality } from '@pocketroute/shared';
import type { StateGraph, StateId } from '../graph/index.js';
import { decodeState, encodeState, reverseGraph } from '../graph/index.js';
import { formatHHmm24 } from '../timing/index.js';
import { BinaryHeap } from '../structures/heap.js';
import type { Profiler } from '../profiler/index.js';
import type { DijkstraLeg, Infeasible, RouteResult } from './dijkstra.js';
import { ParetoFrontier, type Label } from './frontier.js';

// ---------------------------------------------------------------------------
// Backward Dijkstra lower bounds
// ---------------------------------------------------------------------------

/**
 * Computes admissible lower bounds LB_t or LB_c from every node/state to dest.
 * PRD §8.3:
 * - LB_t(v): minimum possible remaining travel time from v to D (ignoring waits, boarding penalties, fares).
 * - LB_c(v): minimum possible remaining fare from v to D (ignoring time).
 *
 * @param graph Forward state graph.
 * @param dest Destination node identifier.
 * @param weight Optimization criterion: 'TIME' for min time, 'FARE' for min fare.
 * @returns Map of StateId and NodeId to minimum distance to dest.
 */
export function backwardDijkstra(
  graph: StateGraph,
  dest: string,
  weight: 'TIME' | 'FARE',
): Map<string, number> {
  const rev = reverseGraph(graph);
  const dist = new Map<string, number>();

  const heap = new BinaryHeap<{ state: StateId; d: number }>(
    (a, b) => a.d - b.d,
  );

  // Initialize destination with distance 0
  dist.set(dest, 0);

  const destNode = rev.nodes.get(dest);
  const destLines = destNode?.lines ?? ['NONE', 'WALK', 'AUTO', 'CAB'];

  const initialStates = new Set<string>();
  for (const l of destLines) {
    initialStates.add(encodeState(dest, l));
  }

  // Also any edge departing dest in reversed graph
  const edgesFromDest = rev.nodeAdj?.get(dest) ?? [];
  for (const e of edgesFromDest) {
    initialStates.add(e.from);
  }

  for (const s of initialStates) {
    dist.set(s, 0);
    heap.push({ state: s, d: 0 });
  }

  while (!heap.isEmpty()) {
    const { state: uState, d } = heap.pop()!;
    if (d > (dist.get(uState) ?? Infinity)) continue;

    const { nodeId: uNode, lineId: uLine } = decodeState(uState);
    const outgoing = rev.nodeAdj?.get(uNode) ?? [];

    for (const e of outgoing) {
      // Rule C relaxation check in reverse: skip if same line (does not apply at destination where search originates)
      if (uNode !== dest && uLine !== 'NONE' && e.line === uLine) continue;

      const w = weight === 'TIME' ? e.minTimeMin : e.fareINR;
      const newD = d + w;
      const targetState = e.to;

      if (newD < (dist.get(targetState) ?? Infinity)) {
        dist.set(targetState, newD);
        heap.push({ state: targetState, d: newD });

        const toNode = decodeState(targetState).nodeId;
        if (newD < (dist.get(toNode) ?? Infinity)) {
          dist.set(toNode, newD);
        }
      }
    }
  }

  return dist;
}

// ---------------------------------------------------------------------------
// Path reconstruction from Pareto label
// ---------------------------------------------------------------------------

function reconstructRcsppPath(best: Label, t0: number): RouteResult {
  const legs: DijkstraLeg[] = [];
  let curr: Label | undefined = best;

  while (curr) {
    if (!curr.parent || !curr.edge) break;

    const edge = curr.edge;
    const parent: Label = curr.parent;
    const departT = parent.t;
    const arriveT = curr.t;

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
      edge,
      meta: edge.meta,
    });

    curr = parent;
  }

  legs.reverse();

  return {
    feasible: true,
    totalTimeMin: best.t - t0,
    totalFareINR: best.c,
    arrivalTime: formatHHmm24(best.t),
    departureTime: formatHHmm24(t0),
    arrivalMinutes: best.t,
    departureMinutes: t0,
    durationMin: best.t - t0,
    legs,
  };
}

// ---------------------------------------------------------------------------
// RCSPP Solver
// ---------------------------------------------------------------------------

/**
 * Executes the budget-constrained Resource-Constrained Shortest Path Problem solver.
 *
 * PRD §8.3:
 * Minimizes arrival time at dest subject to total fare <= budget.
 *
 * Implements:
 * - Admissible lower bounds LB_t and LB_c via backward Dijkstra.
 * - P1: Budget pruning (c' + LB_c(w) > B).
 * - P2: Time bound pruning (t' + LB_t(w) >= incumbent).
 * - P3: Pareto dominance pruning per state.
 * - Rule C: Consecutive edges may not share the same line.
 *
 * @param graph Forward state graph.
 * @param origin Origin node identifier.
 * @param dest Destination node identifier.
 * @param budget Maximum allowable fare in INR.
 * @param profiler Optional profiler for counters.
 * @param t0 Departure time in minutes since midnight IST (default 0).
 * @returns RouteResult if feasible, otherwise Infeasible.
 */
export function rcspp(
  graph: StateGraph,
  origin: string,
  dest: string,
  budget: number,
  profiler?: Profiler,
  t0 = 0,
): RouteResult | Infeasible {
  const LB_t = backwardDijkstra(graph, dest, 'TIME');
  const LB_c = backwardDijkstra(graph, dest, 'FARE');

  const minOriginFare =
    LB_c.get(origin) ?? LB_c.get(encodeState(origin, 'NONE')) ?? 0;

  // Immediate feasibility check on budget lower bound
  if (minOriginFare > budget) {
    return {
      feasible: false,
      minimumRequiredFareINR: minOriginFare,
      message: `Minimum possible fare is ₹${minOriginFare}. Increase your budget to at least ₹${minOriginFare} to get a Smart route.`,
    };
  }

  let incumbent = Infinity;
  let best: Label | null = null;

  // Min-heap ordered by (time, cost)
  const heap = new BinaryHeap<Label>((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    return a.c - b.c;
  });

  const frontiers = new Map<StateId, ParetoFrontier>();

  const startState = encodeState(origin, 'NONE');
  const rootLabel: Label = {
    t: t0,
    c: 0,
    state: startState,
    removed: false,
  };

  const startFrontier = new ParetoFrontier();
  startFrontier.add(rootLabel);
  frontiers.set(startState, startFrontier);

  heap.push(rootLabel);
  profiler?.push();
  profiler?.createLabel();

  while (!heap.isEmpty()) {
    const lambda = heap.pop()!;
    profiler?.pop();

    // Stale-label detection via removed flag
    if (lambda.removed) continue;

    const { t, c, state } = lambda;
    const { nodeId: v, lineId: l } = decodeState(state);

    if (v === dest) {
      if (t < incumbent) {
        incumbent = t;
        best = lambda;
      }
      continue;
    }

    const outgoing = graph.nodeAdj?.get(v) ?? graph.adj.get(state) ?? [];

    for (const e of outgoing) {
      // Rule C: In any path, two consecutive edges may not share the same line identifier
      if (e.line === l) continue;

      profiler?.relax();

      const arrTime = e.timeAt(t);
      if (!Number.isFinite(arrTime)) continue;

      const tPrime = arrTime;
      const cPrime = c + e.fareINR;

      const targetNode = decodeState(e.to).nodeId;
      const targetState = e.to;

      // P1: Budget bound pruning
      const lbC = LB_c.get(targetNode) ?? LB_c.get(targetState) ?? 0;
      if (cPrime + lbC > budget) {
        profiler?.pruneByBudget();
        continue;
      }

      // P2: Time bound vs incumbent pruning
      const lbT = LB_t.get(targetNode) ?? LB_t.get(targetState) ?? 0;
      if (tPrime + lbT >= incumbent) {
        profiler?.pruneByTimeBound();
        continue;
      }

      // P3: Pareto dominance pruning
      let targetFrontier = frontiers.get(targetState);
      if (!targetFrontier) {
        targetFrontier = new ParetoFrontier();
        frontiers.set(targetState, targetFrontier);
      }

      if (targetFrontier.dominated(tPrime, cPrime)) {
        profiler?.pruneByDominance();
        continue;
      }

      // Remove dominated existing labels
      const removed = targetFrontier.removeDominatedBy(tPrime, cPrime);
      if (removed.length > 0) {
        profiler?.removeDominance(removed.length);
      }

      const childLabel: Label = {
        t: tPrime,
        c: cPrime,
        state: targetState,
        parent: lambda,
        edge: e,
        removed: false,
      };

      targetFrontier.add(childLabel);
      profiler?.updateFrontierSize(targetFrontier.size);

      heap.push(childLabel);
      profiler?.push();
      profiler?.createLabel();
    }
  }

  if (best === null) {
    return {
      feasible: false,
      minimumRequiredFareINR: minOriginFare,
      message: `Minimum possible fare is ₹${minOriginFare}. Increase your budget to at least ₹${minOriginFare} to get a Smart route.`,
    };
  }

  return reconstructRcsppPath(best, t0);
}
