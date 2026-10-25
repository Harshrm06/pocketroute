import type { FareTables } from '@pocketroute/shared';
import { getDefaultFares } from './loader.js';

/**
 * Computes PMPML Bus fare in INR for continuous ride distance d (km) on one bus route.
 * PRD Section 6.3:
 * Slabs with half-open intervals (lo, hi].
 */
export function busFareINR(distanceKm: number, fareTable?: FareTables): number {
  if (distanceKm < 0) {
    throw new Error(`Distance must be non-negative, got ${distanceKm}`);
  }

  const table = fareTable ?? getDefaultFares();
  const slabs = table.bus.slabs;

  for (const slab of slabs) {
    if (slab.maxDistanceKm === null || distanceKm <= slab.maxDistanceKm) {
      return slab.fareINR;
    }
  }

  const lastSlab = slabs[slabs.length - 1];
  return lastSlab ? lastSlab.fareINR : 30;
}
