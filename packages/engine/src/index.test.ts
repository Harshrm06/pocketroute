import { describe, expect, it } from 'vitest';
import * as engine from './index.js';

describe('packages/engine root exports', () => {
  it('exports pricing functions and utilities', () => {
    expect(typeof engine.metroFareINR).toBe('function');
    expect(typeof engine.busFareINR).toBe('function');
    expect(typeof engine.autoFareINR).toBe('function');
    expect(typeof engine.cabFareINR).toBe('function');
    expect(typeof engine.walkFareINR).toBe('function');
    expect(typeof engine.roundHalfUp).toBe('function');
    expect(typeof engine.loadFares).toBe('function');
    expect(typeof engine.loadFaresFromFile).toBe('function');
    expect(typeof engine.getDefaultFares).toBe('function');
    expect(typeof engine.setDefaultFares).toBe('function');
  });

  it('exports timing functions and utilities', () => {
    expect(typeof engine.parseHHmm).toBe('function');
    expect(typeof engine.formatHHmm).toBe('function');
    expect(typeof engine.isPeak).toBe('function');
    expect(typeof engine.isNight).toBe('function');
    expect(typeof engine.rushWindow).toBe('function');
    expect(typeof engine.nextDeparture).toBe('function');
    expect(typeof engine.metroNextTrain).toBe('function');
    expect(typeof engine.busHeadwayAt).toBe('function');
    expect(typeof engine.busSpeedAt).toBe('function');
    expect(typeof engine.walkMinutes).toBe('function');
    expect(engine.AUTO_PICKUP_MIN).toBe(2.5);
    expect(engine.CAB_PICKUP_MIN).toBe(4.5);
  });
});
