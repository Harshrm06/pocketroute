/**
 * Time conversion, formatting, and time-of-day window helpers for PocketRoute.
 * PRD Section 6.7, 9.1.
 */

export type RushWindow = 'peak' | 'mid' | 'off-peak' | 'night';

/**
 * Normalizes minutes since midnight to [0, 1440) for single-day time-of-day analysis.
 */
export function timeOfDayMinutes(t: number): number {
  return ((Math.floor(t) % 1440) + 1440) % 1440;
}

/**
 * Parses "HH:mm" or "H:mm" into minutes since midnight IST.
 */
export function parseHHmm(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) {
    throw new Error(`Invalid time format: "${hhmm}". Expected HH:mm.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(
      `Invalid time values: "${hhmm}". Hours must be 0-23, minutes 0-59.`,
    );
  }

  return hours * 60 + minutes;
}

/**
 * Formats minutes since midnight into 12-hour format with AM/PM (e.g. "5:30 PM", "12:00 AM").
 */
export function formatHHmm(t: number): string {
  const tod = timeOfDayMinutes(t);
  const h24 = Math.floor(tod / 60);
  const m = Math.floor(tod % 60);

  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mStr = m.toString().padStart(2, '0');

  return `${h12}:${mStr} ${period}`;
}

/**
 * Formats minutes since midnight into 24-hour HH:mm format (e.g. "17:30", "08:00").
 */
export function formatHHmm24(t: number): string {
  const tod = timeOfDayMinutes(t);
  const h24 = Math.floor(tod / 60);
  const m = Math.floor(tod % 60);

  const hStr = h24.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');

  return `${hStr}:${mStr}`;
}

/**
 * Determines the active time-of-day window (IST):
 * - Night: 00:00 to 05:00
 * - Peak: 08:00 to 11:00 and 17:00 to 20:30
 * - Mid: 11:00 to 17:00
 * - Off-peak: 05:00 to 08:00 and 20:30 to 24:00
 */
export function rushWindow(t: number): RushWindow {
  const tod = timeOfDayMinutes(t);

  // Night: 00:00 to 05:00 (0 to 300 min)
  if (tod >= 0 && tod < 300) {
    return 'night';
  }

  // Morning peak: 08:00 to 11:00 (480 to 660 min)
  // Evening peak: 17:00 to 20:30 (1020 to 1230 min)
  if ((tod >= 480 && tod < 660) || (tod >= 1020 && tod < 1230)) {
    return 'peak';
  }

  // Mid: 11:00 to 17:00 (660 to 1020 min)
  if (tod >= 660 && tod < 1020) {
    return 'mid';
  }

  return 'off-peak';
}

/**
 * Returns true if the time is within morning or evening peak windows.
 */
export function isPeak(t: number): boolean {
  return rushWindow(t) === 'peak';
}

/**
 * Returns true if the time is within the night surcharge window (00:00 to 05:00).
 */
export function isNight(t: number): boolean {
  return rushWindow(t) === 'night';
}
