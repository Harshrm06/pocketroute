import type { LatLng } from '@pocketroute/shared';

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Computes the great-circle distance between two points in kilometers
 * using the Haversine formula.
 */
export function haversineKm(from: LatLng, to: LatLng): number {
  const lat1Rad = (from.lat * Math.PI) / 180;
  const lat2Rad = (to.lat * Math.PI) / 180;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Road distance estimate (km) = haversine * 1.25.
 * PRD Section 6.6.
 */
export function roadEstimateKm(from: LatLng, to: LatLng): number {
  return haversineKm(from, to) * 1.25;
}

/**
 * Computes the total length in meters of a sequence of [lng, lat] coordinates.
 */
export function coordinatesLengthMeters(coords: [number, number][]): number {
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    totalKm += haversineKm({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
  }
  return totalKm * 1000;
}
