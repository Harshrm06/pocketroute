import type { FareTables } from '@pocketroute/shared';
import { getDefaultFares } from './loader.js';

/**
 * Computes Walking fare in INR.
 * PRD Section 6.1:
 * Walking is always free (₹0).
 */
export function walkFareINR(fareTable?: FareTables): 0 {
  const table = fareTable ?? getDefaultFares();
  return table.walk.fareINR;
}
