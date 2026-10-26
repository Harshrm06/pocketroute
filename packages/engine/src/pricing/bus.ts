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
  return lastSlab ? lastSlab.fareINR : 40;
}

/**
 * Alias for busFareINR matching PRD v1.2.0 naming.
 */
export const computeBusFare = busFareINR;

/**
 * Checks whether cumulative bus fare exceeds the daily pass threshold (PRD §23, v1.2.0).
 * Threshold = 70 INR. At 70 -> null; at >70 -> Tip message.
 */
export function checkDailyPassTip(
  cumulativeBusFareINR: number,
  thresholdINR = 70,
): string | null {
  if (cumulativeBusFareINR > thresholdINR) {
    return 'Tip: Buy ₹70 PMPML Daily Pass (price unverified)';
  }
  return null;
}
