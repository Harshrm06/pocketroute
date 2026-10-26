import { describe, expect, it } from 'vitest';
import {
  autoFareINR,
  busFareINR,
  computeBusFare,
  checkDailyPassTip,
  cabFareINR,
  fareTablesSchema,
  getDefaultFares,
  loadFares,
  loadFaresFromFile,
  metroFareINR,
  roundHalfUp,
  walkFareINR,
} from './index.js';

describe('Pricing Module', () => {
  describe('roundHalfUp (PRD Sections 6.4, 6.5)', () => {
    it('rounds 2.5 up to 3', () => {
      expect(roundHalfUp(2.5)).toBe(3);
    });

    it('rounds 2.4999 down to 2', () => {
      expect(roundHalfUp(2.4999)).toBe(2);
    });

    it('rounds 0 to 0', () => {
      expect(roundHalfUp(0)).toBe(0);
    });

    it('rounds 0.5 up to 1', () => {
      expect(roundHalfUp(0.5)).toBe(1);
    });

    it('rounds 0.499 down to 0', () => {
      expect(roundHalfUp(0.499)).toBe(0);
    });

    it('handles negative half values toward +infinity', () => {
      expect(roundHalfUp(-2.5)).toBe(-2);
      expect(roundHalfUp(-2.51)).toBe(-3);
    });
  });

  describe('Typed loader & fares.json schema validation', () => {
    it("loads data/pune/fares.json with effectiveFrom '2026-10-01'", () => {
      const fares = getDefaultFares();
      expect(fares.effectiveFrom).toBe('2026-10-01');
      expect(fares.metro.slabs.length).toBeGreaterThan(0);
      expect(fares.bus.slabs.length).toBeGreaterThan(0);
      expect(fares.auto.baseFareINR).toBe(25);
      expect(fares.cab.baseFareINR).toBe(45);
      expect(fares.walk.fareINR).toBe(0);
    });

    it('loads fares directly from file with typed loader', () => {
      const fares = loadFaresFromFile();
      expect(fares.effectiveFrom).toBe('2026-10-01');
    });

    it('validates a correct fare tables structure', () => {
      const valid = {
        effectiveFrom: '2026-10-01',
        metro: { slabs: [{ maxDistanceKm: 2, fareINR: 10 }] },
        bus: { slabs: [{ maxDistanceKm: 3, fareINR: 5 }] },
        auto: {
          baseFareINR: 25,
          baseDistanceKm: 1.5,
          perKmRateINR: 17,
          nightSurchargeMultiplier: 1.25,
          nightWindow: { startHour: 0, endHour: 5 },
        },
        cab: {
          baseFareINR: 45,
          perKmRateINR: 14,
          perMinuteRateINR: 1.5,
          surgeMultiplier: 1.3,
        },
        walk: { fareINR: 0 as const },
      };
      expect(() => loadFares(valid)).not.toThrow();
      expect(fareTablesSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects invalid fare tables JSON (missing effectiveFrom or negative fares)', () => {
      expect(() =>
        loadFares({
          metro: { slabs: [] },
        }),
      ).toThrow();

      expect(() =>
        loadFares({
          effectiveFrom: 'invalid-date',
          metro: { slabs: [{ maxDistanceKm: 2, fareINR: -10 }] },
        }),
      ).toThrow();
    });
  });

  describe('metroFareINR (PRD Sections 6.2 and 17.1)', () => {
    it('returns 10 for distance 0', () => {
      expect(metroFareINR(0)).toBe(10);
    });

    it('tests boundary values: 2.0, 2.01, 4.0, 18.0, 18.01', () => {
      // Slab 1: d <= 2 -> 10
      expect(metroFareINR(2.0)).toBe(10);

      // Slab 2: 2 < d <= 4 -> 15
      expect(metroFareINR(2.01)).toBe(15);
      expect(metroFareINR(4.0)).toBe(15);

      // Slab 3: 4 < d <= 8 -> 20
      expect(metroFareINR(4.01)).toBe(20);
      expect(metroFareINR(8.0)).toBe(20);

      // Slab 4: 8 < d <= 12 -> 25
      expect(metroFareINR(12.0)).toBe(25);

      // Slab 5: 12 < d <= 18 -> 30
      expect(metroFareINR(18.0)).toBe(30);

      // Slab 6: d > 18 -> 35
      expect(metroFareINR(18.01)).toBe(35);
      expect(metroFareINR(25.0)).toBe(35);
    });

    it('throws on negative distance', () => {
      expect(() => metroFareINR(-1)).toThrow();
    });
  });

  describe('busFareINR and computeBusFare (PRD v1.2.0, Sections 6.3 & 23)', () => {
    it('returns 10 for distance 0 (any boarding costs at least ₹10)', () => {
      expect(busFareINR(0)).toBe(10);
      expect(computeBusFare(0)).toBe(10);
    });

    it('tests boundary values: 0, 3, 3.01, 6, 22, 22.01, 30, 30.01', () => {
      // Slab 1: 0 < d <= 3 -> 10
      expect(computeBusFare(0)).toBe(10);
      expect(computeBusFare(2.0)).toBe(10);
      expect(computeBusFare(3.0)).toBe(10);

      // Slab 2: 3 < d <= 6 -> 15
      expect(computeBusFare(3.01)).toBe(15);
      expect(computeBusFare(4.0)).toBe(15);
      expect(computeBusFare(6.0)).toBe(15);

      // Slab 3: 6 < d <= 10 -> 20
      expect(computeBusFare(6.01)).toBe(20);
      expect(computeBusFare(10.0)).toBe(20);

      // Slab 4: 10 < d <= 15 -> 25
      expect(computeBusFare(10.01)).toBe(25);
      expect(computeBusFare(15.0)).toBe(25);

      // Slab 5: 15 < d <= 22 -> 30
      expect(computeBusFare(15.01)).toBe(30);
      expect(computeBusFare(22.0)).toBe(30);

      // Slab 6: 22 < d <= 30 -> 35
      expect(computeBusFare(22.01)).toBe(35);
      expect(computeBusFare(30.0)).toBe(35);

      // Slab 7: d > 30 -> 40
      expect(computeBusFare(30.01)).toBe(40);
      expect(computeBusFare(35.0)).toBe(40);
    });

    it('throws on negative distance', () => {
      expect(() => computeBusFare(-1)).toThrow();
    });

    it('daily tip threshold at 70 and 70.01', () => {
      expect(checkDailyPassTip(70)).toBeNull();
      expect(checkDailyPassTip(60)).toBeNull();
      expect(checkDailyPassTip(70.01)).toBe(
        'Tip: Buy ₹70 PMPML Daily Pass (price unverified)',
      );
      expect(checkDailyPassTip(85)).toBe(
        'Tip: Buy ₹70 PMPML Daily Pass (price unverified)',
      );
    });
  });

  describe('autoFareINR (PRD Sections 6.4 and 17.1)', () => {
    it('computes fare at d = 0, 1.5, 1.6, 10 km for day (non-night)', () => {
      // Non-night hour (e.g. 14:00)
      expect(autoFareINR(0, 14)).toBe(25);
      expect(autoFareINR(1.5, 14)).toBe(25);
      expect(autoFareINR(1.6, 14)).toBe(27);
      expect(autoFareINR(10, 14)).toBe(170);
    });

    it('computes fare at d = 0, 1.5, 1.6, 10 km for night (hour in [0, 5))', () => {
      // Night hour (e.g. 02:00)
      // d = 0: 25 * 1.25 = 31.25 -> 31
      expect(autoFareINR(0, 2)).toBe(31);
      // d = 1.5: 25 * 1.25 = 31.25 -> 31
      expect(autoFareINR(1.5, 2)).toBe(31);
      // d = 1.6: base 26.7 -> 27, 27 * 1.25 = 33.75 -> 34
      expect(autoFareINR(1.6, 2)).toBe(34);
      // d = 10: base 169.5 -> 170, 170 * 1.25 = 212.5 -> 213
      expect(autoFareINR(10, 2)).toBe(213);
    });

    it('checks night window boundaries: [0, 5) is night, 5 is non-night', () => {
      expect(autoFareINR(10, 0)).toBe(213); // 00:00 is night
      expect(autoFareINR(10, 4)).toBe(213); // 04:00 is night
      expect(autoFareINR(10, 5)).toBe(170); // 05:00 is day
      expect(autoFareINR(10, 23)).toBe(170); // 23:00 is day
    });

    it('throws on negative distance', () => {
      expect(() => autoFareINR(-1, 12)).toThrow();
    });
  });

  describe('cabFareINR (PRD Sections 6.5 and 17.1)', () => {
    it('computes off-peak cab fare without surge (isRushHour: false)', () => {
      // d = 0, m = 0: 45
      expect(cabFareINR(0, 0, false)).toBe(45);
      // d = 5, m = 15: 45 + 14*5 + 1.5*15 = 45 + 70 + 22.5 = 137.5 -> 138
      expect(cabFareINR(5, 15, false)).toBe(138);
    });

    it('computes peak cab fare with 1.3x surge applied before rounding (isRushHour: true)', () => {
      // d = 0, m = 0: 45 * 1.3 = 58.5 -> 59
      expect(cabFareINR(0, 0, true)).toBe(59);
      // d = 5, m = 15: 137.5 * 1.3 = 178.75 -> 179
      expect(cabFareINR(5, 15, true)).toBe(179);
    });

    it('throws on negative distance or duration', () => {
      expect(() => cabFareINR(-1, 10, false)).toThrow();
      expect(() => cabFareINR(5, -1, false)).toThrow();
    });
  });

  describe('walkFareINR (PRD Section 6.1)', () => {
    it('always returns 0', () => {
      expect(walkFareINR()).toBe(0);
    });
  });
});
