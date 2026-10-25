import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_WALK_LEG_M,
  METRO_BOARDING_PENALTY_MIN,
  MIN_TRANSFER_MIN,
} from '@pocketroute/shared';
import { metroFareINR } from '../pricing/index.js';
import { haversineKm } from '../geometry/index.js';
import {
  buildQueryGraph,
  buildStaticGraph,
  decodeState,
  encodeState,
  getDefaultNetwork,
  getOutgoingEdges,
  reverseGraph,
  type Edge,
} from './index.js';

describe('packages/engine/src/graph', () => {
  const network = getDefaultNetwork();
  const staticResult = buildStaticGraph(network);

  describe('Static graph construction & macro-ride edges', () => {
    it('reports edge counts for the default network', () => {
      const { graph, allStops } = staticResult;
      expect(graph.nodes.size).toBeGreaterThan(0);
      expect(graph.edgeCount).toBeGreaterThan(0);
      expect(allStops.length).toBeGreaterThan(0);

      // Log edge count breakdown for verification report
      let metroEdges = 0;
      let busEdges = 0;
      for (const [, edges] of graph.adj) {
        for (const e of edges) {
          if (e.mode === 'METRO') metroEdges++;
          if (e.mode === 'BUS') busEdges++;
        }
      }

      console.log('--- Default Network Edge Counts ---');
      console.log(`Nodes: ${graph.nodes.size}`);
      console.log(`Total transit stops: ${allStops.length}`);
      console.log(`Metro macro edges: ${metroEdges}`);
      console.log(`Bus macro edges: ${busEdges}`);
      console.log(`Total static macro-ride edges: ${graph.edgeCount}`);
      console.log(`Line identifiers: ${graph.lineCount}`);

      // Metro Purple: 14 stations -> 14*13/2 = 91 macro edges
      // Metro Aqua: 16 stations -> 16*15/2 = 120 macro edges
      // Total metro = 211
      expect(metroEdges).toBe(211);
      expect(graph.edgeCount).toBe(metroEdges + busEdges);
    });

    it('A 4-stop metro ride produces a single macro edge with the slab fare of the full distance', () => {
      // Line: METRO_PURPLE, stations:
      // 0: PCMC, 1: Sant Tukaram Nagar, 2: Bhosari, 3: Kasarwadi, 4: Phugewadi (4 stops)
      const purpleLine = network.metro.lines.find(
        (l) => l.id === 'METRO_PURPLE',
      )!;
      expect(purpleLine).toBeDefined();

      const s0 = purpleLine.stations[0]!;
      const s4 = purpleLine.stations[4]!;
      const fromState = encodeState(s0.id, 'METRO_PURPLE');
      const toState = encodeState(s4.id, 'METRO_PURPLE');

      // Look up edges from s0
      const outgoing = staticResult.graph.adj.get(fromState) ?? [];
      const macroEdges = outgoing.filter((e) => e.to === toState);

      // Exactly ONE macro-ride edge for the pair
      expect(macroEdges.length).toBe(1);
      const edge = macroEdges[0]!;

      // 4 stops traversed
      expect(edge.meta.stops).toBe(4);
      expect(edge.mode).toBe('METRO');
      expect(edge.line).toBe('METRO_PURPLE');

      // Calculate the sum of consecutive station distances
      let sumDist = 0;
      for (let i = 0; i < 4; i++) {
        sumDist += haversineKm(
          purpleLine.stations[i]!,
          purpleLine.stations[i + 1]!,
        );
      }
      expect(edge.meta.distanceKm).toBeCloseTo(sumDist, 5);

      // Fare must match the single slab fare for the total distance
      const expectedSlabFare = metroFareINR(sumDist);
      expect(edge.fareINR).toBe(expectedSlabFare);

      // Slab fare of continuous ride should be <= sum of separate segment fares
      let separateFaresSum = 0;
      for (let i = 0; i < 4; i++) {
        const segDist = haversineKm(
          purpleLine.stations[i]!,
          purpleLine.stations[i + 1]!,
        );
        separateFaresSum += metroFareINR(segDist);
      }
      expect(edge.fareINR).toBeLessThanOrEqual(separateFaresSum);
    });

    it('asserts every static edge has a non-negative fare', () => {
      for (const [, edges] of staticResult.graph.adj) {
        for (const e of edges) {
          expect(e.fareINR).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(e.fareINR)).toBe(true);
        }
      }
    });

    it('timeAt is FIFO-monotone on sampled t values across all static macro edges', () => {
      // Deterministic sample points: early morning, peak morning, mid-day, peak evening, night
      const testTimes = [
        360, // 06:00
        480, // 08:00
        540, // 09:00
        660, // 11:00
        780, // 13:00
        1050, // 17:30
        1140, // 19:00
        1230, // 20:30
        1320, // 22:00
      ];

      for (const [, edges] of staticResult.graph.adj) {
        for (const e of edges) {
          for (let i = 0; i < testTimes.length - 1; i++) {
            const t1 = testTimes[i]!;
            const t2 = testTimes[i + 1]!;
            const arr1 = e.timeAt(t1);
            const arr2 = e.timeAt(t2);

            // FIFO: if t1 <= t2 then arr1 <= arr2 (accounting for Infinity)
            if (Number.isFinite(arr1) && Number.isFinite(arr2)) {
              expect(arr1).toBeLessThanOrEqual(arr2);
            } else if (!Number.isFinite(arr1)) {
              // Once service stops for the day, it remains unavailable
              expect(arr2).toBe(Infinity);
            }
          }
        }
      }
    });

    it('timeAt satisfies FIFO property with fast-check randomized times', () => {
      // Sample 15 random edges and test with arbitrary t1 <= t2
      const allEdges: Edge[] = [];
      for (const [, edges] of staticResult.graph.adj) {
        allEdges.push(...edges);
      }

      const sampleEdges = allEdges.slice(0, 15);

      fc.assert(
        fc.property(
          fc.integer({ min: 360, max: 1300 }),
          fc.integer({ min: 1, max: 60 }),
          (t1, dt) => {
            const t2 = t1 + dt;
            for (const edge of sampleEdges) {
              const arr1 = edge.timeAt(t1);
              const arr2 = edge.timeAt(t2);
              if (Number.isFinite(arr1) && Number.isFinite(arr2)) {
                expect(arr1).toBeLessThanOrEqual(arr2);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Query graph construction', () => {
    // Swargate (lat: 18.5015, lng: 73.8542) to Shivajinagar (lat: 18.5303, lng: 73.8488)
    const origin = { lat: 18.5015, lng: 73.8542, label: 'Swargate' };
    const destination = { lat: 18.5303, lng: 73.8488, label: 'Shivaji Nagar' };

    it('builds a query graph with origin and destination nodes', () => {
      const qGraph = buildQueryGraph(staticResult, origin, destination, {
        maxWalkM: MAX_WALK_LEG_M,
        includeAuto: true,
        includeCab: true,
      });

      expect(qGraph.nodes.has('O')).toBe(true);
      expect(qGraph.nodes.has('D')).toBe(true);
      expect(qGraph.edgeCount).toBeGreaterThan(staticResult.graph.edgeCount);
    });

    it('No walk leg exceeds MAX_WALK_LEG_M unless fallback mode is set', () => {
      const qGraph = buildQueryGraph(staticResult, origin, destination, {
        maxWalkM: MAX_WALK_LEG_M,
        includeAuto: true,
        includeCab: true,
      });

      let walkLegCount = 0;
      for (const [, edges] of qGraph.adj) {
        for (const e of edges) {
          if (e.mode === 'WALK') {
            walkLegCount++;
            const walkDistM = e.meta.distanceKm * 1000;
            // Rounding tolerance for floating point: 1200.01 m
            expect(walkDistM).toBeLessThanOrEqual(MAX_WALK_LEG_M + 1e-4);
          }
        }
      }
      expect(walkLegCount).toBeGreaterThan(0);
    });

    it('respects a stricter maxWalkM limit (e.g. 600m)', () => {
      const strictWalkM = 600;
      const qGraph = buildQueryGraph(staticResult, origin, destination, {
        maxWalkM: strictWalkM,
        includeAuto: true,
        includeCab: true,
      });

      for (const [, edges] of qGraph.adj) {
        for (const e of edges) {
          if (e.mode === 'WALK') {
            const walkDistM = e.meta.distanceKm * 1000;
            expect(walkDistM).toBeLessThanOrEqual(strictWalkM + 1e-4);
          }
        }
      }
    });

    it('Transfer edges include MIN_TRANSFER_MIN and metro penalty when applicable', () => {
      const qGraph = buildQueryGraph(staticResult, origin, destination, {
        maxWalkM: MAX_WALK_LEG_M,
        includeAuto: true,
        includeCab: true,
      });

      let transferWalkCount = 0;
      for (const [, edges] of qGraph.adj) {
        for (const e of edges) {
          const fromNode = decodeState(e.from).nodeId;
          const toNode = decodeState(e.to).nodeId;

          // Transfer edges are between two transit stops (neither O nor D)
          if (
            fromNode !== 'O' &&
            fromNode !== 'D' &&
            toNode !== 'O' &&
            toNode !== 'D' &&
            e.mode === 'WALK'
          ) {
            transferWalkCount++;
            // Must include MIN_TRANSFER_MIN (1 min)
            expect(e.minTimeMin).toBeGreaterThanOrEqual(MIN_TRANSFER_MIN);

            const targetNode = qGraph.nodes.get(toNode);
            if (targetNode?.type === 'metro_station') {
              // PRD §7.6: adds MIN_TRANSFER_MIN + METRO_BOARDING_PENALTY_MIN
              expect(e.minTimeMin).toBeGreaterThanOrEqual(
                MIN_TRANSFER_MIN + METRO_BOARDING_PENALTY_MIN,
              );
            }
          }
        }
      }

      expect(transferWalkCount).toBeGreaterThan(0);
    });

    it('asserts every edge in query graph has a non-negative fare', () => {
      const qGraph = buildQueryGraph(staticResult, origin, destination, {
        maxWalkM: MAX_WALK_LEG_M,
        includeAuto: true,
        includeCab: true,
      });

      for (const [, edges] of qGraph.adj) {
        for (const e of edges) {
          expect(e.fareINR).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Rule C and getOutgoingEdges', () => {
    it('filters out edges with the same line identifier (Rule C)', () => {
      const qGraph = buildQueryGraph(
        staticResult,
        { lat: 18.5269, lng: 73.858 },
        { lat: 18.5303, lng: 73.8488 },
        {
          maxWalkM: MAX_WALK_LEG_M,
          includeAuto: true,
          includeCab: true,
        },
      );

      // From state (purple_civil_court, METRO_PURPLE):
      // Consecutive METRO_PURPLE ride must be filtered out by Rule C!
      const stateWithPurple = encodeState('purple_civil_court', 'METRO_PURPLE');
      const outgoing = getOutgoingEdges(qGraph, stateWithPurple);

      for (const e of outgoing) {
        expect(e.line).not.toBe('METRO_PURPLE');
      }
    });

    it('allows all departing lines from origin state (O, NONE)', () => {
      const qGraph = buildQueryGraph(
        staticResult,
        { lat: 18.5015, lng: 73.8542 },
        { lat: 18.5303, lng: 73.8488 },
        {
          maxWalkM: MAX_WALK_LEG_M,
          includeAuto: true,
          includeCab: true,
        },
      );

      const originState = encodeState('O', 'NONE');
      const outgoing = getOutgoingEdges(qGraph, originState);
      expect(outgoing.length).toBeGreaterThan(0);

      const modes = new Set(outgoing.map((e) => e.mode));
      expect(modes.has('WALK')).toBe(true);
      expect(modes.has('AUTO')).toBe(true);
      expect(modes.has('CAB')).toBe(true);
    });
  });

  describe('reverseGraph', () => {
    it('inverts all edges and preserves graph properties for backward Dijkstra', () => {
      const reversed = reverseGraph(staticResult.graph);

      expect(reversed.edgeCount).toBe(staticResult.graph.edgeCount);
      expect(reversed.nodes.size).toBe(staticResult.graph.nodes.size);

      // Pick an arbitrary edge from forward graph and verify reversed exists
      const [, firstEdges] = staticResult.graph.adj.entries().next().value!;
      const forwardEdge = firstEdges[0]!;

      const revEdges = reversed.adj.get(forwardEdge.to) ?? [];
      const match = revEdges.find(
        (e) =>
          e.to === forwardEdge.from &&
          e.line === forwardEdge.line &&
          e.fareINR === forwardEdge.fareINR &&
          e.minTimeMin === forwardEdge.minTimeMin,
      );

      expect(match).toBeDefined();
    });
  });
});
