/**
 * Periodic timetable departure calculator.
 * PRD Section 6.8, 7.6.
 */

/**
 * Calculates the first departure on or after t on a periodic timetable grid,
 * or null if past lastDeparture.
 *
 * @param t Requested arrival time at the stop (minutes since midnight)
 * @param firstDeparture First departure of the service on the grid
 * @param headway Frequency in minutes between departures
 * @param lastDeparture Optional end of service departure
 * @returns Departure time in minutes since midnight, or null if after lastDeparture
 */
export function nextDeparture(
  t: number,
  firstDeparture: number,
  headway: number,
  lastDeparture?: number,
): number | null {
  if (headway <= 0) {
    throw new Error(`Headway must be positive, got ${headway}`);
  }

  let departure: number;
  if (t <= firstDeparture) {
    departure = firstDeparture;
  } else {
    const elapsed = t - firstDeparture;
    const k = Math.ceil(elapsed / headway);
    departure = firstDeparture + k * headway;
  }

  if (lastDeparture !== undefined && departure > lastDeparture) {
    return null;
  }

  return departure;
}
