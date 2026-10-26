import { z } from 'zod';
import {
  AUTO_PICKUP_MIN,
  CAB_PICKUP_MIN,
  FALLBACK_MAX_WALK_LEG_M,
  MAX_BUDGET,
  MAX_WALK_LEG_M,
  METRO_BOARDING_PENALTY_MIN,
  MIN_BUDGET,
  MIN_TRANSFER_MIN,
  PUNE_BOUNDING_BOX,
} from './constants.js';

// Re-export constants for convenience if needed
export {
  AUTO_PICKUP_MIN,
  CAB_PICKUP_MIN,
  FALLBACK_MAX_WALK_LEG_M,
  MAX_BUDGET,
  MAX_WALK_LEG_M,
  METRO_BOARDING_PENALTY_MIN,
  MIN_BUDGET,
  MIN_TRANSFER_MIN,
  PUNE_BOUNDING_BOX,
};

/**
 * Mode enum matching PRD Section 6.1: WALK, METRO, BUS, AUTO, CAB.
 */
export const modeSchema = z.enum(['WALK', 'METRO', 'BUS', 'AUTO', 'CAB']);
export type Mode = z.infer<typeof modeSchema>;

/**
 * LineId: string union including METRO_PURPLE, METRO_AQUA, WALK, AUTO, CAB,
 * and BUS_<routeNo> (template literal type).
 */
export const lineIdSchema = z.union([
  z.literal('WALK'),
  z.literal('METRO_PURPLE'),
  z.literal('METRO_AQUA'),
  z.literal('AUTO'),
  z.literal('CAB'),
  z.templateLiteral(['BUS_', z.string()]),
]);
export type LineId = z.infer<typeof lineIdSchema>;

/**
 * LatLng with range checks for the Pune bounding box (lat 18.40 to 18.70, lng 73.70 to 74.00).
 */
export const latLngSchema = z.object({
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
});
export type LatLng = z.infer<typeof latLngSchema>;

/**
 * Location point for planning, with optional human-readable label.
 */
export const planPointSchema = latLngSchema.extend({
  label: z.string().optional(),
});
export type PlanPoint = z.infer<typeof planPointSchema>;
export type PlanLocation = PlanPoint;

/**
 * Departure time: "HH:mm" (24-hour IST format) or "now".
 */
export const departureTimeSchema = z.union([
  z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm in 24-hour format'),
  z.literal('now'),
]);
export type DepartureTime = z.infer<typeof departureTimeSchema>;

/**
 * Options for routing, with defaults specified in PRD Section 9.1.
 */
export const planOptionsSchema = z.object({
  maxWalkM: z.number().nonnegative().default(MAX_WALK_LEG_M),
  includeAuto: z.boolean().default(true),
  includeCab: z.boolean().default(true),
});
export type PlanOptions = z.infer<typeof planOptionsSchema>;
export type PlanOptionsInput = z.input<typeof planOptionsSchema>;

/**
 * PlanRequest matching PRD Section 9.1.
 * - origin / destination: coordinates inside Pune bounding box
 * - departureTime: "HH:mm" or "now"
 * - date: optional YYYY-MM-DD
 * - budgetINR: integer from 10 to 300
 * - options: defaults to { maxWalkM: 1200, includeAuto: true, includeCab: true }
 */
export const planRequestSchema = z.object({
  origin: planPointSchema,
  destination: planPointSchema,
  departureTime: departureTimeSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date')
    .optional(),
  budgetINR: z.number().int().min(MIN_BUDGET).max(MAX_BUDGET),
  options: planOptionsSchema.default({
    maxWalkM: MAX_WALK_LEG_M,
    includeAuto: true,
    includeCab: true,
  }),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;
export type PlanRequestInput = z.input<typeof planRequestSchema>;

/**
 * GeoJSON LineString for route leg geometry.
 */
export const geoJsonLineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
export type GeoJsonLineString = z.infer<typeof geoJsonLineStringSchema>;

/**
 * Quality indicator for rendered geometry (exact road/rail vs schematic vs estimated).
 */
export const geometryQualitySchema = z.enum([
  'exact',
  'schematic',
  'estimated',
]);
export type GeometryQuality = z.infer<typeof geometryQualitySchema>;

/**
 * Transit stop or point for leg origin/destination.
 */
export const stopPointSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type StopPoint = z.infer<typeof stopPointSchema>;

/**
 * Leg schema matching PRD Section 9.1.
 */
export const legSchema = z.object({
  mode: modeSchema,
  lineId: lineIdSchema,
  lineLabel: z.string(),
  from: stopPointSchema,
  to: stopPointSchema,
  departAt: z.string(),
  arriveAt: z.string(),
  durationMin: z.number(),
  distanceKm: z.number(),
  stopCount: z.number().int().nonnegative(),
  waitMin: z.number().nonnegative(),
  fareINR: z.number().nonnegative(),
  geometry: geoJsonLineStringSchema,
  geometryQuality: geometryQualitySchema,
  instruction: z.string(),
  // Bus and Metro schedule & route metadata (v1.2.0, PRD §23)
  routeNumbers: z.array(z.string()).optional(),
  routeName: z.string().optional(),
  headsign: z.string().optional(),
  boardingStop: z.string().optional(),
  alightingStop: z.string().optional(),
  intermediateStopsCount: z.number().int().nonnegative().optional(),
  intermediateStops: z.array(z.string()).optional(),
  scheduledDeparture: z.string().optional(),
  scheduledArrival: z.string().optional(),
  waitMinutes: z.number().nonnegative().optional(),
  frequencyMinutes: z.number().nonnegative().optional(),
  nextDepartures: z.array(z.string()).optional(),
  scheduleBasis: z.literal('estimate').optional(),
  // Bus-to-bus transfer metadata (v1.2.0, PRD §23)
  transferAt: z.string().optional(),
  transferWaitMinutes: z.number().nonnegative().optional(),
});
export type Leg = z.infer<typeof legSchema>;
export type RouteLeg = Leg;

/**
 * Route schema matching PRD Section 9.1.
 */
export const routeSchema = z.object({
  feasible: z.boolean(),
  totalFareINR: z.number().nonnegative(),
  arrivalTime: z.string(),
  durationMin: z.number().nonnegative(),
  legs: z.array(legSchema),
  departureTime: z.string().optional(),
  totalDistanceKm: z.number().nonnegative().optional(),
  dailyPassTip: z.string().nullable().optional(),
  attachmentRadiusExpanded: z.boolean().optional(),
});
export type Route = z.infer<typeof routeSchema>;

/**
 * Comparison between Smart route and unconstrained Fastest route.
 */
export const routeComparisonSchema = z.object({
  fareSavedVsFastestINR: z.number(),
  extraMinVsFastest: z.number(),
});
export type RouteComparison = z.infer<typeof routeComparisonSchema>;

/**
 * Infeasibility details when no route fits the user's budget.
 */
export const infeasibleResultSchema = z.object({
  minimumRequiredFareINR: z.number(),
  message: z.string(),
});
export type InfeasibleResult = z.infer<typeof infeasibleResultSchema>;

/**
 * Triple routes container: smart, fastest, cheapest.
 */
export const planRoutesSchema = z.object({
  smart: routeSchema.nullable(),
  fastest: routeSchema,
  cheapest: routeSchema,
});
export type PlanRoutes = z.infer<typeof planRoutesSchema>;

/**
 * Profiler metrics schema matching PRD Section 8.7.
 */
export const profilerMetricsSchema = z.object({
  pq: z.object({
    pushes: z.number().int().nonnegative(),
    pops: z.number().int().nonnegative(),
  }),
  relaxations: z.number().int().nonnegative(),
  labels: z.object({
    created: z.number().int().nonnegative(),
    dominanceRemoved: z.number().int().nonnegative(),
    maxFrontierSize: z.number().int().nonnegative(),
  }),
  pruned: z.object({
    budget: z.number().int().nonnegative(),
    timeBound: z.number().int().nonnegative(),
    dominance: z.number().int().nonnegative(),
  }),
  dp: z.object({
    statesExplored: z.number().int().nonnegative(),
    statesTotal: z.number().int().nonnegative(),
  }),
  timing: z.object({
    elapsedMs: z.number().nonnegative(),
    runs: z.number().int().positive(),
    medianMs: z.number().nonnegative(),
  }),
  graph: z.object({
    V: z.number().int().nonnegative(),
    E: z.number().int().nonnegative(),
    L: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    T: z.number().int().nonnegative().optional(),
  }),
  theory: z.object({
    routeA: z.object({
      bound: z.string(),
      ops: z.number().nonnegative(),
    }),
    routeB: z.object({
      bound: z.string(),
      ops: z.number().nonnegative(),
    }),
    rcspp: z.object({
      bound: z.string(),
      ops: z.number().nonnegative(),
    }),
    dense: z.object({
      bound: z.string(),
      ops: z.number().nonnegative(),
    }),
  }),
});
export type ProfilerMetrics = z.infer<typeof profilerMetricsSchema>;

/**
 * PlanResponse matching PRD Section 9.1 and Section 8.8.
 */
export const planResponseSchema = z.object({
  requestId: z.string(),
  budgetINR: z.number(),
  routes: planRoutesSchema,
  comparison: routeComparisonSchema.nullable().optional(),
  infeasible: infeasibleResultSchema.nullable(),
  metrics: z
    .union([profilerMetricsSchema, z.record(z.string(), z.unknown())])
    .nullable()
    .optional(),
  dailyPassTip: z.string().nullable().optional(),
  attachmentRadiusExpanded: z.boolean().optional(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

/**
 * RFC 7807 Problem Details (application/problem+json).
 */
export const problemDetailSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  invalidParams: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
  errors: z.unknown().optional(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;
export type ProblemDetailInput = z.input<typeof problemDetailSchema>;

/**
 * Single distance-to-fare slab (e.g. up to maxDistanceKm costs fareINR).
 */
export const fareSlabSchema = z.object({
  maxDistanceKm: z.number().positive().nullable(),
  fareINR: z.number().int().nonnegative(),
});
export type FareSlab = z.infer<typeof fareSlabSchema>;

/**
 * Schema for data/pune/fares.json matching PRD Section 5 & 6.
 */
export const fareTablesSchema = z
  .object({
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date'),
    source: z.string().optional(),
    verified: z.boolean().optional(),
    metro: z.object({
      slabs: z.array(fareSlabSchema),
    }),
    bus: z.object({
      slabs: z.array(fareSlabSchema),
    }),
    auto: z.object({
      baseFareINR: z.number().nonnegative(),
      baseDistanceKm: z.number().nonnegative(),
      perKmRateINR: z.number().nonnegative(),
      nightSurchargeMultiplier: z.number().positive(),
      nightWindow: z.object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(24),
      }),
    }),
    cab: z.object({
      baseFareINR: z.number().nonnegative(),
      perKmRateINR: z.number().nonnegative(),
      perMinuteRateINR: z.number().nonnegative(),
      surgeMultiplier: z.number().positive(),
    }),
    walk: z.object({
      fareINR: z.literal(0),
    }),
  })
  .passthrough();
export type FareTables = z.infer<typeof fareTablesSchema>;

/**
 * Metro station and line schemas for data/pune/metro.json.
 */
export const metroStationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
  interchangeWith: z.array(z.string()).optional(),
  verified: z.boolean(),
  notes: z.string().optional(),
});
export type MetroStation = z.infer<typeof metroStationSchema>;

export const metroLineSchema = z.object({
  id: z.enum(['METRO_PURPLE', 'METRO_AQUA']),
  name: z.string().min(1),
  corridor: z.string(),
  color: z.string(),
  stations: z.array(metroStationSchema).min(1),
});
export type MetroLine = z.infer<typeof metroLineSchema>;

export const metroDataSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  lines: z.array(metroLineSchema).min(2),
});
export type MetroData = z.infer<typeof metroDataSchema>;

/**
 * Bus stop and route schemas for data/pune/bus_routes.json.
 */
export const busStopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
  segmentDistanceKm: z.number().nonnegative(),
});
export type BusStop = z.infer<typeof busStopSchema>;

export const busRouteSchema = z
  .object({
    routeNo: z.string().min(1),
    routeNumbers: z.array(z.string()).optional(),
    label: z.string().min(1),
    firstDeparture: z.number().int().min(0).max(1440),
    peakHeadway: z.number().positive(),
    offPeakHeadway: z.number().positive(),
    verified: z.boolean(),
    notes: z.string().optional(),
    stops: z.array(busStopSchema).min(2),
    firstBusMin: z.number().int().min(0).max(1440).optional(),
    lastBusMin: z.number().int().min(0).max(1440).optional(),
    peakHeadwayMin: z.number().positive().optional(),
    offPeakHeadwayMin: z.number().positive().optional(),
    nightHeadwayMin: z.number().positive().optional(),
    stopOffsetMin: z.array(z.number().nonnegative()).optional(),
    scheduleSource: z.string().optional(),
  })
  .passthrough();
export type BusRoute = z.infer<typeof busRouteSchema>;

export const busRoutesDataSchema = z
  .object({
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().optional(),
    routes: z.array(busRouteSchema).min(2),
  })
  .passthrough();
export type BusRoutesData = z.infer<typeof busRoutesDataSchema>;

/**
 * Place schema for data/pune/places.json.
 */
export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  lat: z
    .number()
    .min(PUNE_BOUNDING_BOX.minLat)
    .max(PUNE_BOUNDING_BOX.maxLat)
    .nullable(),
  lng: z
    .number()
    .min(PUNE_BOUNDING_BOX.minLng)
    .max(PUNE_BOUNDING_BOX.maxLng)
    .nullable(),
  category: z.string().min(1),
  verified: z.boolean().optional(),
  notes: z.string().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const placesDataSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  places: z.array(placeSchema).min(50),
});
export type PlacesData = z.infer<typeof placesDataSchema>;

/**
 * System params schema for data/pune/params.json.
 */
export const paramsDataSchema = z
  .object({
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().optional(),
    budget: z.object({
      minINR: z.number().int().positive(),
      maxINR: z.number().int().positive(),
    }),
    speeds: z.object({
      walk: z.object({
        mPerMin: z.number().positive(),
        kmPerH: z.number().positive(),
      }),
      metro: z.object({ kmPerH: z.number().positive() }),
      bus: z.object({
        peakKmPerH: z.number().positive(),
        midKmPerH: z.number().positive(),
        offPeakKmPerH: z.number().positive(),
      }),
      auto: z.object({ kmPerH: z.number().positive() }),
      cab: z.object({ kmPerH: z.number().positive() }),
    }),
    penalties: z.object({
      minTransferMin: z.number().nonnegative(),
      metroBoardingPenaltyMin: z.number().nonnegative(),
      autoPickupMin: z.number().nonnegative(),
      cabPickupMin: z.number().nonnegative(),
      maxWalkLegM: z.number().positive(),
      fallbackMaxWalkLegM: z.number().positive(),
    }),
    headways: z.object({
      metro: z.object({
        peakMin: z.number().positive(),
        offPeakMin: z.number().positive(),
      }),
    }),
    operatingHours: z
      .object({
        metro: z.object({
          start: z.string(),
          end: z.string(),
          startMin: z.number(),
          endMin: z.number(),
        }),
      })
      .optional(),
    windows: z.record(z.string(), z.unknown()).optional(),
    surges: z.record(z.string(), z.unknown()).optional(),
    boundingBox: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type ParamsData = z.infer<typeof paramsDataSchema>;
