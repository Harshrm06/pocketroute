import {
  BUS_SPEED_MID_KM_PER_H,
  BUS_SPEED_OFF_PEAK_KM_PER_H,
  BUS_SPEED_PEAK_KM_PER_H,
} from '@pocketroute/shared';
import { isPeak, rushWindow } from './helpers.js';

export interface BusRouteTiming {
  peakHeadway?: number;
  offPeakHeadway?: number;
  peakHeadwayMin?: number;
  offPeakHeadwayMin?: number;
}

/**
 * Returns the scheduled bus headway in minutes at time t for the given corridor route.
 * PRD Section 6.1, 6.7, 6.8.
 */
export function busHeadwayAt(t: number, route: BusRouteTiming): number {
  if (isPeak(t)) {
    return route.peakHeadway ?? route.peakHeadwayMin ?? 10;
  }
  return route.offPeakHeadway ?? route.offPeakHeadwayMin ?? 15;
}

/**
 * Returns the estimated bus operating speed in km/h at time t.
 * PRD Section 6.7:
 * - Peak: 18 km/h
 * - Mid (11:00 - 17:00): 20 km/h
 * - Off-peak / Night: 22 km/h
 */
export function busSpeedAt(t: number): number {
  const window = rushWindow(t);
  switch (window) {
    case 'peak':
      return BUS_SPEED_PEAK_KM_PER_H;
    case 'mid':
      return BUS_SPEED_MID_KM_PER_H;
    case 'off-peak':
    case 'night':
      return BUS_SPEED_OFF_PEAK_KM_PER_H;
  }
}
