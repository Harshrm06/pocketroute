import {
  METRO_HEADWAY_OFF_PEAK_MIN,
  METRO_HEADWAY_PEAK_MIN,
} from '@pocketroute/shared';
import { nextDeparture } from './departure.js';

export const METRO_OPERATING_START_MIN = 360; // 06:00
export const METRO_OPERATING_END_MIN = 1320; // 22:00

/**
 * Calculates the next metro departure time at or after t for a metro line.
 * PRD Section 6.1, 6.7, 6.8:
 * - Operating window: 06:00 (360) to 22:00 (1320)
 * - Peak headway: 6 min (08:00-11:00 and 17:00-20:30)
 * - Off-peak headway: 10 min
 * - Returns null when outside operating hours (e.g. 05:59 or after 22:00)
 */
export function metroNextTrain(t: number, lineId?: string): number | null {
  void lineId;
  const dayOffset = Math.floor(t / 1440) * 1440;
  const tod = t - dayOffset;

  if (tod < METRO_OPERATING_START_MIN || tod > METRO_OPERATING_END_MIN) {
    return null;
  }

  // Window 1: 06:00 to 08:00 (360 to 480) - off-peak (10 min)
  if (tod <= 480) {
    const dep = nextDeparture(tod, 360, METRO_HEADWAY_OFF_PEAK_MIN, 480);
    return dep !== null ? dayOffset + dep : null;
  }

  // Window 2: 08:00 to 11:00 (480 to 660) - peak (6 min)
  if (tod <= 660) {
    const dep = nextDeparture(tod, 480, METRO_HEADWAY_PEAK_MIN, 660);
    return dep !== null ? dayOffset + dep : null;
  }

  // Window 3: 11:00 to 17:00 (660 to 1020) - off-peak (10 min)
  if (tod <= 1020) {
    const dep = nextDeparture(tod, 660, METRO_HEADWAY_OFF_PEAK_MIN, 1020);
    return dep !== null ? dayOffset + dep : null;
  }

  // Window 4: 17:00 to 20:30 (1020 to 1230) - peak (6 min)
  if (tod <= 1230) {
    const dep = nextDeparture(tod, 1020, METRO_HEADWAY_PEAK_MIN, 1230);
    return dep !== null ? dayOffset + dep : null;
  }

  // Window 5: 20:30 to 22:00 (1230 to 1320) - off-peak (10 min)
  const dep = nextDeparture(tod, 1230, METRO_HEADWAY_OFF_PEAK_MIN, 1320);
  return dep !== null ? dayOffset + dep : null;
}
