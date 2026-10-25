import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AUTO_PICKUP_MIN,
  CAB_PICKUP_MIN,
  busHeadwayAt,
  busSpeedAt,
  formatHHmm,
  formatHHmm24,
  isNight,
  isPeak,
  metroNextTrain,
  nextDeparture,
  parseHHmm,
  rushWindow,
  walkMinutes,
} from './index.js';

describe('Timing Module', () => {
  describe('parseHHmm and formatHHmm (PRD Section 9.1)', () => {
    it('parses valid HH:mm into minutes since midnight', () => {
      expect(parseHHmm('00:00')).toBe(0);
      expect(parseHHmm('05:59')).toBe(359);
      expect(parseHHmm('06:00')).toBe(360);
      expect(parseHHmm('11:00')).toBe(660);
      expect(parseHHmm('17:30')).toBe(1050);
      expect(parseHHmm('22:00')).toBe(1320);
      expect(parseHHmm('23:59')).toBe(1439);
    });

    it('throws error for invalid HH:mm formats', () => {
      expect(() => parseHHmm('24:00')).toThrow();
      expect(() => parseHHmm('12:60')).toThrow();
      expect(() => parseHHmm('invalid')).toThrow();
    });

    it('formats minutes into 12-hour AM/PM string', () => {
      expect(formatHHmm(0)).toBe('12:00 AM');
      expect(formatHHmm(360)).toBe('6:00 AM');
      expect(formatHHmm(660)).toBe('11:00 AM');
      expect(formatHHmm(720)).toBe('12:00 PM');
      expect(formatHHmm(1050)).toBe('5:30 PM');
      expect(formatHHmm(1439)).toBe('11:59 PM');
    });

    it('handles next-day wraparound times correctly in formatHHmm', () => {
      // 1500 min = 25:00 = 01:00 AM next day
      expect(formatHHmm(1500)).toBe('1:00 AM');
    });

    it('formats 24-hour time in formatHHmm24', () => {
      expect(formatHHmm24(1050)).toBe('17:30');
      expect(formatHHmm24(360)).toBe('06:00');
    });
  });

  describe('Time-of-day windows (PRD Section 6.7)', () => {
    it('identifies night window: 00:00 to 05:00', () => {
      expect(isNight(0)).toBe(true);
      expect(isNight(299)).toBe(true);
      expect(isNight(300)).toBe(false); // 05:00 is off-peak
      expect(rushWindow(150)).toBe('night');
    });

    it('identifies morning and evening peak windows', () => {
      // Morning peak: 08:00 to 11:00 (480 to 660)
      expect(isPeak(480)).toBe(true);
      expect(isPeak(659)).toBe(true);
      expect(isPeak(660)).toBe(false); // 11:00 is mid

      // Evening peak: 17:00 to 20:30 (1020 to 1230)
      expect(isPeak(1020)).toBe(true);
      expect(isPeak(1229)).toBe(true);
      expect(isPeak(1230)).toBe(false); // 20:30 is off-peak
    });

    it('identifies mid window (11:00 to 17:00)', () => {
      expect(rushWindow(660)).toBe('mid'); // 11:00
      expect(rushWindow(800)).toBe('mid');
      expect(rushWindow(1019)).toBe('mid');
      expect(rushWindow(1020)).toBe('peak'); // 17:00
    });

    it('identifies off-peak windows (05:00-08:00 and 20:30-24:00)', () => {
      expect(rushWindow(300)).toBe('off-peak'); // 05:00
      expect(rushWindow(479)).toBe('off-peak');
      expect(rushWindow(1230)).toBe('off-peak'); // 20:30
      expect(rushWindow(1400)).toBe('off-peak');
    });
  });

  describe('nextDeparture (PRD Section 6.8, 7.6)', () => {
    const first = 360; // 06:00
    const headway = 10;
    const last = 1320; // 22:00

    it('returns firstDeparture when t <= firstDeparture', () => {
      expect(nextDeparture(300, first, headway, last)).toBe(360);
      expect(nextDeparture(360, first, headway, last)).toBe(360);
    });

    it('returns the same time when t lands exactly on a grid point', () => {
      expect(nextDeparture(360, first, headway, last)).toBe(360);
      expect(nextDeparture(370, first, headway, last)).toBe(370);
      expect(nextDeparture(480, first, headway, last)).toBe(480);
      expect(nextDeparture(1320, first, headway, last)).toBe(1320);
    });

    it('returns the next grid departure when between intervals', () => {
      expect(nextDeparture(361, first, headway, last)).toBe(370);
      expect(nextDeparture(369, first, headway, last)).toBe(370);
      expect(nextDeparture(371, first, headway, last)).toBe(380);
    });

    it('returns null when past lastDeparture', () => {
      expect(nextDeparture(1321, first, headway, last)).toBeNull();
      expect(nextDeparture(1400, first, headway, last)).toBeNull();
    });
  });

  describe('metroNextTrain (PRD Section 6.1, 6.7, 6.8, 17.1)', () => {
    it('returns null for 05:59 (before operating hours)', () => {
      expect(metroNextTrain(359)).toBeNull();
    });

    it('returns 06:00 for first train departure', () => {
      expect(metroNextTrain(360)).toBe(360);
    });

    it('returns exact same time when landing on grid', () => {
      expect(metroNextTrain(360)).toBe(360);
      expect(metroNextTrain(370)).toBe(370);
      expect(metroNextTrain(480)).toBe(480);
      expect(metroNextTrain(486)).toBe(486);
      expect(metroNextTrain(660)).toBe(660);
      expect(metroNextTrain(1320)).toBe(1320);
    });

    it('respects peak boundary at 11:00 (switch from 6-min to 10-min headway)', () => {
      // At 10:54 (654): exact peak train
      expect(metroNextTrain(654)).toBe(654);
      // At 10:55 (655): next train is 11:00 (660)
      expect(metroNextTrain(655)).toBe(660);
      // At 11:00 (660): train departs at 11:00
      expect(metroNextTrain(660)).toBe(660);
      // At 11:01 (661): next train under 10-min off-peak headway is 11:10 (670)
      expect(metroNextTrain(661)).toBe(670);
    });

    it('returns null after 22:00 (closing time)', () => {
      expect(metroNextTrain(1320)).toBe(1320);
      expect(metroNextTrain(1321)).toBeNull();
      expect(metroNextTrain(1400)).toBeNull();
    });

    it('supports next-day wraparound (e.g. 1800 is 06:00 next day)', () => {
      expect(metroNextTrain(1440 + 359)).toBeNull(); // 05:59 next day
      expect(metroNextTrain(1440 + 360)).toBe(1800); // 06:00 next day
    });
  });

  describe('Bus timing: headway and speed (PRD Section 6.1, 6.7)', () => {
    const route = {
      peakHeadway: 8,
      offPeakHeadway: 12,
    };

    it('returns peak headway during peak hours', () => {
      expect(busHeadwayAt(480, route)).toBe(8); // 08:00 peak
      expect(busHeadwayAt(1050, route)).toBe(8); // 17:30 peak
    });

    it('returns off-peak headway during off-peak hours', () => {
      expect(busHeadwayAt(400, route)).toBe(12); // 06:40
      expect(busHeadwayAt(700, route)).toBe(12); // 11:40 (mid)
      expect(busHeadwayAt(1300, route)).toBe(12); // 21:40
    });

    it('returns bus operating speed per PRD Section 6.7', () => {
      expect(busSpeedAt(500)).toBe(18); // peak: 18 km/h
      expect(busSpeedAt(700)).toBe(20); // mid (11:00-17:00): 20 km/h
      expect(busSpeedAt(400)).toBe(22); // off-peak: 22 km/h
      expect(busSpeedAt(100)).toBe(22); // night: 22 km/h
    });
  });

  describe('walkMinutes (PRD Section 6.6, 17.1)', () => {
    it('computes 1.2 km = 15 min exactly', () => {
      expect(walkMinutes(1200)).toBe(15);
    });

    it('computes walk duration for various distances at 80 m/min', () => {
      expect(walkMinutes(0)).toBe(0);
      expect(walkMinutes(80)).toBe(1);
      expect(walkMinutes(400)).toBe(5);
    });

    it('throws on negative distance', () => {
      expect(() => walkMinutes(-10)).toThrow();
    });
  });

  describe('Auto and Cab pickup waits', () => {
    it('exports pickup waits matching shared constants', () => {
      expect(AUTO_PICKUP_MIN).toBe(2.5);
      expect(CAB_PICKUP_MIN).toBe(4.5);
    });
  });

  describe('Property test (fast-check): FIFO monotonicity (PRD Section 7.6, 8.5)', () => {
    it('ensures nextDeparture(t) is monotone non-decreasing for any t1 <= t2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2880 }),
          fc.integer({ min: 0, max: 2880 }),
          fc.integer({ min: 1, max: 60 }), // headway
          (rawA, rawB, headway) => {
            const t1 = Math.min(rawA, rawB);
            const t2 = Math.max(rawA, rawB);
            const first = 360;
            const last = 1320;

            const d1 = nextDeparture(t1, first, headway, last);
            const d2 = nextDeparture(t2, first, headway, last);

            if (d1 !== null && d2 !== null) {
              expect(d1).toBeLessThanOrEqual(d2);
            } else if (d1 === null) {
              // Once service ends, subsequent times cannot depart
              expect(d2).toBeNull();
            }
          },
        ),
        { numRuns: 500 },
      );
    });

    it('ensures metroNextTrain(t) is monotone non-decreasing within operating hours for t1 <= t2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 360, max: 1320 }),
          fc.integer({ min: 360, max: 1320 }),
          (rawA, rawB) => {
            const t1 = Math.min(rawA, rawB);
            const t2 = Math.max(rawA, rawB);

            const m1 = metroNextTrain(t1);
            const m2 = metroNextTrain(t2);

            expect(m1).not.toBeNull();
            expect(m2).not.toBeNull();
            expect(m1!).toBeLessThanOrEqual(m2!);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
