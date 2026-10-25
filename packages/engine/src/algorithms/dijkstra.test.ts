import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  profilerMetricsSchema,
  type LineId,
  type Mode,
} from '@pocketroute/shared';
import type { Edge, GraphNode, StateGraph } from '../graph/index.js';
import { encodeState } from '../graph/index.js';
import { dijkstra, type RouteResult } from './dijkstra.js';
import { Profiler } from '../profiler/index.js';

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

describe('packages/engine/src/algorithms/dijkstra', () => {
  it('A tiny hand-built graph where the fastest route is more expensive, and the cheapest route is slower', () => {
    // Nodes: O, A, D
    // Path 1 (Direct CAB): O -> D, fare: 100, time: 10 min
    // Path 2 (METRO via A): O -> A (fare: 10, time: 15 min), A -> D (fare: 15, time: 15 min), total fare: 25, total time: 30 min
    // Path 3 (BUS via A): A -> D on BUS_2, fare: 5, time: 25 min -> total fare: 15, total time: 40 min
    const graph = createTestGraph(
      ['O', 'A', 'D'],
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
          fare: 15,
          timeMin: 15,
        },
        {
          from: 'A',
          to: 'D',
          line: 'BUS_2',
          mode: 'BUS',
          fare: 5,
          timeMin: 25,
        },
      ],
    );

    const profilerFastest = new Profiler();
    const fastest = dijkstra(graph, 'O', 'D', 'TIME', profilerFastest, 0);

    expect(fastest.feasible).toBe(true);
    if (!fastest.feasible) return;

    // Fastest route must choose direct CAB (10 min, ₹100)
    expect(fastest.totalTimeMin).toBe(10);
    expect(fastest.totalFareINR).toBe(100);
    expect(fastest.legs.length).toBe(1);
    expect(fastest.legs[0]!.mode).toBe('CAB');
    expect(fastest.legs[0]!.line).toBe('CAB');
    expect(fastest.legs[0]!.departAt).toBe('00:00');
    expect(fastest.legs[0]!.arriveAt).toBe('00:10');

    const profilerCheapest = new Profiler();
    const cheapest = dijkstra(graph, 'O', 'D', 'COST', profilerCheapest, 0);

    expect(cheapest.feasible).toBe(true);
    if (!cheapest.feasible) return;

    // Cheapest route must choose METRO_PURPLE to A then BUS_2 to D (total fare ₹15, time 40 min)
    expect(cheapest.totalFareINR).toBe(15);
    expect(cheapest.totalTimeMin).toBe(40);
    expect(cheapest.legs.length).toBe(2);
    expect(cheapest.legs[0]!.line).toBe('METRO_PURPLE');
    expect(cheapest.legs[1]!.line).toBe('BUS_2');

    // Fastest time < Cheapest time, but Fastest fare > Cheapest fare
    expect(fastest.totalTimeMin).toBeLessThan(cheapest.totalTimeMin);
    expect(fastest.totalFareINR).toBeGreaterThan(cheapest.totalFareINR);

    // Profiler recorded pushes, pops, relaxations
    expect(profilerFastest.pushes).toBeGreaterThan(0);
    expect(profilerFastest.pops).toBeGreaterThan(0);
    expect(profilerFastest.relaxations).toBeGreaterThan(0);
  });

  it('Rule C: no output path has consecutive same-line legs', () => {
    // Suppose a graph has split legs on METRO_PURPLE:
    // O -> A (METRO_PURPLE), A -> D (METRO_PURPLE)
    // and an alternate multi-modal path:
    // O -> A (METRO_PURPLE), A -> D (WALK)
    const graph = createTestGraph(
      ['O', 'A', 'D'],
      [
        {
          from: 'O',
          to: 'A',
          line: 'METRO_PURPLE',
          mode: 'METRO',
          fare: 10,
          timeMin: 5,
        },
        {
          from: 'A',
          to: 'D',
          line: 'METRO_PURPLE',
          mode: 'METRO',
          fare: 10,
          timeMin: 5,
        },
        {
          from: 'A',
          to: 'D',
          line: 'WALK',
          mode: 'WALK',
          fare: 0,
          timeMin: 15,
        },
      ],
    );

    const res = dijkstra(graph, 'O', 'D', 'TIME', undefined, 0);
    expect(res.feasible).toBe(true);
    if (!res.feasible) return;

    // The route cannot take A -> D on METRO_PURPLE because previous leg was METRO_PURPLE (Rule C)
    // It must take WALK for the second leg!
    expect(res.legs.length).toBe(2);
    expect(res.legs[0]!.line).toBe('METRO_PURPLE');
    expect(res.legs[1]!.line).toBe('WALK');

    // Verify Rule C assertion on all consecutive legs
    for (let i = 0; i < res.legs.length - 1; i++) {
      expect(res.legs[i]!.line).not.toBe(res.legs[i + 1]!.line);
    }
  });

  it('handles infeasible queries when destination is unreachable', () => {
    const graph = createTestGraph(
      ['O', 'A', 'D'],
      [
        {
          from: 'O',
          to: 'A',
          line: 'WALK',
          mode: 'WALK',
          fare: 0,
          timeMin: 10,
        },
        // No edges reaching D
      ],
    );

    const res = dijkstra(graph, 'O', 'D', 'TIME');
    expect(res.feasible).toBe(false);
  });

  it('handles origin equal to destination', () => {
    const graph = createTestGraph(['O'], []);
    const res = dijkstra(graph, 'O', 'O', 'TIME');
    expect(res.feasible).toBe(true);
    if (!res.feasible) return;
    expect(res.legs).toEqual([]);
    expect(res.totalFareINR).toBe(0);
    expect(res.totalTimeMin).toBe(0);
  });

  it('Profiler snapshot conforms to profilerMetricsSchema', () => {
    const profiler = new Profiler();
    profiler.push();
    profiler.pop();
    profiler.relax();
    profiler.createLabel();
    profiler.setGraph(50, 120, 15, 75);
    profiler.setTiming(12.5, 5, 11.8);

    const snapshot = profiler.snapshot();
    const parsed = profilerMetricsSchema.safeParse(snapshot);
    expect(parsed.success).toBe(true);
    expect(snapshot.pq.pushes).toBe(1);
    expect(snapshot.pq.pops).toBe(1);
    expect(snapshot.relaxations).toBe(1);
    expect(snapshot.labels.created).toBe(1);
    expect(snapshot.graph.V).toBe(50);
    expect(snapshot.graph.E).toBe(120);
    expect(snapshot.theory.routeA.ops).toBeGreaterThan(0);
  });

  describe('Brute-force DFS verification on randomized small graphs', () => {
    it('Dijkstra COST result has cost <= any path found by brute-force enumeration', () => {
      // Line IDs pool
      const linePool: LineId[] = [
        'WALK',
        'AUTO',
        'CAB',
        'METRO_PURPLE',
        'METRO_AQUA',
        'BUS_2' as LineId,
      ];

      // Arbitrary generator for small graphs with 4 to 7 nodes
      const graphGen = fc.integer({ min: 4, max: 7 }).chain((nodeCount) => {
        const nodeNames = Array.from({ length: nodeCount }, (_, i) =>
          i === 0 ? 'O' : i === nodeCount - 1 ? 'D' : `N${i}`,
        );

        // Generate between nodeCount and nodeCount * 3 edges
        const edgeCountGen = fc.integer({
          min: nodeCount,
          max: nodeCount * 3,
        });

        return edgeCountGen.chain((edgeCount) => {
          const edgeTuple = fc.record({
            uIdx: fc.integer({ min: 0, max: nodeCount - 1 }),
            vIdx: fc.integer({ min: 0, max: nodeCount - 1 }),
            lineIdx: fc.integer({ min: 0, max: linePool.length - 1 }),
            fare: fc.integer({ min: 0, max: 50 }),
            timeMin: fc.integer({ min: 1, max: 30 }),
          });

          return fc
            .array(edgeTuple, { minLength: edgeCount, maxLength: edgeCount })
            .map((edgesRaw) => {
              const edges = edgesRaw
                .filter((e) => e.uIdx !== e.vIdx)
                .map((e) => ({
                  from: nodeNames[e.uIdx]!,
                  to: nodeNames[e.vIdx]!,
                  line: linePool[e.lineIdx]!,
                  mode: (e.lineIdx === 0
                    ? 'WALK'
                    : e.lineIdx === 1
                      ? 'AUTO'
                      : e.lineIdx === 2
                        ? 'CAB'
                        : e.lineIdx <= 4
                          ? 'METRO'
                          : 'BUS') as Mode,
                  fare: e.fare,
                  timeMin: e.timeMin,
                }));

              return { nodeNames, edges };
            });
        });
      });

      fc.assert(
        fc.property(graphGen, ({ nodeNames, edges }) => {
          const graph = createTestGraph(nodeNames, edges);

          // Brute-force DFS to find all valid simple paths from O to D conforming to Rule C
          let minDfsCost = Infinity;

          function dfs(
            currNode: string,
            currLine: string,
            visitedNodes: Set<string>,
            costSoFar: number,
          ): void {
            if (currNode === 'D') {
              if (costSoFar < minDfsCost) {
                minDfsCost = costSoFar;
              }
              return;
            }

            const outgoing = graph.nodeAdj?.get(currNode) ?? [];
            for (const edge of outgoing) {
              const toNode = edge.to.slice(0, edge.to.indexOf('|'));
              // Simple path constraint: do not revisit nodes
              if (visitedNodes.has(toNode)) continue;
              // Rule C constraint: two consecutive edges cannot share the same line
              if (edge.line === currLine) continue;

              visitedNodes.add(toNode);
              dfs(toNode, edge.line, visitedNodes, costSoFar + edge.fareINR);
              visitedNodes.delete(toNode);
            }
          }

          const visited = new Set<string>(['O']);
          dfs('O', 'NONE', visited, 0);

          const dijkstraResult = dijkstra(graph, 'O', 'D', 'COST');

          if (minDfsCost < Infinity) {
            // If DFS found at least one valid path, Dijkstra MUST find a route
            expect(dijkstraResult.feasible).toBe(true);
            if (dijkstraResult.feasible) {
              // Dijkstra COST must find a path with cost <= any DFS simple path
              expect(
                (dijkstraResult as RouteResult).totalFareINR,
              ).toBeLessThanOrEqual(minDfsCost);
            }
          }
        }),
        { numRuns: 50 },
      );
    });
  });
});
