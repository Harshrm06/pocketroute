import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { LineId, Mode } from '@pocketroute/shared';
import type { Edge, GraphNode, StateGraph } from '../graph/index.js';
import { encodeState } from '../graph/index.js';
import { Profiler } from '../profiler/index.js';
import { rcspp } from './rcspp.js';
import { denseDP } from './dense-dp.js';
import type { RouteResult } from './dijkstra.js';

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

describe('packages/engine/src/algorithms/dense-dp', () => {
  it('solves budget-constrained shortest path on a small graph', () => {
    // Option 1: O -> D via CAB: fare 50, time 10 min
    // Option 2: O -> A (fare 10, time 15 min), A -> D (fare 10, time 15 min) on METRO: total fare 20, time 30 min
    // Option 3: O -> B (fare 5, time 25 min), B -> D (fare 5, time 25 min) on BUS: total fare 10, time 50 min
    const graph = createTestGraph(
      ['O', 'A', 'B', 'D'],
      [
        {
          from: 'O',
          to: 'D',
          line: 'CAB',
          mode: 'CAB',
          fare: 50,
          timeMin: 10,
        },
        {
          from: 'O',
          to: 'A',
          line: 'METRO_PURPLE',
          mode: 'METRO',
          fare: 10,
          timeMin: 15,
        },
        {
          from: 'A',
          to: 'D',
          line: 'METRO_AQUA',
          mode: 'METRO',
          fare: 10,
          timeMin: 15,
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

    const profiler = new Profiler();

    // Budget 50: can afford CAB (10 min)
    const res50 = denseDP(graph, 'O', 'D', 50, profiler);
    expect(res50.feasible).toBe(true);
    if (res50.feasible) {
      expect(res50.totalTimeMin).toBe(10);
      expect(res50.totalFareINR).toBe(50);
      expect(res50.legs.length).toBe(1);
    }

    // Budget 25: can afford METRO (30 min, ₹20)
    const res25 = denseDP(graph, 'O', 'D', 25);
    expect(res25.feasible).toBe(true);
    if (res25.feasible) {
      expect(res25.totalTimeMin).toBe(30);
      expect(res25.totalFareINR).toBe(20);
      expect(res25.legs.length).toBe(2);
    }

    // Budget 10: can only afford BUS (50 min, ₹10)
    const res10 = denseDP(graph, 'O', 'D', 10);
    expect(res10.feasible).toBe(true);
    if (res10.feasible) {
      expect(res10.totalTimeMin).toBe(50);
      expect(res10.totalFareINR).toBe(10);
      expect(res10.legs.length).toBe(2);
    }

    // Budget 5: infeasible
    const res5 = denseDP(graph, 'O', 'D', 5);
    expect(res5.feasible).toBe(false);

    // Profiler metrics tracked
    expect(profiler.statesExplored).toBeGreaterThan(0);
    expect(profiler.statesTotal).toBeGreaterThan(0);
  });

  describe('Algorithm C (RCSPP) vs Algorithm D (Dense DP) cross-check suite (PRD §17.2)', () => {
    it('Algorithm C equals Algorithm D on time for 500 randomized small graphs (property test, fast-check, seeded)', () => {
      const linePool: LineId[] = ['WALK', 'BUS_2' as LineId, 'METRO_PURPLE'];

      // Generator for small graphs with up to 12 states (3 to 4 nodes, 3 lines => <= 12 states)
      const randomGraphAndBudgetGen = fc
        .integer({ min: 3, max: 4 })
        .chain((nodeCount) => {
          const nodeNames = Array.from({ length: nodeCount }, (_, i) =>
            i === 0 ? 'O' : i === nodeCount - 1 ? 'D' : `N${i}`,
          );

          // Between nodeCount and nodeCount * 3 edges
          return fc
            .record({
              budget: fc.integer({ min: 10, max: 100 }),
              edgesRaw: fc.array(
                fc.record({
                  uIdx: fc.integer({ min: 0, max: nodeCount - 1 }),
                  vIdx: fc.integer({ min: 0, max: nodeCount - 1 }),
                  lineIdx: fc.integer({ min: 0, max: linePool.length - 1 }),
                  fare: fc.integer({ min: 0, max: 25 }),
                  timeMin: fc.integer({ min: 2, max: 30 }),
                }),
                { minLength: nodeCount, maxLength: nodeCount * 3 },
              ),
            })
            .map(({ budget, edgesRaw }) => {
              const edges = edgesRaw
                .filter((e) => e.uIdx !== e.vIdx)
                .map((e) => ({
                  from: nodeNames[e.uIdx]!,
                  to: nodeNames[e.vIdx]!,
                  line: linePool[e.lineIdx]!,
                  mode: (e.lineIdx === 0
                    ? 'WALK'
                    : e.lineIdx === 1
                      ? 'BUS'
                      : 'METRO') as Mode,
                  fare: e.fare,
                  timeMin: e.timeMin,
                }));

              return {
                nodeNames,
                edges,
                budget,
              };
            });
        });

      let passedCount = 0;

      fc.assert(
        fc.property(randomGraphAndBudgetGen, ({ nodeNames, edges, budget }) => {
          const graph = createTestGraph(nodeNames, edges);

          const resC = rcspp(graph, 'O', 'D', budget);
          const resD = denseDP(graph, 'O', 'D', budget);

          // Both must agree on feasibility
          expect(resC.feasible).toBe(resD.feasible);

          if (resC.feasible && resD.feasible) {
            const routeC = resC as RouteResult;
            const routeD = resD as RouteResult;

            // PRD §8.4: Algorithm C and Algorithm D must return the same optimal arrival time
            expect(routeC.totalTimeMin).toBe(routeD.totalTimeMin);
            expect(routeC.totalFareINR).toBeLessThanOrEqual(budget);
            expect(routeD.totalFareINR).toBeLessThanOrEqual(budget);
          }

          passedCount++;
        }),
        { numRuns: 500, seed: 42 },
      );

      expect(passedCount).toBe(500);
      console.log(
        `Cross-check suite: verified ${passedCount} / 500 randomized graphs between Algorithm C (RCSPP) and Algorithm D (Dense DP)`,
      );
    });
  });
});
