/**
 * Round half up: if the fractional part is >= 0.5, round toward +infinity.
 * PRD Section 6.4, 6.5.
 * Examples: 2.5 -> 3, 2.4999 -> 2.
 */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}
