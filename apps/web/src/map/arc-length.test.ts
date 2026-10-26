import { describe, it, expect } from 'vitest';
import { getPointAtArcLength, haversineMeters } from './arc-length.js';

describe('arc-length utilities (PRD §22.1)', () => {
  it('computes haversine distance accurately', () => {
    // Distance between Swargate (18.5015, 73.8542) and Shivajinagar (18.5303, 73.8488) ~ 3.25 km
    const d = haversineMeters(18.5015, 73.8542, 18.5303, 73.8488);
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(3500);
  });

  it('interpolates point at 50% arc length for single line', () => {
    const coords: [number, number][] = [
      [73.8542, 18.5015],
      [73.8488, 18.5303],
    ];
    const res = getPointAtArcLength(coords, 0.5, 14, 'left');
    expect(res).not.toBeNull();
    // Midpoint should be approximately average of coordinates
    expect(res!.point[0]).toBeCloseTo((73.8542 + 73.8488) / 2, 3);
    expect(res!.point[1]).toBeCloseTo((18.5015 + 18.5303) / 2, 3);
    expect(res!.perpendicularOffsetPx).toHaveLength(2);
  });

  it('calculates alternating perpendicular offsets for multiple route ratios', () => {
    const coords: [number, number][] = [
      [73.8, 18.5],
      [73.85, 18.52],
      [73.9, 18.55],
    ];

    const pFastest = getPointAtArcLength(coords, 0.35, 14, 'right');
    const pSmart = getPointAtArcLength(coords, 0.55, 14, 'left');
    const pCheapest = getPointAtArcLength(coords, 0.7, 14, 'right');

    expect(pFastest).not.toBeNull();
    expect(pSmart).not.toBeNull();
    expect(pCheapest).not.toBeNull();

    // Verify points are strictly separated along arc length
    expect(pFastest!.point[0]).toBeLessThan(pSmart!.point[0]);
    expect(pSmart!.point[0]).toBeLessThan(pCheapest!.point[0]);
  });
});
