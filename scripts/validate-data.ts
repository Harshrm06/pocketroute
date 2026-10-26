import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  PUNE_BOUNDING_BOX,
  fareTablesSchema,
  latLngSchema,
} from '@pocketroute/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, 'data', 'pune');

// --- Schemas ---

const metroStationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
  interchangeWith: z.array(z.string()).optional(),
  verified: z.boolean(),
  notes: z.string().optional(),
});

const metroLineSchema = z.object({
  id: z.enum(['METRO_PURPLE', 'METRO_AQUA']),
  name: z.string().min(1),
  corridor: z.string().optional(),
  color: z.string().optional(),
  stations: z.array(metroStationSchema).min(1),
});

const metroDataSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  lines: z.array(metroLineSchema).min(2),
});

const busStopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
  segmentDistanceKm: z.number().nonnegative(),
});

const busRouteSchema = z.object({
  routeNo: z.string().min(1),
  label: z.string().min(1),
  firstDeparture: z.number().int().min(0).max(1440),
  peakHeadway: z.number().positive(),
  offPeakHeadway: z.number().positive(),
  verified: z.boolean(),
  notes: z.string().optional(),
  stops: z.array(busStopSchema).min(2),
});

const busRoutesDataSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  routes: z.array(busRouteSchema).min(8).max(12),
});

const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  lat: z.number().min(PUNE_BOUNDING_BOX.minLat).max(PUNE_BOUNDING_BOX.maxLat),
  lng: z.number().min(PUNE_BOUNDING_BOX.minLng).max(PUNE_BOUNDING_BOX.maxLng),
  category: z.string().min(1),
});

const placesDataSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  places: z.array(placeSchema).min(100),
});

const paramsDataSchema = z.object({
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
  operatingHours: z.object({
    metro: z.object({
      start: z.string(),
      end: z.string(),
      startMin: z.number(),
      endMin: z.number(),
    }),
  }),
  windows: z.object({
    peak: z.array(
      z.object({
        start: z.string(),
        end: z.string(),
        startMin: z.number(),
        endMin: z.number(),
      }),
    ),
    mid: z.object({
      start: z.string(),
      end: z.string(),
      startMin: z.number(),
      endMin: z.number(),
    }),
    night: z.object({
      start: z.string(),
      end: z.string(),
      startMin: z.number(),
      endMin: z.number(),
    }),
  }),
  surges: z.object({
    cabRushMultiplier: z.number().positive(),
    autoNightMultiplier: z.number().positive(),
  }),
  boundingBox: z.object({
    minLat: z.number(),
    maxLat: z.number(),
    minLng: z.number(),
    maxLng: z.number(),
  }),
});

// --- Validation Runner ---

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

function run(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('Validating data/pune dataset against PRD specifications...\n');

  // 1. Validate fares.json
  try {
    const faresPath = path.resolve(dataDir, 'fares.json');
    const rawFares = readJsonFile(faresPath);
    fareTablesSchema.parse(rawFares);
    console.log('✓ data/pune/fares.json: Schema and slabs valid.');
  } catch (err) {
    errors.push(`fares.json validation failed: ${(err as Error).message}`);
  }

  // 2. Validate params.json
  try {
    const paramsPath = path.resolve(dataDir, 'params.json');
    const rawParams = readJsonFile(paramsPath);
    paramsDataSchema.parse(rawParams);
    console.log('✓ data/pune/params.json: Operational parameters valid.');
  } catch (err) {
    errors.push(`params.json validation failed: ${(err as Error).message}`);
  }

  // 3. Validate metro.json
  try {
    const metroPath = path.resolve(dataDir, 'metro.json');
    const rawMetro = readJsonFile(metroPath);
    const parsedMetro = metroDataSchema.parse(rawMetro);

    const stationIdSet = new Set<string>();
    let totalStations = 0;

    for (const line of parsedMetro.lines) {
      if (line.stations.length === 0) {
        errors.push(`Metro line ${line.id} has 0 stations.`);
      }
      totalStations += line.stations.length;

      for (const st of line.stations) {
        if (stationIdSet.has(st.id)) {
          errors.push(`Duplicate metro station ID detected: ${st.id}`);
        }
        stationIdSet.add(st.id);

        if (!st.verified) {
          warnings.push(
            `Metro station [${st.id}] "${st.name}" verified: false. Notes: ${st.notes ?? 'None'}`,
          );
        }

        const coordResult = latLngSchema.safeParse({
          lat: st.lat,
          lng: st.lng,
        });
        if (!coordResult.success) {
          errors.push(
            `Metro station [${st.id}] coordinates out of bounds: (${st.lat}, ${st.lng})`,
          );
        }
      }
    }

    // Check interchange targets
    for (const line of parsedMetro.lines) {
      for (const st of line.stations) {
        if (st.interchangeWith) {
          for (const targetId of st.interchangeWith) {
            if (!stationIdSet.has(targetId)) {
              errors.push(
                `Metro station [${st.id}] references non-existent interchange station: "${targetId}"`,
              );
            }
          }
        }
      }
    }

    console.log(
      `✓ data/pune/metro.json: ${parsedMetro.lines.length} lines, ${totalStations} stations, interchanges verified.`,
    );
  } catch (err) {
    errors.push(`metro.json validation failed: ${(err as Error).message}`);
  }

  // 4. Validate bus_routes.json
  try {
    const busPath = path.resolve(dataDir, 'bus_routes.json');
    const rawBus = readJsonFile(busPath);
    const parsedBus = busRoutesDataSchema.parse(rawBus);

    for (const route of parsedBus.routes) {
      if (!route.verified) {
        warnings.push(
          `Bus route [Bus ${route.routeNo}] "${route.label}" verified: false. Notes: ${route.notes ?? 'Unverified'}`,
        );
      }

      const stopCount = route.stops.length;
      if (stopCount < 2) {
        errors.push(`Bus route ${route.routeNo} has fewer than 2 stops.`);
      }

      for (let i = 0; i < stopCount; i++) {
        const stop = route.stops[i]!;
        const coordResult = latLngSchema.safeParse({
          lat: stop.lat,
          lng: stop.lng,
        });
        if (!coordResult.success) {
          errors.push(
            `Bus stop [${stop.id}] on route ${route.routeNo} out of bounds: (${stop.lat}, ${stop.lng})`,
          );
        }

        // Segment distance checks: intermediate stops must have > 0 km, terminal stop must be 0
        if (i < stopCount - 1) {
          if (stop.segmentDistanceKm <= 0) {
            errors.push(
              `Bus stop [${stop.id}] (stop #${i + 1} of ${stopCount} on route ${route.routeNo}) must have positive segmentDistanceKm, got ${stop.segmentDistanceKm}`,
            );
          }
        } else {
          if (stop.segmentDistanceKm !== 0) {
            warnings.push(
              `Terminal bus stop [${stop.id}] on route ${route.routeNo} has non-zero segmentDistanceKm: ${stop.segmentDistanceKm} (expected 0).`,
            );
          }
        }
      }

      // Check stopOffsetMin (v1.2.0 PRD §23)
      if (route.stopOffsetMin) {
        if (route.stopOffsetMin.length !== stopCount) {
          errors.push(
            `Bus route ${route.routeNo} stopOffsetMin length (${route.stopOffsetMin.length}) does not match stops count (${stopCount}).`,
          );
        }
        for (let j = 1; j < route.stopOffsetMin.length; j++) {
          if (route.stopOffsetMin[j]! < route.stopOffsetMin[j - 1]!) {
            errors.push(
              `Bus route ${route.routeNo} stopOffsetMin is not non-decreasing at index ${j} (${route.stopOffsetMin[j]} < ${route.stopOffsetMin[j - 1]}).`,
            );
          }
        }
      }
    }

    console.log(
      `✓ data/pune/bus_routes.json: ${parsedBus.routes.length} corridors verified (stop order and segments checked).`,
    );
  } catch (err) {
    errors.push(`bus_routes.json validation failed: ${(err as Error).message}`);
  }

  // 5. Validate places.json
  try {
    const placesPath = path.resolve(dataDir, 'places.json');
    const rawPlaces = readJsonFile(placesPath);
    const parsedPlaces = placesDataSchema.parse(rawPlaces);

    const placeIdSet = new Set<string>();

    for (const pl of parsedPlaces.places) {
      if (placeIdSet.has(pl.id)) {
        errors.push(`Duplicate place ID detected: ${pl.id}`);
      }
      placeIdSet.add(pl.id);

      const coordResult = latLngSchema.safeParse({ lat: pl.lat, lng: pl.lng });
      if (!coordResult.success) {
        errors.push(
          `Place [${pl.id}] "${pl.name}" out of bounds: (${pl.lat}, ${pl.lng})`,
        );
      }
    }

    console.log(
      `✓ data/pune/places.json: ${parsedPlaces.places.length} landmarks verified within bounding box.`,
    );
  } catch (err) {
    errors.push(`places.json validation failed: ${(err as Error).message}`);
  }

  // Summary & Exit
  console.log('\n--- Validation Report ---');

  if (warnings.length > 0) {
    console.log(
      `\n⚠️  Warnings (${warnings.length} entries flagged with verified: false):`,
    );
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Validation Failed with ${errors.length} error(s):`);
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(
    '\n✅ All data files passed schema, geographic, and integrity validation successfully.',
  );
  process.exit(0);
}

run();
