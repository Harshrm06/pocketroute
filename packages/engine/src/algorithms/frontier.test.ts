import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ParetoFrontier, type Label } from './frontier.js';

describe('ParetoFrontier', () => {
  it('correctly handles basic dominance and insertions', () => {
    const frontier = new ParetoFrontier();

    const l1: Label = { t: 50, c: 10, state: 'A|WALK', removed: false };
    const l2: Label = { t: 30, c: 20, state: 'A|WALK', removed: false };
    const l3: Label = { t: 20, c: 30, state: 'A|WALK', removed: false };

    expect(frontier.add(l1)).toBe(true);
    expect(frontier.add(l2)).toBe(true);
    expect(frontier.add(l3)).toBe(true);
    expect(frontier.size).toBe(3);

    // Dominated point: higher time, higher cost
    expect(frontier.dominated(35, 25)).toBe(true);
    const lDominated: Label = { t: 35, c: 25, state: 'A|WALK', removed: false };
    expect(frontier.add(lDominated)).toBe(false);
    expect(frontier.size).toBe(3);

    // Non-dominated point: better time (25) than l2 (30) with lower cost (25) than l3 (30)
    expect(frontier.dominated(25, 25)).toBe(false);
    const lNew: Label = { t: 25, c: 25, state: 'A|WALK', removed: false };
    expect(frontier.add(lNew)).toBe(true);
    expect(frontier.size).toBe(4);

    // Strongly dominating point: replaces several existing labels
    const lSuper: Label = { t: 15, c: 15, state: 'A|WALK', removed: false };
    expect(frontier.add(lSuper)).toBe(true);

    // l2, lNew, l3 should have been removed because lSuper has t=15 <= their times and c=15 <= their costs
    expect(l2.removed).toBe(true);
    expect(lNew.removed).toBe(true);
    expect(l3.removed).toBe(true);
    expect(l1.removed).toBe(false);
    expect(frontier.size).toBe(2); // l1 (50, 10) and lSuper (15, 15)
  });

  it('Frontier invariant holds after random insertions (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            t: fc.integer({ min: 1, max: 1000 }),
            c: fc.integer({ min: 0, max: 300 }),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (points) => {
          const frontier = new ParetoFrontier();

          for (const pt of points) {
            const label: Label = {
              t: pt.t,
              c: pt.c,
              state: 'N|TEST',
              removed: false,
            };
            frontier.add(label);
            frontier.assertInvariant();
          }

          // Verify invariant explicitly on toArray()
          const arr = frontier.toArray();
          for (let i = 0; i < arr.length - 1; i++) {
            expect(arr[i]!.c).toBeLessThan(arr[i + 1]!.c);
            expect(arr[i]!.t).toBeGreaterThan(arr[i + 1]!.t);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
