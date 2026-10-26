/**
 * Multi-modal route planning orchestrator and profiler reporter.
 * PRD Sections 8.6, 8.7, 8.8, 9.1, and 17.2.
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  InfeasibleResult,
  LineId,
  Mode,
  PlanRequest,
  PlanRequestInput,
  ProfilerMetrics,
  Route,
  RouteComparison,
  StopPoint,
} from '@pocketroute/shared';
import { MAX_WALK_LEG_M } from '@pocketroute/shared';
import { formatHHmm24, parseHHmm, timeOfDayMinutes } from './timing/index.js';
import { bezierEstimate } from './geometry/index.js';
import { checkDailyPassTip, busFareINR } from './pricing/index.js';
import type {
  NetworkData,
  QueryGraphOptions,
  StateGraph,
} from './graph/index.js';
import {
  buildQueryGraph,
  buildStaticGraph,
  type StaticGraphResult,
} from './graph/index.js';
import { Profiler } from './profiler/index.js';
import {
  denseDP,
  dijkstra,
  type DijkstraLeg,
  type Infeasible,
  rcspp,
  type RouteResult,
} from './algorithms/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphStats {
  V: number;
  E: number;
  L: number;
  T?: number;
}

export interface TheoryBound {
  bound: string;
  ops: number;
}

export interface TheoreticalBoundsResult {
  routeA: TheoryBound;
  routeB: TheoryBound;
  rcspp: TheoryBound;
  dense: TheoryBound;
}

export interface SolverTiming {
  elapsedMs: number;
  runs: number;
  medianMs: number;
  ops: number;
}

export interface PlanResult {
  requestId: string;
  budgetINR: number;
  routes: {
    smart: Route | null;
    fastest: Route;
    cheapest: Route;
    dense?: Route | null;
  };
  comparison: RouteComparison | null;
  infeasible: InfeasibleResult | null;
  dailyPassTip?: string | null;
  attachmentRadiusExpanded?: boolean;
  metrics: ProfilerMetrics;
  solverTimings?: {
    routeA: SolverTiming;
    routeB: SolverTiming;
    rcspp: SolverTiming;
    dense?: SolverTiming;
  };
}

export interface PlanRoutesDebugOptions {
  debugDense?: boolean;
  includeMetrics?: boolean;
}

// ---------------------------------------------------------------------------
// Static graph cache
// ---------------------------------------------------------------------------

const staticGraphCache = new WeakMap<NetworkData, StaticGraphResult>();

function getOrCreateStaticGraph(network: NetworkData): StaticGraphResult {
  let staticResult = staticGraphCache.get(network);
  if (!staticResult) {
    staticResult = buildStaticGraph(network);
    staticGraphCache.set(network, staticResult);
  }
  return staticResult;
}

// ---------------------------------------------------------------------------
// Theoretical Bounds (PRD §8.6 & v1.2.0)
// ---------------------------------------------------------------------------

/**
 * Computes theoretical complexity bounds and estimated operations for each algorithm.
 * PRD §8.6 & v1.2.0 (Step 3e):
 * Bound for RCSPP is O(E*L*T*log(V*L*T*B)) with T = 3 (at most 3 buses / 2 transfers).
 *
 * @param graphStats V: node count, E: edge count, L: line identifier count, T: transfers dimension
 * @param budget B: maximum allowable fare
 */
export function theoreticalBounds(
  graphStats: GraphStats,
  budget: number,
): TheoreticalBoundsResult {
  const V = graphStats.V;
  const E = graphStats.E;
  const L = Math.max(1, graphStats.L);
  const B = Math.max(1, budget);
  const T = Math.max(1, graphStats.T ?? 3);

  const VL = Math.max(2, V * L);
  const VLTB = Math.max(2, V * L * T * B);

  const opsA = Math.round(E * L * Math.log2(VL));
  const opsB = Math.round(E * L * Math.log2(VL));
  const opsRcspp = Math.round(E * L * T * Math.log2(VLTB));
  const opsDense = Math.round(V * L * T * (B + 1));

  return {
    routeA: {
      bound: 'O(E*L*log(V*L))',
      ops: opsA,
    },
    routeB: {
      bound: 'O(E*L*log(V*L))',
      ops: opsB,
    },
    rcspp: {
      bound: 'O(E*L*T*log(V*L*T*B))',
      ops: opsRcspp,
    },
    dense: {
      bound: 'Theta(V*L*T*(B+1))',
      ops: opsDense,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves departure time in minutes from midnight IST.
 */
export function resolveDepartureMinutes(
  departureTime: string,
  now?: number | Date | string,
): number {
  if (departureTime !== 'now') {
    return parseHHmm(departureTime);
  }

  if (typeof now === 'number') {
    return timeOfDayMinutes(now);
  }

  if (typeof now === 'string') {
    return parseHHmm(now);
  }

  const d = now instanceof Date ? now : new Date();
  // IST is UTC + 5:30 (330 minutes)
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMinutes + 330) % 1440;
}

/** Formats a user-friendly line label from a LineId. */
function formatLineLabel(lineId: LineId): string {
  if (lineId === 'METRO_PURPLE') return 'Purple Line';
  if (lineId === 'METRO_AQUA') return 'Aqua Line';
  if (lineId.startsWith('BUS_')) return `Bus ${lineId.slice(4)}`;
  if (lineId === 'WALK') return 'Walk';
  if (lineId === 'AUTO') return 'Auto Rickshaw';
  if (lineId === 'CAB') return 'Cab';
  return lineId;
}

/** Formats user-facing instruction text for a leg. */
function formatInstruction(
  mode: Mode,
  lineLabel: string,
  fromName: string,
  toName: string,
): string {
  switch (mode) {
    case 'WALK':
      return `Walk to ${toName}.`;
    case 'METRO':
      return `Board ${lineLabel} at ${fromName}.`;
    case 'BUS':
      return `Board ${lineLabel} at ${fromName}.`;
    case 'AUTO':
      return `Take auto to ${toName}.`;
    case 'CAB':
      return `Take cab to ${toName}.`;
    default:
      return `Proceed to ${toName}.`;
  }
}

/**
 * Merges consecutive same-bus legs into one single BUS leg.
 * PRD §23 & Step 3b:
 * Consecutive hop on same bus corridor/route uses single macro-ride leg
 * with computeBusFare(total distance on that bus).
 */
function mergeConsecutiveSameBusLegs(
  graph: StateGraph,
  rawLegs: DijkstraLeg[],
): DijkstraLeg[] {
  if (rawLegs.length <= 1) return rawLegs;
  const merged: DijkstraLeg[] = [];

  for (let i = 0; i < rawLegs.length; i++) {
    const leg = rawLegs[i]!;
    if (merged.length === 0) {
      merged.push({ ...leg });
      continue;
    }
    const prev = merged[merged.length - 1]!;
    const isSameBus =
      prev.mode === 'BUS' &&
      leg.mode === 'BUS' &&
      (prev.line === leg.line ||
        (prev.meta?.routeNumbers &&
          leg.meta?.routeNumbers &&
          prev.meta.routeNumbers.some((r) =>
            leg.meta?.routeNumbers?.includes(r),
          )));

    if (isSameBus) {
      const totalDist = prev.distanceKm + leg.distanceKm;
      const combinedStops = (prev.stops ?? 0) + (leg.stops ?? 0);
      const intermediateStopNode = graph.nodes.get(prev.to);
      const intermediateStopName = intermediateStopNode?.name ?? prev.to;
      const prevIntermediates = prev.meta?.intermediateStops ?? [];
      const legIntermediates = leg.meta?.intermediateStops ?? [];
      const combinedIntermediates = [
        ...prevIntermediates,
        intermediateStopName,
        ...legIntermediates,
      ];

      prev.to = leg.to;
      prev.arriveAt = leg.arriveAt;
      prev.arriveMinutes = leg.arriveMinutes;
      prev.durationMin = leg.arriveMinutes - prev.departMinutes;
      prev.distanceKm = totalDist;
      prev.stops = combinedStops;
      prev.fareINR = busFareINR(totalDist);
      prev.fare = prev.fareINR;
      if (prev.meta) {
        prev.meta = {
          ...prev.meta,
          distanceKm: totalDist,
          stops: combinedStops,
          intermediateStops: combinedIntermediates,
        };
      }
    } else {
      merged.push({ ...leg });
    }
  }

  return merged;
}

/**
 * Transforms an internal algorithm RouteResult into the public Route schema.
 */
function formatRoute(
  graph: StateGraph,
  result: RouteResult | Infeasible,
  queryDepMinutes: number,
): Route {
  if (!result.feasible) {
    return {
      feasible: false,
      totalFareINR: 0,
      arrivalTime: '',
      durationMin: 0,
      legs: [],
    };
  }

  const rawLegs = mergeConsecutiveSameBusLegs(graph, result.legs);

  let prevArriveMinutes = queryDepMinutes;
  const legs = rawLegs.map((leg, idx) => {
    const fromNode = graph.nodes.get(leg.from);
    const toNode = graph.nodes.get(leg.to);

    const fromPoint: StopPoint = {
      name: fromNode?.name ?? leg.from,
      lat: fromNode?.lat ?? 0,
      lng: fromNode?.lng ?? 0,
    };
    const toPoint: StopPoint = {
      name: toNode?.name ?? leg.to,
      lat: toNode?.lat ?? 0,
      lng: toNode?.lng ?? 0,
    };

    const waitMin = Math.max(0, leg.departMinutes - prevArriveMinutes);
    prevArriveMinutes = leg.arriveMinutes;

    const lineLabel = formatLineLabel(leg.line);
    const isBus = leg.mode === 'BUS';
    const isMetro = leg.mode === 'METRO';
    const isPrevBus = idx > 0 && rawLegs[idx - 1]!.mode === 'BUS';

    let instruction = formatInstruction(
      leg.mode,
      lineLabel,
      fromPoint.name,
      toPoint.name,
    );
    if (isBus && isPrevBus) {
      instruction = `Change Bus at ${fromPoint.name} to ${lineLabel} (Wait ${waitMin} mins).`;
    }

    // Compute geometry (use Bézier estimate if not explicit)
    const geometry = bezierEstimate(
      { lat: fromPoint.lat, lng: fromPoint.lng },
      { lat: toPoint.lat, lng: toPoint.lng },
    );

    const legMeta = leg.meta;

    const routeNumbers = isBus
      ? (legMeta?.routeNumbers ?? [leg.line.replace(/^BUS_/, '')])
      : undefined;

    const routeName = isBus ? legMeta?.routeName : undefined;
    const headsign = isBus ? (legMeta?.headsign ?? toPoint.name) : undefined;
    const boardingStop = isBus ? fromPoint.name : undefined;
    const alightingStop = isBus ? toPoint.name : undefined;
    const intermediateStopsCount = isBus
      ? (legMeta?.stops ?? leg.stops ?? 0)
      : undefined;
    const intermediateStops = isBus
      ? (legMeta?.intermediateStops ?? [])
      : undefined;

    const scheduledDeparture =
      isBus || isMetro ? formatHHmm24(leg.departMinutes) : undefined;
    const scheduledArrival =
      isBus || isMetro ? formatHHmm24(leg.arriveMinutes) : undefined;
    const waitMinutes = isBus || isMetro ? waitMin : undefined;
    const frequencyMinutes = isBus
      ? (legMeta?.peakHeadwayMin ?? 10)
      : isMetro
        ? 5
        : undefined;

    const nextDepartures =
      (isBus || isMetro) && frequencyMinutes
        ? [
            formatHHmm24(leg.departMinutes),
            formatHHmm24(leg.departMinutes + frequencyMinutes),
            formatHHmm24(leg.departMinutes + 2 * frequencyMinutes),
          ]
        : undefined;

    const scheduleBasis = isBus ? ('estimate' as const) : undefined;
    const transferAt = isBus && isPrevBus ? fromPoint.name : undefined;
    const transferWaitMinutes = isBus && isPrevBus ? waitMin : undefined;

    return {
      mode: leg.mode,
      lineId: leg.line,
      lineLabel,
      from: fromPoint,
      to: toPoint,
      departAt: leg.departAt,
      arriveAt: leg.arriveAt,
      durationMin: leg.durationMin,
      distanceKm: leg.distanceKm,
      stopCount: leg.stops,
      waitMin,
      fareINR: leg.fareINR,
      geometry,
      geometryQuality: leg.geometryQuality ?? 'estimated',
      instruction,
      routeNumbers,
      routeName,
      headsign,
      boardingStop,
      alightingStop,
      intermediateStopsCount,
      intermediateStops,
      scheduledDeparture,
      scheduledArrival,
      waitMinutes,
      frequencyMinutes,
      nextDepartures,
      scheduleBasis,
      transferAt,
      transferWaitMinutes,
    };
  });

  const totalDistanceKm = legs.reduce((acc, l) => acc + l.distanceKm, 0);
  const totalFareINR = legs.reduce((acc, l) => acc + l.fareINR, 0);
  const cumulativeBusFare = legs
    .filter((l) => l.mode === 'BUS')
    .reduce((sum, l) => sum + l.fareINR, 0);
  const dailyPassTip = checkDailyPassTip(cumulativeBusFare);

  return {
    feasible: true,
    totalFareINR,
    arrivalTime: result.arrivalTime,
    durationMin: result.durationMin,
    departureTime: result.departureTime,
    totalDistanceKm,
    legs,
    dailyPassTip,
    attachmentRadiusExpanded: graph.attachmentRadiusExpanded,
  };
}

/**
 * Measures solver runtime: single run if >= 50ms, median of 5 runs otherwise.
 * PRD §8.7.
 */
function measureSolver<T>(
  fn: (p?: Profiler) => T,
  primaryProfiler: Profiler,
): { result: T; elapsedMs: number; runs: number; medianMs: number } {
  const t0 = performance.now();
  const firstResult = fn(primaryProfiler);
  const t1 = performance.now();
  const firstElapsed = t1 - t0;

  if (firstElapsed >= 50) {
    return {
      result: firstResult,
      elapsedMs: firstElapsed,
      runs: 1,
      medianMs: firstElapsed,
    };
  }

  const times: number[] = [firstElapsed];
  const scratchProfiler = new Profiler();
  for (let i = 0; i < 4; i++) {
    scratchProfiler.reset();
    const start = performance.now();
    fn(scratchProfiler);
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);
  const medianMs = times[2]!;

  return {
    result: firstResult,
    elapsedMs: firstElapsed,
    runs: 5,
    medianMs,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator: planRoutes
// ---------------------------------------------------------------------------

/**
 * Plans routes across multi-modal transit networks following PRD Section 8 and 9.1.
 *
 * 1. Builds query graph with access edges and candidate pruning.
 * 2. Runs Route A (Dijkstra TIME), Route B (Dijkstra COST), and Smart (RCSPP).
 * 3. Optionally runs Algorithm D (Dense DP) if debug flag is enabled.
 * 4. Benchmarks each solver with performance.now() (median of 5 if < 50ms).
 * 5. Serializes metrics and complexity bounds.
 *
 * @param network NetworkData or precomputed StaticGraphResult.
 * @param request Routing request matching PlanRequest.
 * @param now Optional current time reference for "now" queries.
 * @param debugOptions Optional debug flag or options.
 * @returns Complete PlanResult containing routes, comparison, infeasible details, and profiler metrics.
 */
export function planRoutes(
  network: NetworkData | StaticGraphResult,
  request: PlanRequestInput | PlanRequest,
  now?: number | Date | string,
  debugOptions?: boolean | PlanRoutesDebugOptions,
): PlanResult {
  const requestId = randomUUID();

  // 1. Resolve debug flag
  const isDebug =
    typeof debugOptions === 'boolean'
      ? debugOptions
      : (debugOptions?.debugDense ??
        (request as unknown as { debug?: boolean })?.debug ??
        (request.options as unknown as { debugDense?: boolean })?.debugDense ??
        false);

  // 2. Resolve departure time
  const depMinutes = resolveDepartureMinutes(request.departureTime, now);

  // 3. Build query graph
  const staticResult: StaticGraphResult =
    'metro' in network && 'bus' in network
      ? getOrCreateStaticGraph(network)
      : (network as StaticGraphResult);

  const queryOptions: QueryGraphOptions = {
    maxWalkM: request.options?.maxWalkM ?? MAX_WALK_LEG_M,
    includeAuto: request.options?.includeAuto ?? true,
    includeCab: request.options?.includeCab ?? true,
    depMinutes,
    localHourIST: Math.floor((((depMinutes % 1440) + 1440) % 1440) / 60),
  };

  const queryGraph = buildQueryGraph(
    staticResult,
    request.origin,
    request.destination,
    queryOptions,
  );

  const V = queryGraph.nodes.size;
  const E = queryGraph.edgeCount;
  const L = queryGraph.lineCount;
  const B = request.budgetINR;

  // 4. Run Route A: Dijkstra (TIME) - Fastest overall
  const profilerA = new Profiler();
  const timedA = measureSolver(
    (p) => dijkstra(queryGraph, 'O', 'D', 'TIME', p, depMinutes),
    profilerA,
  );
  const fastest = formatRoute(queryGraph, timedA.result, depMinutes);

  // 5. Run Route B: Dijkstra (COST) - Cheapest overall
  const profilerB = new Profiler();
  const timedB = measureSolver(
    (p) => dijkstra(queryGraph, 'O', 'D', 'COST', p, depMinutes),
    profilerB,
  );
  const cheapest = formatRoute(queryGraph, timedB.result, depMinutes);

  // 6. Run Smart: RCSPP (Budget constrained)
  const profilerC = new Profiler();
  profilerC.setGraph(V, E, L, B);
  const timedC = measureSolver(
    (p) => rcspp(queryGraph, 'O', 'D', B, p, depMinutes),
    profilerC,
  );
  profilerC.setTiming(timedC.elapsedMs, timedC.runs, timedC.medianMs);

  // 7. Optionally run Algorithm D: Dense DP (Debug)
  let timedD:
    | {
        result: RouteResult | Infeasible;
        elapsedMs: number;
        runs: number;
        medianMs: number;
      }
    | undefined;
  let profilerD: Profiler | undefined;
  let denseRoute: Route | null | undefined;

  if (isDebug) {
    profilerD = new Profiler();
    timedD = measureSolver(
      (p) => denseDP(queryGraph, 'O', 'D', B, p, depMinutes),
      profilerD,
    );
    profilerC.statesExplored = profilerD.statesExplored;
    if (profilerD.statesTotal > 0) {
      profilerC.statesTotal = profilerD.statesTotal;
    }
    denseRoute = timedD.result.feasible
      ? formatRoute(queryGraph, timedD.result, depMinutes)
      : null;
  }

  // 8. Compute Smart route & comparison / infeasibility (PRD §8.8)
  let smart: Route | null = null;
  let comparison: RouteComparison | null = null;
  let infeasible: InfeasibleResult | null = null;

  if (timedC.result.feasible) {
    smart = formatRoute(queryGraph, timedC.result, depMinutes);

    // Compute comparison vs fastest
    const fareSavedVsFastestINR = Math.max(
      0,
      fastest.totalFareINR - smart.totalFareINR,
    );
    const extraMinVsFastest = Math.max(
      0,
      smart.durationMin - fastest.durationMin,
    );

    comparison = {
      fareSavedVsFastestINR,
      extraMinVsFastest,
    };
  } else {
    // Infeasible: PRD §8.8
    const minFare =
      (timedC.result as Infeasible).minimumRequiredFareINR ??
      (cheapest.feasible ? cheapest.totalFareINR : B);

    infeasible = {
      minimumRequiredFareINR: minFare,
      message: `Minimum possible fare is ₹${minFare}. Increase your budget to at least ₹${minFare} to get a Smart route.`,
    };
  }

  // 9. Serialize Profiler Metrics (PRD §8.7)
  const metrics = profilerC.snapshot();

  const planResult: PlanResult = {
    requestId,
    budgetINR: B,
    routes: {
      smart,
      fastest,
      cheapest,
      ...(isDebug ? { dense: denseRoute } : {}),
    },
    comparison,
    infeasible,
    dailyPassTip:
      smart?.dailyPassTip ??
      fastest.dailyPassTip ??
      cheapest.dailyPassTip ??
      null,
    attachmentRadiusExpanded: queryGraph.attachmentRadiusExpanded ?? false,
    metrics,
    solverTimings: {
      routeA: {
        elapsedMs: timedA.elapsedMs,
        runs: timedA.runs,
        medianMs: timedA.medianMs,
        ops: profilerA.pushes + profilerA.pops + profilerA.relaxations,
      },
      routeB: {
        elapsedMs: timedB.elapsedMs,
        runs: timedB.runs,
        medianMs: timedB.medianMs,
        ops: profilerB.pushes + profilerB.pops + profilerB.relaxations,
      },
      rcspp: {
        elapsedMs: timedC.elapsedMs,
        runs: timedC.runs,
        medianMs: timedC.medianMs,
        ops: profilerC.pushes + profilerC.pops + profilerC.relaxations,
      },
      ...(isDebug && timedD && profilerD
        ? {
            dense: {
              elapsedMs: timedD.elapsedMs,
              runs: timedD.runs,
              medianMs: timedD.medianMs,
              ops: profilerD.pushes + profilerD.pops + profilerD.relaxations,
            },
          }
        : {}),
    },
  };

  return planResult;
}
