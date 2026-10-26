import { describe, expect, it } from 'vitest';
import type { LineId, Mode } from '@pocketroute/shared';
import type { Edge, GraphNode, StateGraph } from '../graph/index.js';
import { decodeState, encodeState } from '../graph/index.js';
import { Profiler } from '../profiler/index.js';
import { dijkstra, type RouteResult } from './dijkstra.js';
import { backwardDijkstra, rcspp } from './rcspp.js';

/** Helper to construct a simple test graph */
function createTestGraph(
  nodeIds: string[],
  edges: {
    from: string;
    to: string;
    line: LineId;
    mode: Mode;
    fare: number;
    timeMin: number;
  }[],
): StateGraph {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, Edge[]>();
  const nodeAdj = new Map<string, Edge[]>();

  for (const id of nodeIds) {
    nodes.set(id, {
      id,
      name: id,
      lat: 18.5,
      lng: 73.8,
      type: id === 'O' ? 'origin' : id === 'D' ? 'destination' : 'bus_stop',
      lines: ['NONE'],
    });
  }

  let edgeCount = 0;
  const lineSet = new Set<string>(['NONE']);

  for (const e of edges) {
    lineSet.add(e.line);
    const fromState = encodeState(e.from, e.line);
    const toState = encodeState(e.to, e.line);

    const edge: Edge = {
      from: fromState,
      to: toState,
      line: e.line,
      mode: e.mode,
      fareINR: e.fare,
      minTimeMin: e.timeMin,
      timeAt: (t: number) => t + e.timeMin,
      meta: {
        distanceKm: e.timeMin * 0.5,
        stops: 1,
        geometryQuality: 'schematic',
      },
    };

    const stateList = adj.get(fromState) ?? [];
    stateList.push(edge);
    adj.set(fromState, stateList);

    const nodeList = nodeAdj.get(e.from) ?? [];
    nodeList.push(edge);
    nodeAdj.set(e.from, nodeList);

    edgeCount++;
  }

  return {
    nodes,
    adj,
    nodeAdj,
    edgeCount,
    lineCount: lineSet.size,
  };
}

describe('packages/engine/src/algorithms/rcspp', () => {
  // Test fixture graph:
  // Option 1 (Fast, Expensive): CAB direct O -> D: fare = 100, time = 10 min
  // Option 2 (Mid-speed, Mid-cost): METRO via M: O -> M (fare 15, 10 min), M -> D (fare 15, 10 min): total fare = 30, time = 20 min
  // Option 3 (Slow, Cheap): BUS via B: O -> B (fare 5, 25 min), B -> D (fare 5, 25 min): total fare = 10, time = 50 min
  const multiRouteGraph = createTestGraph(
    ['O', 'M', 'B', 'D'],
    [
      {
        from: 'O',
        to: 'D',
        line: 'CAB',
        mode: 'CAB',
        fare: 100,
        timeMin: 10,
      },
      {
        from: 'O',
        to: 'M',
        line: 'METRO_PURPLE',
        mode: 'METRO',
        fare: 15,
        timeMin: 10,
      },
      {
        from: 'M',
        to: 'D',
        line: 'METRO_AQUA',
        mode: 'METRO',
        fare: 15,
        timeMin: 10,
      },
      {
        from: 'O',
        to: 'B',
        line: 'BUS_2',
        mode: 'BUS',
        fare: 5,
        timeMin: 25,
      },
      {
        from: 'B',
        to: 'D',
        line: 'BUS_24',
        mode: 'BUS',
        fare: 5,
        timeMin: 25,
      },
    ],
  );

  describe('backwardDijkstra', () => {
    it('computes correct lower bounds LB_t and LB_c', () => {
      const LB_t = backwardDijkstra(multiRouteGraph, 'D', 'TIME');
      const LB_c = backwardDijkstra(multiRouteGraph, 'D', 'FARE');

      // Fastest time from O to D is 10 min (CAB)
      expect(LB_t.get('O')).toBe(10);
      expect(LB_t.get('M')).toBe(10);
      expect(LB_t.get('B')).toBe(25);
      expect(LB_t.get('D')).toBe(0);

      // Cheapest fare from O to D is 10 INR (BUS)
      expect(LB_c.get('O')).toBe(10);
      expect(LB_c.get('M')).toBe(15);
      expect(LB_c.get('B')).toBe(5);
      expect(LB_c.get('D')).toBe(0);
    });
  });

  describe('Hand-built graph budget selection', () => {
    it('budget 0 is infeasible, budget 10 selects the cheap slow route, budget 100 selects the fast expensive route', () => {
      // 1. Budget 0: Infeasible (min required is ₹10)
      const res0 = rcspp(multiRouteGraph, 'O', 'D', 0);
      expect(res0.feasible).toBe(false);
      if (!res0.feasible) {
        expect(res0.minimumRequiredFareINR).toBe(10);
        expect(res0.message).toContain('₹10');
      }

      // 2. Budget 5: Infeasible (min required is ₹10)
      const res5 = rcspp(multiRouteGraph, 'O', 'D', 5);
      expect(res5.feasible).toBe(false);

      // 3. Budget 10: Selects the cheap slow route (BUS, 52 min including 2 min transfer friction, ₹10)
      const res10 = rcspp(multiRouteGraph, 'O', 'D', 10);
      expect(res10.feasible).toBe(true);
      if (res10.feasible) {
        expect(res10.totalFareINR).toBe(10);
        expect(res10.totalTimeMin).toBe(52);
        expect(res10.legs.length).toBe(2);
        expect(res10.legs[0]!.line).toBe('BUS_2');
        expect(res10.legs[1]!.line).toBe('BUS_24');
      }

      // 4. Budget 30: Selects the mid-speed route (METRO, 20 min, ₹30)
      const res30 = rcspp(multiRouteGraph, 'O', 'D', 30);
      expect(res30.feasible).toBe(true);
      if (res30.feasible) {
        expect(res30.totalFareINR).toBe(30);
        expect(res30.totalTimeMin).toBe(20);
        expect(res30.legs[0]!.mode).toBe('METRO');
        expect(res30.legs[1]!.mode).toBe('METRO');
      }

      // 5. Budget 100: Selects the fast expensive route (CAB, 10 min, ₹100)
      const res100 = rcspp(multiRouteGraph, 'O', 'D', 100);
      expect(res100.feasible).toBe(true);
      if (res100.feasible) {
        expect(res100.totalFareINR).toBe(100);
        expect(res100.totalTimeMin).toBe(10);
        expect(res100.legs.length).toBe(1);
        expect(res100.legs[0]!.mode).toBe('CAB');
      }
    });
  });

  describe('Theorem verification', () => {
    // Reference Dijkstra solutions
    const routeA = dijkstra(multiRouteGraph, 'O', 'D', 'TIME') as RouteResult;
    const routeB = dijkstra(multiRouteGraph, 'O', 'D', 'COST') as RouteResult;

    it('Theorem 1: returns feasible path of minimum arrival time subject to fare <= B, or reports minimum achievable fare', () => {
      // Infeasible check reports minimum required fare
      const inf = rcspp(multiRouteGraph, 'O', 'D', 9);
      expect(inf.feasible).toBe(false);
      if (!inf.feasible) {
        expect(inf.minimumRequiredFareINR).toBe(10);
      }

      // Feasible check returns optimal time for budget 25 (only bus feasible, 52 min with 2 min transfer friction)
      const opt25 = rcspp(multiRouteGraph, 'O', 'D', 25) as RouteResult;
      expect(opt25.feasible).toBe(true);
      expect(opt25.totalFareINR).toBeLessThanOrEqual(25);
      expect(opt25.totalTimeMin).toBe(52);

      // Budget 30 opens metro (20 min)
      const opt30 = rcspp(multiRouteGraph, 'O', 'D', 30) as RouteResult;
      expect(opt30.feasible).toBe(true);
      expect(opt30.totalFareINR).toBeLessThanOrEqual(30);
      expect(opt30.totalTimeMin).toBe(20);
    });

    it('Theorem 2.1: if Route A cost <= B then Smart time equals Route A time', () => {
      // Route A cost is 100. When B >= 100, Smart time must equal Route A time.
      const smart100 = rcspp(multiRouteGraph, 'O', 'D', 100) as RouteResult;
      expect(smart100.feasible).toBe(true);
      expect(smart100.totalTimeMin).toBe(routeA.totalTimeMin);

      const smart150 = rcspp(multiRouteGraph, 'O', 'D', 150) as RouteResult;
      expect(smart150.feasible).toBe(true);
      expect(smart150.totalTimeMin).toBe(routeA.totalTimeMin);
    });

    it('Theorem 2.2: Smart time >= Route A time', () => {
      const budgets = [10, 15, 20, 30, 50, 75, 100, 200];
      for (const b of budgets) {
        const smart = rcspp(multiRouteGraph, 'O', 'D', b);
        if (smart.feasible) {
          expect(smart.totalTimeMin).toBeGreaterThanOrEqual(
            routeA.totalTimeMin,
          );
        }
      }
    });

    it('Theorem 2.3: Smart cost >= Route B cost', () => {
      const budgets = [10, 15, 20, 30, 50, 75, 100, 200];
      for (const b of budgets) {
        const smart = rcspp(multiRouteGraph, 'O', 'D', b);
        if (smart.feasible) {
          expect(smart.totalFareINR).toBeGreaterThanOrEqual(
            routeB.totalFareINR,
          );
        }
      }
    });

    it('Theorem 2.4: Smart cost <= B when feasible', () => {
      const budgets = [10, 15, 20, 30, 45, 60, 75, 100, 250];
      for (const b of budgets) {
        const smart = rcspp(multiRouteGraph, 'O', 'D', b);
        if (smart.feasible) {
          expect(smart.totalFareINR).toBeLessThanOrEqual(b);
        }
      }
    });

    it('Theorem 2.5: Monotonicity - increasing B never increases Smart time (sweep B from 10 to 300 on fixed fixtures)', () => {
      let prevTime = Infinity;

      for (let b = 10; b <= 300; b += 5) {
        const smart = rcspp(multiRouteGraph, 'O', 'D', b);
        if (smart.feasible) {
          expect(smart.totalTimeMin).toBeLessThanOrEqual(prevTime);
          prevTime = smart.totalTimeMin;
        }
      }
    });
  });

  describe('Profiler counters and pruning rules', () => {
    it('records pruning counters P1 (budget), P2 (timeBound), P3 (dominance), and maxFrontierSize', () => {
      const profiler = new Profiler();
      profiler.setGraph(4, 5, 4, 30);

      const res = rcspp(multiRouteGraph, 'O', 'D', 30, profiler);
      expect(res.feasible).toBe(true);

      // Pushes and pops occurred
      expect(profiler.pushes).toBeGreaterThan(0);
      expect(profiler.pops).toBeGreaterThan(0);
      expect(profiler.labelsCreated).toBeGreaterThan(0);

      // At least one pruning rule fired (e.g. CAB with fare 100 > budget 30 is pruned by P1)
      expect(profiler.prunedBudget).toBeGreaterThan(0);

      // Max frontier size per state was tracked
      expect(profiler.maxFrontierSize).toBeGreaterThan(0);
    });
  });

  describe('v1.2.0 Bus Transfers and Timetable Wait (PRD §23, Step 3g)', () => {
    it('a direct single-bus route beats a 2-bus transfer route with similar duration (fixture where the transfer route is 2 minutes faster in ride time but has a 6-minute wait)', () => {
      // S -> D: direct single-bus (ride time 20 min, wait 0 min -> total 20 min, 0 transfers)
      // S -> H -> D: 2-bus transfer
      //   S -> H on BUS_A: ride time 9 min (departs at t=0, arrives t=9)
      //   H -> D on BUS_B: ride time 9 min (total ride time 18 min, 2 min faster!)
      //   At H, passenger is ready at t = 9 + 2 (transfer friction) = 11.
      //   BUS_B timetable grid has departures at t=15 (wait = 6 min from arrival at 9).
      //   Arrival at D is 15 + 9 = 24 min.
      // Direct single-bus (20 min) beats 2-bus transfer (24 min).

      const nodes = new Map<string, GraphNode>();
      for (const id of ['S', 'H', 'D']) {
        nodes.set(id, {
          id,
          name: id,
          lat: 18.5,
          lng: 73.8,
          type: 'bus_stop',
          lines: ['NONE'],
        });
      }
      const adj = new Map<string, Edge[]>();
      const nodeAdj = new Map<string, Edge[]>();

      const addTestEdge = (e: Edge) => {
        const sl = adj.get(e.from) ?? [];
        sl.push(e);
        adj.set(e.from, sl);

        const fromNode = decodeState(e.from).nodeId;
        const nl = nodeAdj.get(fromNode) ?? [];
        nl.push(e);
        nodeAdj.set(fromNode, nl);
      };

      // Direct bus: S -> D
      addTestEdge({
        from: encodeState('S', 'BUS_DIRECT'),
        to: encodeState('D', 'BUS_DIRECT'),
        line: 'BUS_DIRECT',
        mode: 'BUS',
        fareINR: 20,
        minTimeMin: 20,
        timeAt: (t) => t + 20,
        meta: { distanceKm: 8, stops: 4, geometryQuality: 'estimated' },
      });

      // Transfer bus 1: S -> H
      addTestEdge({
        from: encodeState('S', 'BUS_A'),
        to: encodeState('H', 'BUS_A'),
        line: 'BUS_A',
        mode: 'BUS',
        fareINR: 15,
        minTimeMin: 9,
        timeAt: (t) => t + 9,
        meta: { distanceKm: 4, stops: 2, geometryQuality: 'estimated' },
      });

      // Transfer bus 2: H -> D with timetable departure at multiples of 15 min
      addTestEdge({
        from: encodeState('H', 'BUS_B'),
        to: encodeState('D', 'BUS_B'),
        line: 'BUS_B',
        mode: 'BUS',
        fareINR: 15,
        minTimeMin: 9,
        timeAt: (t) => {
          const dep = Math.ceil(t / 15) * 15;
          return dep + 9;
        },
        meta: { distanceKm: 4, stops: 2, geometryQuality: 'estimated' },
      });

      const fixtureGraph: StateGraph = {
        nodes,
        adj,
        nodeAdj,
        edgeCount: 3,
        lineCount: 3,
      };

      const res = rcspp(
        fixtureGraph,
        'S',
        'D',
        50,
        undefined,
        0,
      ) as RouteResult;
      expect(res.feasible).toBe(true);
      expect(res.totalTimeMin).toBe(20);
      expect(res.legs.length).toBe(1);
      expect(res.legs[0]!.line).toBe('BUS_DIRECT');
    });

    it('two-bus transfer charges two bus tickets', () => {
      // S -> H (BUS_A, fare 15) -> D (BUS_B, fare 20)
      // Total fare should be 35 (two tickets)
      const nodes = new Map<string, GraphNode>();
      for (const id of ['S', 'H', 'D']) {
        nodes.set(id, {
          id,
          name: id,
          lat: 18.5,
          lng: 73.8,
          type: 'bus_stop',
          lines: ['NONE'],
        });
      }
      const adj = new Map<string, Edge[]>();
      const nodeAdj = new Map<string, Edge[]>();

      const addTestEdge = (e: Edge) => {
        const sl = adj.get(e.from) ?? [];
        sl.push(e);
        adj.set(e.from, sl);
        const fromNode = decodeState(e.from).nodeId;
        const nl = nodeAdj.get(fromNode) ?? [];
        nl.push(e);
        nodeAdj.set(fromNode, nl);
      };

      addTestEdge({
        from: encodeState('S', 'BUS_A'),
        to: encodeState('H', 'BUS_A'),
        line: 'BUS_A',
        mode: 'BUS',
        fareINR: 15,
        minTimeMin: 10,
        timeAt: (t) => t + 10,
        meta: { distanceKm: 5, stops: 2, geometryQuality: 'estimated' },
      });

      addTestEdge({
        from: encodeState('H', 'BUS_B'),
        to: encodeState('D', 'BUS_B'),
        line: 'BUS_B',
        mode: 'BUS',
        fareINR: 20,
        minTimeMin: 10,
        timeAt: (t) => t + 10,
        meta: { distanceKm: 8, stops: 3, geometryQuality: 'estimated' },
      });

      const fixtureGraph: StateGraph = {
        nodes,
        adj,
        nodeAdj,
        edgeCount: 2,
        lineCount: 2,
      };

      const res = rcspp(
        fixtureGraph,
        'S',
        'D',
        50,
        undefined,
        0,
      ) as RouteResult;
      expect(res.feasible).toBe(true);
      expect(res.totalFareINR).toBe(35); // 15 + 20 = 2 bus tickets
      expect(res.legs.length).toBe(2);
      expect(res.legs[0]!.fareINR).toBe(15);
      expect(res.legs[1]!.fareINR).toBe(20);
    });

    it('three-bus route is rejected when the cap is 2 transfers (and 4-bus route rejected with cap 2)', () => {
      // Chain of 4 buses: N0 -> N1 (BUS_1) -> N2 (BUS_2) -> N3 (BUS_3) -> N4 (BUS_4)
      const nodes = new Map<string, GraphNode>();
      for (const id of ['N0', 'N1', 'N2', 'N3', 'N4']) {
        nodes.set(id, {
          id,
          name: id,
          lat: 18.5,
          lng: 73.8,
          type: 'bus_stop',
          lines: ['NONE'],
        });
      }
      const adj = new Map<string, Edge[]>();
      const nodeAdj = new Map<string, Edge[]>();

      const addTestEdge = (e: Edge) => {
        const sl = adj.get(e.from) ?? [];
        sl.push(e);
        adj.set(e.from, sl);
        const fromNode = decodeState(e.from).nodeId;
        const nl = nodeAdj.get(fromNode) ?? [];
        nl.push(e);
        nodeAdj.set(fromNode, nl);
      };

      for (let i = 0; i < 4; i++) {
        const from = `N${i}`;
        const to = `N${i + 1}`;
        const line = `BUS_${i + 1}` as LineId;
        addTestEdge({
          from: encodeState(from, line),
          to: encodeState(to, line),
          line,
          mode: 'BUS',
          fareINR: 10,
          minTimeMin: 10,
          timeAt: (t) => t + 10,
          meta: { distanceKm: 2, stops: 1, geometryQuality: 'estimated' },
        });
      }

      const chainGraph: StateGraph = {
        nodes,
        adj,
        nodeAdj,
        edgeCount: 4,
        lineCount: 4,
      };

      // 4-bus route (3 bus transfers) is rejected under default cap = 2
      const res4 = rcspp(chainGraph, 'N0', 'N4', 100);
      expect(res4.feasible).toBe(false);

      // 3-bus route (2 bus transfers) is feasible under default cap = 2
      const res3 = rcspp(chainGraph, 'N0', 'N3', 100);
      expect(res3.feasible).toBe(true);

      // 3-bus route (2 bus transfers) is rejected when cap is 1 transfer
      const res3Capped = rcspp(chainGraph, 'N0', 'N3', 100, undefined, 0, {
        maxBusTransfers: 1,
      });
      expect(res3Capped.feasible).toBe(false);
    });
  });
});
