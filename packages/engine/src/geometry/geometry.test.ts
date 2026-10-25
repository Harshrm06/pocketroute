import { describe, expect, it } from 'vitest';
import type { GeoJsonLineString, LatLng } from '@pocketroute/shared';
import {
  bezierEstimate,
  catmullRomSpline,
  coordinatesLengthMeters,
  douglasPeucker,
  haversineKm,
  projectPointToLine,
  roadEstimateKm,
  sliceLine,
} from './index.js';

describe('Geometry Module', () => {
  describe('haversineKm & roadEstimateKm', () => {
    it('computes known haversine distance between Pune landmarks', () => {
      // Swargate (18.5018, 73.8586) to Shivajinagar (18.5314, 73.8446)
      const swargate: LatLng = { lat: 18.5018, lng: 73.8586 };
      const shivajinagar: LatLng = { lat: 18.5314, lng: 73.8446 };

      const distKm = haversineKm(swargate, shivajinagar);
      // Straight line distance is ~3.6 km
      expect(distKm).toBeGreaterThan(3.0);
      expect(distKm).toBeLessThan(4.2);

      // roadEstimateKm should be exactly haversine * 1.25
      expect(roadEstimateKm(swargate, shivajinagar)).toBeCloseTo(
        distKm * 1.25,
        6,
      );
    });

    it('returns 0 for identical points', () => {
      const pt: LatLng = { lat: 18.5204, lng: 73.8567 };
      expect(haversineKm(pt, pt)).toBe(0);
      expect(roadEstimateKm(pt, pt)).toBe(0);
    });

    it('computes coordinatesLengthMeters for a line', () => {
      const coords: [number, number][] = [
        [73.8586, 18.5018],
        [73.8446, 18.5314],
      ];
      const lengthM = coordinatesLengthMeters(coords);
      const expectedM =
        haversineKm(
          { lat: 18.5018, lng: 73.8586 },
          { lat: 18.5314, lng: 73.8446 },
        ) * 1000;
      expect(lengthM).toBeCloseTo(expectedM, 3);
    });
  });

  describe('bezierEstimate', () => {
    it('returns a valid LineString with the expected endpoints', () => {
      const from: LatLng = { lat: 18.5, lng: 73.8 };
      const to: LatLng = { lat: 18.6, lng: 73.9 };

      const line = bezierEstimate(from, to, 20);
      expect(line.type).toBe('LineString');
      expect(line.coordinates.length).toBe(21);

      const first = line.coordinates[0]!;
      const last = line.coordinates[line.coordinates.length - 1]!;

      expect(first[0]).toBeCloseTo(from.lng, 6);
      expect(first[1]).toBeCloseTo(from.lat, 6);
      expect(last[0]).toBeCloseTo(to.lng, 6);
      expect(last[1]).toBeCloseTo(to.lat, 6);
    });

    it('is not a straight line (its midpoint is offset from the chord)', () => {
      const from: LatLng = { lat: 18.5, lng: 73.8 };
      const to: LatLng = { lat: 18.6, lng: 73.9 };

      const line = bezierEstimate(from, to, 20);
      // Midpoint on chord
      const chordMidLng = (from.lng + to.lng) / 2;
      const chordMidLat = (from.lat + to.lat) / 2;

      // Midpoint on curve (index 10 out of 20 segments)
      const curveMid = line.coordinates[10]!;

      // Distance from curve midpoint to chord midpoint must be non-zero
      const offsetDist = Math.hypot(
        curveMid[0] - chordMidLng,
        curveMid[1] - chordMidLat,
      );
      expect(offsetDist).toBeGreaterThan(0.005);

      // Verify the midpoint perpendicular offset corresponds to 0.15 * 0.5 = 7.5%
      const dx = to.lng - from.lng;
      const dy = to.lat - from.lat;
      const expectedOffsetLng = -0.075 * dy;
      const expectedOffsetLat = 0.075 * dx;

      expect(curveMid[0]).toBeCloseTo(chordMidLng + expectedOffsetLng, 5);
      expect(curveMid[1]).toBeCloseTo(chordMidLat + expectedOffsetLat, 5);
    });

    it('handles identical from and to gracefully', () => {
      const pt: LatLng = { lat: 18.52, lng: 73.85 };
      const line = bezierEstimate(pt, pt);
      expect(line.coordinates.length).toBe(2);
      expect(line.coordinates[0]).toEqual([pt.lng, pt.lat]);
      expect(line.coordinates[1]).toEqual([pt.lng, pt.lat]);
    });
  });

  describe('sliceLine', () => {
    // Construct a multi-segment line: A -> B -> C -> D
    const testLine: GeoJsonLineString = {
      type: 'LineString',
      coordinates: [
        [73.8, 18.5], // Node 0
        [73.82, 18.52], // Node 1
        [73.86, 18.54], // Node 2
        [73.9, 18.58], // Node 3
      ],
    };

    it('returns a sub-line whose endpoints are the projections of from and to', () => {
      // Query points slightly off the line
      const fromQuery: LatLng = { lat: 18.508, lng: 73.812 }; // near segment 0-1
      const toQuery: LatLng = { lat: 18.555, lng: 73.875 }; // near segment 2-3

      const projFrom = projectPointToLine(testLine, fromQuery);
      const projTo = projectPointToLine(testLine, toQuery);

      const sliced = sliceLine(testLine, fromQuery, toQuery);

      expect(sliced.type).toBe('LineString');
      expect(sliced.coordinates.length).toBeGreaterThanOrEqual(2);

      const start = sliced.coordinates[0]!;
      const end = sliced.coordinates[sliced.coordinates.length - 1]!;

      // Endpoints must match projections exactly
      expect(start[0]).toBeCloseTo(projFrom.point[0], 6);
      expect(start[1]).toBeCloseTo(projFrom.point[1], 6);
      expect(end[0]).toBeCloseTo(projTo.point[0], 6);
      expect(end[1]).toBeCloseTo(projTo.point[1], 6);

      // Intermediate vertices must include Node 1 and Node 2
      const coords = sliced.coordinates;
      expect(
        coords.some(
          (c) => Math.abs(c[0] - 73.82) < 1e-4 && Math.abs(c[1] - 18.52) < 1e-4,
        ),
      ).toBe(true);
      expect(
        coords.some(
          (c) => Math.abs(c[0] - 73.86) < 1e-4 && Math.abs(c[1] - 18.54) < 1e-4,
        ),
      ).toBe(true);
    });

    it('supports slicing in reverse direction (to before from)', () => {
      const fromQuery: LatLng = { lat: 18.555, lng: 73.875 }; // near segment 2-3
      const toQuery: LatLng = { lat: 18.508, lng: 73.812 }; // near segment 0-1

      const projFrom = projectPointToLine(testLine, fromQuery);
      const projTo = projectPointToLine(testLine, toQuery);

      const sliced = sliceLine(testLine, fromQuery, toQuery);

      const start = sliced.coordinates[0]!;
      const end = sliced.coordinates[sliced.coordinates.length - 1]!;

      expect(start[0]).toBeCloseTo(projFrom.point[0], 6);
      expect(start[1]).toBeCloseTo(projFrom.point[1], 6);
      expect(end[0]).toBeCloseTo(projTo.point[0], 6);
      expect(end[1]).toBeCloseTo(projTo.point[1], 6);
    });

    it('slices within a single segment', () => {
      const fromQuery: LatLng = { lat: 18.505, lng: 73.805 };
      const toQuery: LatLng = { lat: 18.515, lng: 73.815 };

      const projFrom = projectPointToLine(testLine, fromQuery);
      const projTo = projectPointToLine(testLine, toQuery);

      const sliced = sliceLine(testLine, fromQuery, toQuery);

      expect(sliced.coordinates.length).toBe(2);
      expect(sliced.coordinates[0]![0]).toBeCloseTo(projFrom.point[0], 6);
      expect(sliced.coordinates[1]![0]).toBeCloseTo(projTo.point[0], 6);
    });
  });

  describe('douglasPeucker', () => {
    it('simplifies collinear points down to 2 endpoints', () => {
      const line: [number, number][] = [
        [73.8, 18.5],
        [73.81, 18.51],
        [73.82, 18.52],
        [73.83, 18.53],
        [73.84, 18.54],
      ];

      const simplified = douglasPeucker(line, 2);
      expect(simplified.length).toBe(2);
      expect(simplified[0]).toEqual(line[0]);
      expect(simplified[1]).toEqual(line[line.length - 1]);
    });

    it('preserves significant deviation exceeding tolerance', () => {
      const line: [number, number][] = [
        [73.8, 18.5],
        [73.82, 18.52], // Deviates strongly
        [73.8, 18.54],
      ];

      const simplified = douglasPeucker(line, 2);
      expect(simplified.length).toBe(3);
    });
  });

  describe('catmullRomSpline', () => {
    it('passes through all provided station coordinates', () => {
      const stations: LatLng[] = [
        { lat: 18.5, lng: 73.8 },
        { lat: 18.52, lng: 73.83 },
        { lat: 18.55, lng: 73.85 },
        { lat: 18.58, lng: 73.89 },
      ];

      const spline = catmullRomSpline(stations, 10);
      expect(spline.type).toBe('LineString');
      expect(spline.coordinates.length).toBeGreaterThan(stations.length);

      // Verify that every station coordinate is contained in spline coordinates
      for (const st of stations) {
        const found = spline.coordinates.some(
          (c) =>
            Math.abs(c[0] - st.lng) < 1e-5 && Math.abs(c[1] - st.lat) < 1e-5,
        );
        expect(found).toBe(true);
      }
    });
  });
});
