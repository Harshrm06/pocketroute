import type { FareTables } from '@pocketroute/shared';
import { getDefaultFares } from './loader.js';

/**
 * Computes Metro fare in INR for continuous ride distance d (km) on one line.
 * PRD Section 6.2:
 * Half-open intervals (lo, hi]. Distance 0 returns 10.
 */
export function metroFareINR(
  distanceKm: number,
  fareTable?: FareTables,
): number {
  if (distanceKm < 0) {
    throw new Error(`Distance must be non-negative, got ${distanceKm}`);
  }

  const table = fareTable ?? getDefaultFares();
  const slabs = table.metro.slabs;

  for (const slab of slabs) {
    if (slab.maxDistanceKm === null || distanceKm <= slab.maxDistanceKm) {
      return slab.fareINR;
    }
  }

  const lastSlab = slabs[slabs.length - 1];
  return lastSlab ? lastSlab.fareINR : 35;
}
