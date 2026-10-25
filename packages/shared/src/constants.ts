/**
 * Transit, algorithm, geography, and UI constants for PocketRoute.
 * Source of truth: PRD.md Sections 6, 8.1, 9, 14.2.
 */

// Budget bounds (Section 8.1, 9.1)
export const MIN_BUDGET = 10;
export const MAX_BUDGET = 300;

// Walking parameters (Section 6.1, 6.6)
export const WALK_SPEED_M_PER_MIN = 80; // 4.8 km/h
export const MAX_WALK_LEG_M = 1200; // 1.2 km per leg
export const FALLBACK_MAX_WALK_LEG_M = 2000; // 2.0 km fallback if no candidates exist

// Operational penalties & pickup times (Section 6.1, 6.4, 6.5)
export const MIN_TRANSFER_MIN = 1;
export const METRO_BOARDING_PENALTY_MIN = 3;
export const AUTO_PICKUP_MIN = 2.5;
export const CAB_PICKUP_MIN = 4.5;

// Speeds from Section 6.1 (km/h)
export const WALK_SPEED_KM_PER_H = 4.8;
export const METRO_SPEED_KM_PER_H = 34;
export const BUS_SPEED_PEAK_KM_PER_H = 18;
export const BUS_SPEED_MID_KM_PER_H = 20;
export const BUS_SPEED_OFF_PEAK_KM_PER_H = 22;
export const AUTO_SPEED_KM_PER_H = 26; // Midpoint of 24-28 km/h
export const CAB_SPEED_KM_PER_H = 29; // Midpoint of 26-32 km/h

export const SPEEDS = {
  WALK: { mPerMin: WALK_SPEED_M_PER_MIN, kmPerH: WALK_SPEED_KM_PER_H },
  METRO: { kmPerH: METRO_SPEED_KM_PER_H },
  BUS: {
    peakKmPerH: BUS_SPEED_PEAK_KM_PER_H,
    midKmPerH: BUS_SPEED_MID_KM_PER_H,
    offPeakKmPerH: BUS_SPEED_OFF_PEAK_KM_PER_H,
  },
  AUTO: { kmPerH: AUTO_SPEED_KM_PER_H },
  CAB: { kmPerH: CAB_SPEED_KM_PER_H },
} as const;

// Headways (Section 6.1, 6.7)
export const METRO_HEADWAY_PEAK_MIN = 6;
export const METRO_HEADWAY_OFF_PEAK_MIN = 10;

// Surge & surcharge multipliers (Section 6.4, 6.5, 6.7)
export const CAB_SURGE_PEAK = 1.3;
export const AUTO_NIGHT_SURCHARGE = 1.25;

// Time-of-day windows (Section 6.7) in Asia/Kolkata (IST)
export const PEAK_WINDOWS = [
  { start: '08:00', end: '11:00' },
  { start: '17:00', end: '20:30' },
] as const;

export const MID_WINDOW = { start: '11:00', end: '17:00' } as const;

export const NIGHT_WINDOW = { start: '00:00', end: '05:00' } as const;

// Pune Bounding Box (Section 9.1)
export const PUNE_BOUNDING_BOX = {
  minLat: 18.4,
  maxLat: 18.7,
  minLng: 73.7,
  maxLng: 74.0,
} as const;

// UI Color tokens (Section 14.2)
export const COLOR_TOKENS = {
  canvas: '#EEF2F7',
  surface: 'rgba(255, 255, 255, 0.84)',
  surfaceSolid: '#FFFFFF',
  ink: '#0F172A',
  inkMuted: '#475569',
  border: 'rgba(15, 23, 42, 0.10)',
  primary: '#0F172A',
  focus: '#2563EB',
  success: '#047857',
  warning: '#B45309',
  metroPurple: '#7C3AED',
  metroAqua: '#0891B2',
  bus: '#059669',
  auto: '#D97706',
  cab: '#4F46E5',
  walk: '#0284C7',
} as const;
