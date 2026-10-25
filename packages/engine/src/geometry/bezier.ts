import type { GeoJsonLineString, LatLng } from '@pocketroute/shared';

/**
 * Computes an estimated road/walk polyline as a quadratic Bézier curve
 * with a perpendicular control-point offset of 15% of the chord vector.
 * PRD Section 10.3.
 *
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @param numSegments Number of subdivisions (defaults to 20)
 * @returns GeoJsonLineString representing the curve
 */
export function bezierEstimate(
  from: LatLng,
  to: LatLng,
  numSegments = 20,
): GeoJsonLineString {
  const p0: [number, number] = [from.lng, from.lat];
  const p2: [number, number] = [to.lng, to.lat];

  const dx = p2[0] - p0[0];
  const dy = p2[1] - p0[1];

  // If endpoints coincide, return a 2-point line with same coordinates
  if (dx === 0 && dy === 0) {
    return {
      type: 'LineString',
      coordinates: [p0, p2],
    };
  }

  // Chord midpoint
  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;

  // 15% perpendicular control-point offset: normal vector is (-dy, dx)
  const p1: [number, number] = [mx - 0.15 * dy, my + 0.15 * dx];

  const steps = Math.max(2, numSegments);
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const invT = 1 - t;
    const x = invT * invT * p0[0] + 2 * invT * t * p1[0] + t * t * p2[0];
    const y = invT * invT * p0[1] + 2 * invT * t * p1[1] + t * t * p2[1];
    coordinates.push([x, y]);
  }

  return {
    type: 'LineString',
    coordinates,
  };
}
