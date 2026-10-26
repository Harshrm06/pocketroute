import { describe, expect, it } from 'vitest';
import {
  AUTO_PICKUP_MIN,
  AUTO_SPEED_KM_PER_H,
  BUS_SPEED_MID_KM_PER_H,
  BUS_SPEED_OFF_PEAK_KM_PER_H,
  BUS_SPEED_PEAK_KM_PER_H,
  CAB_PICKUP_MIN,
  CAB_SPEED_KM_PER_H,
  COLOR_TOKENS,
  MAX_BUDGET,
  MAX_WALK_LEG_M,
  METRO_BOARDING_PENALTY_MIN,
  METRO_SPEED_KM_PER_H,
  MIN_BUDGET,
  MIN_TRANSFER_MIN,
  NIGHT_WINDOW,
  PEAK_WINDOWS,
  PUNE_BOUNDING_BOX,
  WALK_SPEED_KM_PER_H,
  WALK_SPEED_M_PER_MIN,
  departureTimeSchema,
  latLngSchema,
  legSchema,
  lineIdSchema,
  modeSchema,
  planRequestSchema,
  planResponseSchema,
  problemDetailSchema,
  profilerMetricsSchema,
  routeSchema,
} from './index.js';

describe('packages/shared schema & type tests', () => {
  const validOrigin = { lat: 18.5204, lng: 73.8567, label: 'Swargate' };
  const validDestination = {
    lat: 18.5314,
    lng: 73.8446,
    label: 'Shivajinagar',
  };

  describe('Budget validation', () => {
    it('rejects budget 9 (below MIN_BUDGET)', () => {
      const result = planRequestSchema.safeParse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 9,
      });
      expect(result.success).toBe(false);
    });

    it('rejects budget 301 (above MAX_BUDGET)', () => {
      const result = planRequestSchema.safeParse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 301,
      });
      expect(result.success).toBe(false);
    });

    it('rejects budget 74.5 (non-integer)', () => {
      const result = planRequestSchema.safeParse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 74.5,
      });
      expect(result.success).toBe(false);
    });

    it('accepts budget 75', () => {
      const result = planRequestSchema.safeParse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 75,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.budgetINR).toBe(75);
      }
    });

    it('accepts boundary budgets 10 and 300', () => {
      expect(
        planRequestSchema.safeParse({
          origin: validOrigin,
          destination: validDestination,
          departureTime: '17:30',
          budgetINR: 10,
        }).success,
      ).toBe(true);

      expect(
        planRequestSchema.safeParse({
          origin: validOrigin,
          destination: validDestination,
          departureTime: '17:30',
          budgetINR: 300,
        }).success,
      ).toBe(true);
    });
  });

  describe('Departure time validation', () => {
    it("accepts 'now'", () => {
      const result = departureTimeSchema.safeParse('now');
      expect(result.success).toBe(true);

      const reqResult = planRequestSchema.safeParse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: 'now',
        budgetINR: 75,
      });
      expect(reqResult.success).toBe(true);
    });

    it("accepts valid HH:mm times like '17:30' and '08:00'", () => {
      expect(departureTimeSchema.safeParse('17:30').success).toBe(true);
      expect(departureTimeSchema.safeParse('08:00').success).toBe(true);
      expect(departureTimeSchema.safeParse('00:00').success).toBe(true);
      expect(departureTimeSchema.safeParse('23:59').success).toBe(true);
    });

    it('rejects invalid departure times', () => {
      expect(departureTimeSchema.safeParse('24:00').success).toBe(false);
      expect(departureTimeSchema.safeParse('12:60').success).toBe(false);
      expect(departureTimeSchema.safeParse('9:30').success).toBe(false); // needs leading zero
      expect(departureTimeSchema.safeParse('tomorrow').success).toBe(false);
      expect(departureTimeSchema.safeParse('').success).toBe(false);
    });
  });

  describe('LatLng Pune bounding box validation', () => {
    it('accepts points within Pune bounding box (18.40-18.70, 73.70-74.00)', () => {
      expect(
        latLngSchema.safeParse({ lat: 18.5204, lng: 73.8567 }).success,
      ).toBe(true);
      expect(latLngSchema.safeParse({ lat: 18.4, lng: 73.7 }).success).toBe(
        true,
      );
      expect(latLngSchema.safeParse({ lat: 18.7, lng: 74.0 }).success).toBe(
        true,
      );
    });

    it('rejects points outside Pune bounding box', () => {
      // Latitude out of bounds
      expect(latLngSchema.safeParse({ lat: 18.39, lng: 73.85 }).success).toBe(
        false,
      );
      expect(latLngSchema.safeParse({ lat: 18.71, lng: 73.85 }).success).toBe(
        false,
      );
      // Longitude out of bounds
      expect(latLngSchema.safeParse({ lat: 18.52, lng: 73.69 }).success).toBe(
        false,
      );
      expect(latLngSchema.safeParse({ lat: 18.52, lng: 74.01 }).success).toBe(
        false,
      );
    });
  });

  describe('PlanRequest options with defaults', () => {
    it('applies default options when options field is omitted', () => {
      const parsed = planRequestSchema.parse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 75,
      });

      expect(parsed.options).toEqual({
        maxWalkM: 1200,
        includeAuto: true,
        includeCab: true,
      });
    });

    it('preserves user options and applies defaults to missing sub-fields', () => {
      const parsed = planRequestSchema.parse({
        origin: validOrigin,
        destination: validDestination,
        departureTime: '17:30',
        budgetINR: 75,
        options: {
          maxWalkM: 800,
        },
      });

      expect(parsed.options).toEqual({
        maxWalkM: 800,
        includeAuto: true,
        includeCab: true,
      });
    });
  });

  describe('Mode enum and LineId schema', () => {
    it('accepts valid Mode values and rejects invalid', () => {
      expect(modeSchema.safeParse('WALK').success).toBe(true);
      expect(modeSchema.safeParse('METRO').success).toBe(true);
      expect(modeSchema.safeParse('BUS').success).toBe(true);
      expect(modeSchema.safeParse('AUTO').success).toBe(true);
      expect(modeSchema.safeParse('CAB').success).toBe(true);
      expect(modeSchema.safeParse('TRAIN').success).toBe(false);
    });

    it('accepts valid LineId values including BUS_<routeNo>', () => {
      expect(lineIdSchema.safeParse('WALK').success).toBe(true);
      expect(lineIdSchema.safeParse('METRO_PURPLE').success).toBe(true);
      expect(lineIdSchema.safeParse('METRO_AQUA').success).toBe(true);
      expect(lineIdSchema.safeParse('AUTO').success).toBe(true);
      expect(lineIdSchema.safeParse('CAB').success).toBe(true);
      expect(lineIdSchema.safeParse('BUS_101').success).toBe(true);
      expect(lineIdSchema.safeParse('BUS_BRT_2A').success).toBe(true);
      expect(lineIdSchema.safeParse('METRO_RED').success).toBe(false);
      expect(lineIdSchema.safeParse('FERRY').success).toBe(false);
    });
  });

  describe('Leg and Route schemas', () => {
    const validLeg = {
      mode: 'METRO' as const,
      lineId: 'METRO_PURPLE' as const,
      lineLabel: 'Purple Line',
      from: { name: 'Swargate', lat: 18.5, lng: 73.86 },
      to: { name: 'Civil Court', lat: 18.52, lng: 73.85 },
      departAt: '17:36',
      arriveAt: '17:44',
      durationMin: 8,
      distanceKm: 2.4,
      stopCount: 3,
      waitMin: 1,
      fareINR: 15,
      geometry: {
        type: 'LineString' as const,
        coordinates: [[73.86, 18.5] as [number, number]],
      },
      geometryQuality: 'exact' as const,
      instruction: 'Board Purple Line toward PCMC at Swargate.',
    };

    it('validates a correct Leg without v1.2.0 fields', () => {
      expect(legSchema.safeParse(validLeg).success).toBe(true);
    });

    it('validates a Leg with optional v1.2.0 schedule & bus fields', () => {
      const legWithV120 = {
        ...validLeg,
        routeNumbers: ['140', '23'],
        routeName: 'Upper Depot to Pune Station',
        headsign: 'Pune Station',
        boardingStop: 'Bibwewadi',
        alightingStop: 'Pune Railway Station',
        intermediateStopsCount: 4,
        intermediateStops: ['Market Yard', 'Swargate'],
        scheduledDeparture: '17:38',
        scheduledArrival: '18:02',
        waitMinutes: 4,
        frequencyMinutes: 10,
        nextDepartures: ['17:38', '17:48', '17:58'],
        scheduleBasis: 'estimate' as const,
      };
      const result = legSchema.safeParse(legWithV120);
      expect(result.success).toBe(true);
    });

    it('validates a Route containing legs', () => {
      const validRoute = {
        feasible: true,
        totalFareINR: 70,
        arrivalTime: '17:58',
        durationMin: 28,
        legs: [validLeg],
      };
      expect(routeSchema.safeParse(validRoute).success).toBe(true);
    });
  });

  describe('PlanResponse and ProblemDetail schemas', () => {
    it('validates a complete PlanResponse matching Section 9.1', () => {
      const response = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        budgetINR: 75,
        routes: {
          smart: {
            feasible: true,
            totalFareINR: 70,
            arrivalTime: '17:58',
            durationMin: 28,
            legs: [],
          },
          fastest: {
            feasible: true,
            totalFareINR: 110,
            arrivalTime: '17:51',
            durationMin: 21,
            legs: [],
          },
          cheapest: {
            feasible: true,
            totalFareINR: 30,
            arrivalTime: '18:20',
            durationMin: 50,
            legs: [],
          },
        },
        comparison: { fareSavedVsFastestINR: 40, extraMinVsFastest: 7 },
        infeasible: null,
        metrics: {},
      };
      expect(planResponseSchema.safeParse(response).success).toBe(true);
    });

    it('validates an infeasible PlanResponse with smart: null and infeasible details', () => {
      const response = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        budgetINR: 15,
        routes: {
          smart: null,
          fastest: {
            feasible: true,
            totalFareINR: 110,
            arrivalTime: '17:51',
            durationMin: 21,
            legs: [],
          },
          cheapest: {
            feasible: true,
            totalFareINR: 30,
            arrivalTime: '18:20',
            durationMin: 50,
            legs: [],
          },
        },
        comparison: null,
        infeasible: {
          minimumRequiredFareINR: 30,
          message:
            'Minimum possible fare is ₹30. Increase your budget to at least ₹30 to get a Smart route.',
        },
        metrics: null,
      };
      expect(planResponseSchema.safeParse(response).success).toBe(true);
    });

    it('validates RFC 7807 ProblemDetail', () => {
      const problem = {
        type: 'https://pocketroute.example/errors/invalid-budget',
        title: 'Invalid budget',
        status: 400,
        detail: 'Budget must be an integer between 10 and 300 INR.',
        instance: '/api/v1/route/plan',
        invalidParams: [
          { name: 'budgetINR', reason: 'Must be between 10 and 300' },
        ],
      };
      expect(problemDetailSchema.safeParse(problem).success).toBe(true);
    });
  });

  describe('ProfilerMetrics schema', () => {
    it('validates full ProfilerMetrics matching Section 8.7', () => {
      const metrics = {
        pq: { pushes: 120, pops: 85 },
        relaxations: 340,
        labels: { created: 120, dominanceRemoved: 15, maxFrontierSize: 6 },
        pruned: { budget: 42, timeBound: 18, dominance: 23 },
        dp: { statesExplored: 95, statesTotal: 450 },
        timing: { elapsedMs: 12.4, runs: 5, medianMs: 11.9 },
        graph: { V: 120, E: 450, L: 14, B: 75 },
        theory: {
          routeA: { bound: 'O(E*L*log(V*L))', ops: 3500 },
          routeB: { bound: 'O(E*L*log(V*L))', ops: 3500 },
          rcspp: { bound: 'O(E*L*B*log(V*L*B))', ops: 260000 },
          dense: { bound: 'Theta(V*L*(B+1))', ops: 127680 },
        },
      };
      expect(profilerMetricsSchema.safeParse(metrics).success).toBe(true);
    });
  });

  describe('Constants module verification', () => {
    it('exports all required constants with exact values', () => {
      expect(MIN_BUDGET).toBe(10);
      expect(MAX_BUDGET).toBe(300);
      expect(WALK_SPEED_M_PER_MIN).toBe(80);
      expect(MAX_WALK_LEG_M).toBe(1200);
      expect(MIN_TRANSFER_MIN).toBe(1);
      expect(METRO_BOARDING_PENALTY_MIN).toBe(3);
      expect(AUTO_PICKUP_MIN).toBe(2.5);
      expect(CAB_PICKUP_MIN).toBe(4.5);

      expect(WALK_SPEED_KM_PER_H).toBe(4.8);
      expect(METRO_SPEED_KM_PER_H).toBe(34);
      expect(BUS_SPEED_PEAK_KM_PER_H).toBe(18);
      expect(BUS_SPEED_MID_KM_PER_H).toBe(20);
      expect(BUS_SPEED_OFF_PEAK_KM_PER_H).toBe(22);
      expect(AUTO_SPEED_KM_PER_H).toBe(26);
      expect(CAB_SPEED_KM_PER_H).toBe(29);

      expect(PEAK_WINDOWS).toEqual([
        { start: '08:00', end: '11:00' },
        { start: '17:00', end: '20:30' },
      ]);
      expect(NIGHT_WINDOW).toEqual({ start: '00:00', end: '05:00' });

      expect(PUNE_BOUNDING_BOX).toEqual({
        minLat: 18.4,
        maxLat: 18.7,
        minLng: 73.7,
        maxLng: 74.0,
      });

      expect(COLOR_TOKENS.metroPurple).toBe('#7C3AED');
      expect(COLOR_TOKENS.metroAqua).toBe('#0891B2');
      expect(COLOR_TOKENS.bus).toBe('#059669');
      expect(COLOR_TOKENS.auto).toBe('#D97706');
      expect(COLOR_TOKENS.cab).toBe('#4F46E5');
      expect(COLOR_TOKENS.walk).toBe('#0284C7');
    });
  });
});
