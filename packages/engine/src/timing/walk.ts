import { WALK_SPEED_M_PER_MIN } from '@pocketroute/shared';

/**
 * Calculates walking duration in minutes for a given distance in meters.
 * PRD Section 6.6:
 * Speed: 80 m/min. Walk time (min) = distanceM / 80.
 * Example: 1200 m (1.2 km) = 15 minutes.
 */
export function walkMinutes(distanceM: number): number {
  if (distanceM < 0) {
    throw new Error(`Distance must be non-negative, got ${distanceM}`);
  }
  return distanceM / WALK_SPEED_M_PER_MIN;
}
