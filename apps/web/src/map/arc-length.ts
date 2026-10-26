/**
 * Arc-length parameterization and perpendicular offset calculations
 * for map polylines based on cumulative Haversine distances (PRD §22.1).
 */

const EARTH_RADIUS_METERS = 6371008.8;

export interface PointAlongArc {
  point: [number, number]; // [lng, lat]
  angleDeg: number;
  perpendicularOffsetPx: [number, number]; // [dx, dy]
}

/**
 * Computes great-circle distance between two coordinates in meters using Haversine formula.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Finds the coordinate at a given percentage ratio (0.0 to 1.0) along a polyline's
 * cumulative Haversine distance, and computes the perpendicular offset vector.
 */
export function getPointAtArcLength(
  coordinates: [number, number][],
  ratio: number,
  offsetPxMagnitude: number = 14,
  offsetSide: 'left' | 'right' = 'left',
): PointAlongArc | null {
  if (!coordinates || coordinates.length === 0) return null;
  if (coordinates.length === 1) {
    return {
      point: coordinates[0]!,
      angleDeg: 0,
      perpendicularOffsetPx: [0, -offsetPxMagnitude],
    };
  }

  // 1. Calculate cumulative distances along coordinates
  const cumDists: number[] = [0];
  let totalMeters = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i]!;
    const p2 = coordinates[i + 1]!;
    const segDist = haversineMeters(p1[1], p1[0], p2[1], p2[0]);
    totalMeters += segDist;
    cumDists.push(totalMeters);
  }

  if (totalMeters === 0) {
    return {
      point: coordinates[0]!,
      angleDeg: 0,
      perpendicularOffsetPx: [0, -offsetPxMagnitude],
    };
  }

  // 2. Locate target distance along polyline
  const targetDist = Math.max(0, Math.min(totalMeters, ratio * totalMeters));
  for (let i = 0; i < cumDists.length - 1; i++) {
    const d0 = cumDists[i]!;
    const d1 = cumDists[i + 1]!;
    if (targetDist >= d0 && targetDist <= d1) {
      const segLen = d1 - d0;
      const t = segLen > 0 ? (targetDist - d0) / segLen : 0;
      const p1 = coordinates[i]!;
      const p2 = coordinates[i + 1]!;

      const lng = p1[0] + t * (p2[0] - p1[0]);
      const lat = p1[1] + t * (p2[1] - p1[1]);

      // Direction vector in geographic coords
      const dlng = p2[0] - p1[0];
      const dlat = p2[1] - p1[1];
      const angleRad = Math.atan2(dlat, dlng);
      const angleDeg = (angleRad * 180) / Math.PI;

      // Normal vector rotated 90 degrees
      const sign = offsetSide === 'left' ? -1 : 1;
      const dx = sign * offsetPxMagnitude * -Math.sin(angleRad);
      const dy = sign * offsetPxMagnitude * Math.cos(angleRad);

      return {
        point: [lng, lat],
        angleDeg,
        perpendicularOffsetPx: [Math.round(dx), Math.round(dy)],
      };
    }
  }

  const last = coordinates[coordinates.length - 1]!;
  return {
    point: last,
    angleDeg: 0,
    perpendicularOffsetPx: [0, -offsetPxMagnitude],
  };
}
