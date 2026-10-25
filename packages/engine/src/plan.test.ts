import { describe, expect, it } from 'vitest';
import { planResponseSchema } from '@pocketroute/shared';
import type { LineId, Mode } from '@pocketroute/shared';
import type {
  Edge,
  GraphNode,
  StateGraph,
  TransitStop,
} from './graph/index.js';
import { encodeState, getDefaultNetwork } from './graph/index.js';
import {
  planRoutes,
  resolveDepartureMinutes,
  theoreticalBounds,
} from './plan.js';

// ---------------------------------------------------------------------------
// Test helpers & fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a synthetic static graph result for testing known algorithmic relationships.
 */
function createFixtureStaticGraph(
  nodeDefs: { id: string; name: string; lat: number; lng: number }[],
  edgeDefs: {
    from: string;
    to: string;
    line: LineId;
    mode: Mode;
    fare: number;
    timeMin: number;
  }[],
) {
  const nodes = new Map<string, GraphNode>();
  const adj = new Map<string, Edge[]>();
  const nodeAdj = new Map<string, Edge[]>();
  const allStops: TransitStop[] = [];
  const lineSet = new Set<string>(['NONE', 'WALK', 'AUTO', 'CAB']);

  for (const n of nodeDefs) {
    nodes.set(n.id, {
      id: n.id,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      type: 'bus_stop',
      lines: ['NONE', 'WALK', 'AUTO', 'CAB'],
    });

    allStops.push({
      nodeId: n.id,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      type: 'bus_stop',
      line: 'BUS_101' as LineId,
    });
  }

  let edgeCount = 0;
  for (const e of edgeDefs) {
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

    const sList = adj.get(fromState) ?? [];
    sList.push(edge);
    adj.set(fromState, sList);

    const nList = nodeAdj.get(e.from) ?? [];
    nList.push(edge);
    nodeAdj.set(e.from, nList);

    edgeCount++;
  }

  const graph: StateGraph = {
    nodes,
    adj,
    nodeAdj,
    edgeCount,
    lineCount: lineSet.size,
  };

  return {
    graph,
    allStops,
  };
}

describe('packages/engine/src/plan', () => {
  describe('theoreticalBounds (PRD §8.6)', () => {
    it('returns exact bound strings and calculated operations', () => {
      const stats = { V: 100, E: 500, L: 20 };
      const B = 100;
      const bounds = theoreticalBounds(stats, B);

      expect(bounds.routeA.bound).toBe('O(E*L*log(V*L))');
      expect(bounds.routeB.bound).toBe('O(E*L*log(V*L))');
      expect(bounds.rcspp.bound).toBe('O(E*L*B*log(V*L*B))');
      expect(bounds.dense.bound).toBe('Theta(V*L*(B+1))');

      expect(bounds.routeA.ops).toBeGreaterThan(0);
      expect(bounds.routeB.ops).toBeGreaterThan(0);
      expect(bounds.rcspp.ops).toBeGreaterThan(bounds.routeA.ops);
      expect(bounds.dense.ops).toBe(100 * 20 * 101);
    });
  });

  describe('resolveDepartureMinutes', () => {
    it('parses HH:mm string', () => {
      expect(resolveDepartureMinutes('17:30')).toBe(1050);
      expect(resolveDepartureMinutes('08:00')).toBe(480);
    });

    it('handles numeric now', () => {
      expect(resolveDepartureMinutes('now', 600)).toBe(600);
    });

    it('handles string now', () => {
      expect(resolveDepartureMinutes('now', '09:15')).toBe(555);
    });
  });

  describe('planRoutes on fixture network (PRD §17.2 theorem tests)', () => {
    // 3 transit alternatives between S1 and S2:
    // Option 1: CAB direct, fare = 100, time = 10 min
    // Option 2: METRO, fare = 30, time = 20 min
    // Option 3: BUS, fare = 15, time = 45 min
    const fixture = createFixtureStaticGraph(
      [
        { id: 'S1', name: 'Stop 1', lat: 18.51, lng: 73.85 },
        { id: 'S2', name: 'Stop 2', lat: 18.52, lng: 73.86 },
      ],
      [
        {
          from: 'S1',
          to: 'S2',
          line: 'CAB',
          mode: 'CAB',
          fare: 100,
          timeMin: 10,
        },
        {
          from: 'S1',
          to: 'S2',
          line: 'METRO_PURPLE',
          mode: 'METRO',
          fare: 30,
          timeMin: 20,
        },
        {
          from: 'S1',
          to: 'S2',
          line: 'BUS_2',
          mode: 'BUS',
          fare: 15,
          timeMin: 45,
        },
      ],
    );

    const reqBase = {
      origin: { lat: 18.51, lng: 73.85, label: 'Origin Point' },
      destination: { lat: 18.52, lng: 73.86, label: 'Destination Point' },
      departureTime: '10:00',
      options: {
        maxWalkM: 200,
        includeAuto: false,
        includeCab: false, // Disallow direct O->D cab so transit edges govern
      },
    };

    it('Theorem 2.1: If Route A cost <= B, Smart time equals Route A time', () => {
      const result = planRoutes(fixture, {
        ...reqBase,
        budgetINR: 120, // Enough for CAB
      });

      expect(result.routes.smart).not.toBeNull();
      expect(result.routes.fastest.feasible).toBe(true);
      expect(result.routes.smart!.durationMin).toBe(
        result.routes.fastest.durationMin,
      );
      expect(result.routes.smart!.totalFareINR).toBeLessThanOrEqual(120);
    });

    it('Theorem 2.2: Smart time >= Route A time and Smart cost >= Route B cost', () => {
      const result = planRoutes(fixture, {
        ...reqBase,
        budgetINR: 40, // Can afford METRO (₹30), but not CAB (₹100)
      });

      expect(result.routes.smart).not.toBeNull();
      // Smart chooses METRO (20 min, ₹30)
      expect(result.routes.smart!.durationMin).toBeGreaterThanOrEqual(
        result.routes.fastest.durationMin,
      );
      expect(result.routes.smart!.totalFareINR).toBeGreaterThanOrEqual(
        result.routes.cheapest.totalFareINR,
      );
      expect(result.routes.smart!.totalFareINR).toBeLessThanOrEqual(40);

      // Verify comparison fields
      expect(result.comparison).not.toBeNull();
      expect(result.comparison!.fareSavedVsFastestINR).toBe(
        result.routes.fastest.totalFareINR - result.routes.smart!.totalFareINR,
      );
      expect(result.comparison!.extraMinVsFastest).toBe(
        result.routes.smart!.durationMin - result.routes.fastest.durationMin,
      );
    });

    it('Monotonicity: Increasing budget never increases Smart arrival time', () => {
      const budgets = [15, 25, 30, 50, 100, 150];
      let prevArrivalMin = Infinity;

      for (const b of budgets) {
        const res = planRoutes(fixture, { ...reqBase, budgetINR: b });
        expect(res.routes.smart).not.toBeNull();
        const duration = res.routes.smart!.durationMin;
        expect(duration).toBeLessThanOrEqual(prevArrivalMin);
        prevArrivalMin = duration;
      }
    });

    it('Infeasibility (PRD §8.8): when B is below the minimum possible fare', () => {
      const result = planRoutes(fixture, {
        ...reqBase,
        budgetINR: 10, // Minimum transit fare is 15
      });

      expect(result.routes.smart).toBeNull();
      expect(result.comparison).toBeNull();
      expect(result.infeasible).not.toBeNull();
      expect(result.infeasible!.minimumRequiredFareINR).toBe(15);
      expect(result.infeasible!.message).toContain(
        'Minimum possible fare is ₹15',
      );
    });

    it('supports debugDense flag and matches smart route', () => {
      const result = planRoutes(
        fixture,
        { ...reqBase, budgetINR: 50 },
        undefined,
        { debugDense: true },
      );

      expect(result.routes.dense).not.toBeNull();
      expect(result.routes.dense!.arrivalTime).toBe(
        result.routes.smart!.arrivalTime,
      );
      expect(result.metrics.dp.statesExplored).toBeGreaterThan(0);
    });
  });

  describe('planRoutes on real Pune default network (PRD §9.1 Canonical Example)', () => {
    const network = getDefaultNetwork();

    it('successfully plans Swargate to Shivajinagar at 17:30 with budget ₹75', () => {
      const result = planRoutes(network, {
        origin: { lat: 18.5015, lng: 73.8542, label: 'Swargate' },
        destination: { lat: 18.5303, lng: 73.8488, label: 'Shivajinagar' },
        departureTime: '17:30',
        budgetINR: 75,
      });

      // 1. Zod schema validation
      const parseResult = planResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      // 2. Route checks
      expect(result.routes.fastest.feasible).toBe(true);
      expect(result.routes.cheapest.feasible).toBe(true);
      expect(result.routes.smart).not.toBeNull();
      expect(result.routes.smart!.feasible).toBe(true);
      expect(result.routes.smart!.totalFareINR).toBeLessThanOrEqual(75);

      // 3. Comparison checks
      expect(result.comparison).not.toBeNull();
      expect(result.comparison!.fareSavedVsFastestINR).toBeGreaterThanOrEqual(
        0,
      );
      expect(result.comparison!.extraMinVsFastest).toBeGreaterThanOrEqual(0);

      // 4. Metrics checks (PRD §8.7)
      expect(result.metrics.pq.pushes).toBeGreaterThan(0);
      expect(result.metrics.pq.pops).toBeGreaterThan(0);
      expect(result.metrics.relaxations).toBeGreaterThan(0);
      expect(result.metrics.labels.created).toBeGreaterThan(0);
      expect(result.metrics.graph.V).toBeGreaterThan(0);
      expect(result.metrics.graph.E).toBeGreaterThan(0);
      expect(result.metrics.graph.B).toBe(75);
      expect(result.metrics.timing.runs).toBe(5);
      expect(result.metrics.timing.medianMs).toBeGreaterThan(0);

      // 5. Theory checks
      expect(result.metrics.theory.routeA.ops).toBeGreaterThan(0);
      expect(result.metrics.theory.rcspp.ops).toBeGreaterThan(0);
      expect(result.metrics.theory.dense.ops).toBeGreaterThan(0);
    });
  });
});
