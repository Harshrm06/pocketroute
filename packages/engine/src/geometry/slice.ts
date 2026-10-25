import type { GeoJsonLineString, LatLng } from '@pocketroute/shared';
import { haversineKm } from './distance.js';

export interface ProjectionResult {
  point: [number, number]; // [lng, lat]
  segmentIndex: number;
  fraction: number;
  mu: number; // segmentIndex + fraction
  distanceKm: number;
}

/**
 * Projects a LatLng point onto the closest point of a GeoJSON LineString.
 *
 * @param line GeoJsonLineString with coordinates in [lng, lat] order
 * @param pt LatLng to project
 * @returns ProjectionResult containing the projected point, segment index, fraction, and distance
 */
export function projectPointToLine(
  line: GeoJsonLineString,
  pt: LatLng,
): ProjectionResult {
  const coords = line.coordinates;
  if (coords.length === 0) {
    return {
      point: [pt.lng, pt.lat],
      segmentIndex: 0,
      fraction: 0,
      mu: 0,
      distanceKm: 0,
    };
  }

  if (coords.length === 1) {
    const single = coords[0]!;
    return {
      point: [single[0], single[1]],
      segmentIndex: 0,
      fraction: 0,
      mu: 0,
      distanceKm: haversineKm(pt, { lat: single[1], lng: single[0] }),
    };
  }

  let bestDist = Infinity;
  let bestPoint: [number, number] = [coords[0]![0], coords[0]![1]];
  let bestSegment = 0;
  let bestFraction = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;

    const midLatRad = (((a[1] + b[1]) / 2) * Math.PI) / 180;
    const cosLat = Math.cos(midLatRad);

    const dx = (b[0] - a[0]) * cosLat;
    const dy = b[1] - a[1];
    const px = (pt.lng - a[0]) * cosLat;
    const py = pt.lat - a[1];

    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-12) {
      t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
    }

    const qLng = a[0] + t * (b[0] - a[0]);
    const qLat = a[1] + t * (b[1] - a[1]);
    const dist = haversineKm(pt, { lat: qLat, lng: qLng });

    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = [qLng, qLat];
      bestSegment = i;
      bestFraction = t;
    }
  }

  return {
    point: bestPoint,
    segmentIndex: bestSegment,
    fraction: bestFraction,
    mu: bestSegment + bestFraction,
    distanceKm: bestDist,
  };
}

/**
 * Slices a GeoJSON LineString between two points using nearest-point projection.
 * PRD Section 10.1 (Bus corridor slice between boarding and alighting stops).
 *
 * The returned LineString has its first coordinate at the projection of `from`
 * and its last coordinate at the projection of `to`.
 *
 * @param line GeoJsonLineString to slice
 * @param from Starting point (LatLng)
 * @param to Ending point (LatLng)
 * @returns Sliced GeoJsonLineString
 */
export function sliceLine(
  line: GeoJsonLineString,
  from: LatLng,
  to: LatLng,
): GeoJsonLineString {
  const coords = line.coordinates;
  if (coords.length < 2) {
    return {
      type: 'LineString',
      coordinates: coords.slice(),
    };
  }

  const projFrom = projectPointToLine(line, from);
  const projTo = projectPointToLine(line, to);

  const startPt: [number, number] = [projFrom.point[0], projFrom.point[1]];
  const endPt: [number, number] = [projTo.point[0], projTo.point[1]];

  const result: [number, number][] = [startPt];

  if (projFrom.mu <= projTo.mu) {
    // Forward direction along polyline
    if (projFrom.segmentIndex < projTo.segmentIndex) {
      for (let k = projFrom.segmentIndex + 1; k <= projTo.segmentIndex; k++) {
        const v = coords[k]!;
        // Avoid duplicate identical points with start or end
        const distToPrev = Math.hypot(
          v[0] - result[result.length - 1]![0],
          v[1] - result[result.length - 1]![1],
        );
        const distToEnd = Math.hypot(v[0] - endPt[0], v[1] - endPt[1]);
        if (distToPrev > 1e-9 && distToEnd > 1e-9) {
          result.push([v[0], v[1]]);
        }
      }
    }
  } else {
    // Reverse direction along polyline
    if (projFrom.segmentIndex > projTo.segmentIndex) {
      for (let k = projFrom.segmentIndex; k >= projTo.segmentIndex + 1; k--) {
        const v = coords[k]!;
        const distToPrev = Math.hypot(
          v[0] - result[result.length - 1]![0],
          v[1] - result[result.length - 1]![1],
        );
        const distToEnd = Math.hypot(v[0] - endPt[0], v[1] - endPt[1]);
        if (distToPrev > 1e-9 && distToEnd > 1e-9) {
          result.push([v[0], v[1]]);
        }
      }
    }
  }

  // Always end with the projection of `to`
  result.push(endPt);

  return {
    type: 'LineString',
    coordinates: result,
  };
}
