import type { FareTables } from '@pocketroute/shared';
import { getDefaultFares } from './loader.js';
import { roundHalfUp } from './round.js';

/**
 * Computes Cab fare in INR.
 * PRD Section 6.5:
 * raw = (45 + 14 * d + 1.5 * m) * S
 * fare = round_half_up(raw)
 * S = 1.3 if isRushHour, else 1.0
 */
export function cabFareINR(
  distanceKm: number,
  durationMin: number,
  isRushHour: boolean,
  fareTable?: FareTables,
): number {
  if (distanceKm < 0) {
    throw new Error(`Distance must be non-negative, got ${distanceKm}`);
  }
  if (durationMin < 0) {
    throw new Error(`Duration must be non-negative, got ${durationMin}`);
  }

  const table = fareTable ?? getDefaultFares();
  const config = table.cab;

  const s = isRushHour ? config.surgeMultiplier : 1.0;
  const raw =
    (config.baseFareINR +
      config.perKmRateINR * distanceKm +
      config.perMinuteRateINR * durationMin) *
    s;

  return roundHalfUp(raw);
}
