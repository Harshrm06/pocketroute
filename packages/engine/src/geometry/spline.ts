import type { GeoJsonLineString, LatLng } from '@pocketroute/shared';

type Point2D = [number, number];

/**
 * Normalizes input point into [lng, lat] format.
 */
function toLngLat(pt: LatLng | [number, number]): Point2D {
  if (Array.isArray(pt)) {
    return [pt[0], pt[1]];
  }
  return [pt.lng, pt.lat];
}

/**
 * Evaluates a 2D Catmull-Rom spline segment at parameter t in [0, 1].
 */
function catmullRomPoint(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

  const y =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

  return [x, y];
}

/**
 * Generates a smooth Catmull-Rom spline passing exactly through the provided station coordinates.
 * PRD Section 10.2 fallback for rail geometry.
 *
 * @param points Ordered station points (either LatLng or [lng, lat])
 * @param pointsPerSegment Number of subdivisions per segment between consecutive stations (default: 10)
 * @returns GeoJsonLineString representing the smooth curve
 */
export function catmullRomSpline(
  points: (LatLng | [number, number])[],
  pointsPerSegment = 10,
): GeoJsonLineString {
  const pts: Point2D[] = points.map(toLngLat);

  if (pts.length === 0) {
    return { type: 'LineString', coordinates: [] };
  }
  if (pts.length === 1) {
    return {
      type: 'LineString',
      coordinates: [
        [pts[0]![0], pts[0]![1]],
        [pts[0]![0], pts[0]![1]],
      ],
    };
  }
  if (pts.length === 2) {
    // Linear interpolation
    const coordinates: Point2D[] = [];
    const steps = Math.max(1, pointsPerSegment);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      coordinates.push([
        pts[0]![0] + t * (pts[1]![0] - pts[0]![0]),
        pts[0]![1] + t * (pts[1]![1] - pts[0]![1]),
      ]);
    }
    return { type: 'LineString', coordinates };
  }

  const coordinates: Point2D[] = [];
  const steps = Math.max(2, pointsPerSegment);

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;

    // Extrapolate virtual endpoints for boundary tangents
    const p0: Point2D =
      i === 0 ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] : pts[i - 1]!;

    const p3: Point2D =
      i === pts.length - 2
        ? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]]
        : pts[i + 2]!;

    // For the first segment, include t = 0
    const startStep = i === 0 ? 0 : 1;
    for (let s = startStep; s <= steps; s++) {
      const t = s / steps;
      coordinates.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }

  return {
    type: 'LineString',
    coordinates,
  };
}
