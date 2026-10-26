import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_WALK_LEG_M,
  METRO_BOARDING_PENALTY_MIN,
  MIN_TRANSFER_MIN,
} from '@pocketroute/shared';
import { metroFareINR, autoFareINR } from '../pricing/index.js';
import { haversineKm } from '../geometry/index.js';
import {
  buildFirstMileEdges,
  buildQueryGraph,
  buildStaticGraph,
  decodeState,
  encodeState,
  getDefaultNetwork,
  getOutgoingEdges,
  reverseGraph,
  type Edge,
  type TransitStop,
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

  describe('First-mile connector (PRD Section 22.2)', () => {
    it('throws a validation error when GPS origin is outside the Pune bounding box', () => {
      // Mumbai coordinates (outside Pune bounding box: 18.40-18.70, 73.70-74.00)
      const outsidePoint = { lat: 19.076, lng: 72.877 };
      expect(() =>
        buildFirstMileEdges(outsidePoint, staticResult.allStops),
      ).toThrow(/outside the Pune bounding box/i);
    });

    it('selects exactly the 3 nearest transit stops by Haversine distance', () => {
      // Origin near Swargate
      const origin = { lat: 18.5015, lng: 73.8542 };
      const edges = buildFirstMileEdges(origin, staticResult.allStops);

      // Should produce at most 3 edges (one for each of the 3 nearest stops within feeder range)
      expect(edges.length).toBeGreaterThan(0);
      expect(edges.length).toBeLessThanOrEqual(3);

      // Every edge must originate from 'O|NONE'
      for (const e of edges) {
        expect(e.from).toBe('O|NONE');
      }
    });

    it('adds a WALK access edge at Rs 0 when stop distance <= 1.2 km', () => {
      // Create a mock stop 0.8 km away
      const origin = { lat: 18.5204, lng: 73.8567 };
      const testStops: TransitStop[] = [
        {
          nodeId: 'stop_close',
          name: 'Close Stop',
          lat: 18.525, // ~0.5 km away
          lng: 73.8567,
          type: 'bus_stop',
          line: 'BUS_2',
        },
      ];

      const edges = buildFirstMileEdges(origin, testStops);
      expect(edges.length).toBe(1);
      const walkEdge = edges[0]!;
      expect(walkEdge.mode).toBe('WALK');
      expect(walkEdge.fareINR).toBe(0);
      expect(walkEdge.meta.distanceKm).toBeLessThanOrEqual(1.2);
    });

    it('adds an AUTO feeder edge priced with existing auto formula at 2 km and 4 km', () => {
      const origin = { lat: 18.5, lng: 73.85 };

      // Exact latitude delta for d km: d / 6371 * (180 / Math.PI)
      const degForKm = (km: number) => (km / 6371) * (180 / Math.PI);

      // Stop exactly 2.0 km away
      const stop2km: TransitStop = {
        nodeId: 'stop_2km',
        name: 'Stop 2km',
        lat: origin.lat + degForKm(2.0),
        lng: origin.lng,
        type: 'bus_stop',
        line: 'BUS_2',
      };

      // Stop exactly 3.95 km away (within <= 4.0 km feeder threshold)
      const stop4km: TransitStop = {
        nodeId: 'stop_4km',
        name: 'Stop 4km',
        lat: origin.lat + degForKm(3.95),
        lng: origin.lng,
        type: 'bus_stop',
        line: 'BUS_2',
      };

      // Stop 6.0 km away (exceeds 4.0 km threshold -> should not produce edge)
      const stop6km: TransitStop = {
        nodeId: 'stop_6km',
        name: 'Stop 6km',
        lat: origin.lat + degForKm(6.0),
        lng: origin.lng,
        type: 'bus_stop',
        line: 'BUS_2',
      };

      const edges = buildFirstMileEdges(origin, [stop2km, stop4km, stop6km], {
        localHourIST: 12,
      });

      // Nearest 3 are stop2km, stop4km, stop6km
      // stop2km and stop4km should produce AUTO edges; stop6km should not
      expect(edges.length).toBe(2);

      const edge2 = edges.find((e) => e.to.includes('stop_2km'))!;
      const edge4 = edges.find((e) => e.to.includes('stop_4km'))!;

      expect(edge2).toBeDefined();
      expect(edge2.mode).toBe('AUTO');
      // Must match dynamic autoFareINR formula, NOT a hard-coded value
      const expectedFare2 = autoFareINR(edge2.meta.distanceKm, 12);
      expect(edge2.fareINR).toBe(expectedFare2);

      expect(edge4).toBeDefined();
      expect(edge4.mode).toBe('AUTO');
      const expectedFare4 = autoFareINR(edge4.meta.distanceKm, 12);
      expect(edge4.fareINR).toBe(expectedFare4);

      // Verify geometryQuality is flagged 'estimated'
      expect(edge2.meta.geometryQuality).toBe('estimated');
      expect(edge4.meta.geometryQuality).toBe('estimated');
    });
  });
});
