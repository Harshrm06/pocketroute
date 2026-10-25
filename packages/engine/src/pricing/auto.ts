import type { FareTables } from '@pocketroute/shared';
import { getDefaultFares } from './loader.js';
import { roundHalfUp } from './round.js';

/**
 * Computes Auto-rickshaw fare in INR.
 * PRD Section 6.4:
 * base = 25 + 17 * max(0, d - 1.5)
 * fare = round_half_up(base)
 * if local_hour in [0, 5): fare = round_half_up(fare * 1.25)
 */
export function autoFareINR(
  distanceKm: number,
  localHourIST: number,
  fareTable?: FareTables,
): number {
  if (distanceKm < 0) {
    throw new Error(`Distance must be non-negative, got ${distanceKm}`);
  }

  const table = fareTable ?? getDefaultFares();
  const config = table.auto;

  const extraDistance = Math.max(0, distanceKm - config.baseDistanceKm);
  const base = config.baseFareINR + config.perKmRateINR * extraDistance;
  let fare = roundHalfUp(base);

  const isNight =
    localHourIST >= config.nightWindow.startHour &&
    localHourIST < config.nightWindow.endHour;

  if (isNight) {
    fare = roundHalfUp(fare * config.nightSurchargeMultiplier);
  }

  return fare;
}
