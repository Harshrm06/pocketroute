/**
 * Converts a GeoJSON [lng, lat] coordinate to approximate local Cartesian (X, Y) in meters,
 * using an equirectangular projection centered around Pune (~18.52° N).
 */
function toMeters(coord: [number, number]): [number, number] {
  const [lng, lat] = coord;
  const latRad = (18.52 * Math.PI) / 180;
  const x = lng * 111320 * Math.cos(latRad);
  const y = lat * 110540;
  return [x, y];
}

/**
 * Calculates perpendicular distance in meters from point P to segment AB.
 */
function perpendicularDistanceMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const [px, py] = toMeters(p);
  const [ax, ay] = toMeters(a);
  const [bx, by] = toMeters(b);

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-6) {
    return Math.hypot(px - ax, py - ay);
  }

  // Perpendicular distance to the line passing through A and B
  return Math.abs(dx * (ay - py) - (ax - px) * dy) / Math.sqrt(lenSq);
}

/**
 * Simplifies a polyline of [lng, lat] coordinates using the Ramer-Douglas-Peucker algorithm.
 *
 * @param coordinates Array of [lng, lat] coordinates
 * @param toleranceMeters Maximum allowable perpendicular distance deviation in meters (default: 2m)
 * @returns Simplified array of [lng, lat] coordinates
 */
export function douglasPeucker(
  coordinates: [number, number][],
  toleranceMeters = 2,
): [number, number][] {
  if (coordinates.length <= 2) {
    return [...coordinates];
  }

  let maxDist = 0;
  let maxIndex = 0;
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;

  for (let i = 1; i < coordinates.length - 1; i++) {
    const dist = perpendicularDistanceMeters(coordinates[i]!, first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeucker(
      coordinates.slice(0, maxIndex + 1),
      toleranceMeters,
    );
    const right = douglasPeucker(coordinates.slice(maxIndex), toleranceMeters);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}
