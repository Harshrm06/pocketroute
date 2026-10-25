import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GeometryQuality } from '@pocketroute/shared';
import {
  bezierEstimate,
  catmullRomSpline,
  coordinatesLengthMeters,
  douglasPeucker,
} from '@pocketroute/engine';

interface MetroStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  interchangeWith?: string[];
  verified?: boolean;
}

interface MetroLine {
  id: string;
  name: string;
  corridor: string;
  color: string;
  stations: MetroStation[];
}

interface MetroData {
  lines: MetroLine[];
}

interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  segmentDistanceKm: number;
}

interface BusRoute {
  routeNo: string;
  label: string;
  stops: BusStop[];
}

interface BusRoutesData {
  routes: BusRoute[];
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry: {
      type: string;
      coordinates: [number, number][];
    };
    distance: number;
  }>;
}

interface GeometryFeature {
  type: 'Feature';
  properties: {
    lineId?: string;
    routeNo?: string;
    lineLabel: string;
    corridor?: string;
    geometryQuality: GeometryQuality;
    lengthMeters: number;
    stopCount?: number;
    stationCount?: number;
    generatedAt: string;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

const ROOT_DIR = resolve(process.cwd());
const DATA_DIR = resolve(ROOT_DIR, 'data');
const METRO_JSON_PATH = resolve(DATA_DIR, 'pune', 'metro.json');
const BUS_ROUTES_JSON_PATH = resolve(DATA_DIR, 'pune', 'bus_routes.json');
const BUS_GEOMETRY_DIR = resolve(DATA_DIR, 'geometry', 'bus');
const METRO_GEOMETRY_DIR = resolve(DATA_DIR, 'geometry', 'metro');

// Ensure output directories exist
mkdirSync(BUS_GEOMETRY_DIR, { recursive: true });
mkdirSync(METRO_GEOMETRY_DIR, { recursive: true });

async function fetchOsrmSegment(
  baseUrl: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<[number, number][]> {
  const url = `${baseUrl.replace(/\/$/, '')}/route/v1/car/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OSRM request failed with status ${res.status}: ${res.statusText}`,
    );
  }
  const data = (await res.json()) as OsrmRouteResponse;
  if (!data.routes || data.routes.length === 0) {
    throw new Error(
      `OSRM returned no route between (${from.lat}, ${from.lng}) and (${to.lat}, ${to.lng})`,
    );
  }
  return data.routes[0]!.geometry.coordinates;
}

/**
 * Attempt to stitch disconnected or fragmented ways into an ordered single polyline.
 */
function stitchWays(ways: [number, number][][]): [number, number][] | null {
  if (ways.length === 0) return null;
  if (ways.length === 1) return ways[0]!;

  const remaining = [...ways];
  const stitched: [number, number][] = [...remaining.shift()!];

  while (remaining.length > 0) {
    const currentEnd = stitched[stitched.length - 1]!;
    let bestIdx = -1;
    let bestDist = Infinity;
    let shouldReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const way = remaining[i]!;
      const startPt = way[0]!;
      const endPt = way[way.length - 1]!;

      const distStart = Math.hypot(
        startPt[0] - currentEnd[0],
        startPt[1] - currentEnd[1],
      );
      const distEnd = Math.hypot(
        endPt[0] - currentEnd[0],
        endPt[1] - currentEnd[1],
      );

      if (distStart < bestDist) {
        bestDist = distStart;
        bestIdx = i;
        shouldReverse = false;
      }
      if (distEnd < bestDist) {
        bestDist = distEnd;
        bestIdx = i;
        shouldReverse = true;
      }
    }

    // Accept junction if within ~50 meters (~0.0005 deg)
    if (bestIdx === -1 || bestDist > 0.0005) {
      return null; // Discontinuity or gap in ways
    }

    const nextWay = remaining.splice(bestIdx, 1)[0]!;
    if (shouldReverse) {
      nextWay.reverse();
    }
    // Skip duplicate connect point
    for (let k = 1; k < nextWay.length; k++) {
      stitched.push(nextWay[k]!);
    }
  }

  return stitched;
}

/**
 * Attempts to load and stitch source Metro GeoJSON if available.
 */
function loadMetroSourceWays(lineId: string): [number, number][] | null {
  const candidatePaths = [
    resolve(METRO_GEOMETRY_DIR, `source_${lineId}.geojson`),
    resolve(METRO_GEOMETRY_DIR, `${lineId}.source.geojson`),
    resolve(METRO_GEOMETRY_DIR, `${lineId}.osm.geojson`),
  ];

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'));
        const ways: [number, number][][] = [];

        if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
          for (const feat of raw.features) {
            if (feat.geometry?.type === 'LineString') {
              ways.push(feat.geometry.coordinates);
            }
          }
        } else if (
          raw.type === 'Feature' &&
          raw.geometry?.type === 'LineString'
        ) {
          ways.push(raw.geometry.coordinates);
        } else if (
          raw.type === 'LineString' &&
          Array.isArray(raw.coordinates)
        ) {
          ways.push(raw.coordinates);
        }

        const stitched = stitchWays(ways);
        if (stitched && stitched.length >= 2) {
          return stitched;
        }
      } catch (err) {
        console.warn(
          `[metro] Failed reading source GeoJSON for ${lineId}:`,
          err,
        );
      }
    }
  }

  return null;
}

async function main(): Promise<void> {
  const isOffline =
    process.argv.includes('--offline') || process.argv.includes('-o');
  const osrmBaseUrl = process.env.OSRM_BASE_URL?.trim();

  if (!isOffline && !osrmBaseUrl) {
    console.error(
      'Error: OSRM_BASE_URL is unset and --offline was not passed.\n' +
        'Set OSRM_BASE_URL (e.g. export OSRM_BASE_URL=http://localhost:5000) for exact road routing,\n' +
        'or pass --offline to use estimated Bézier curves for bus corridors and schematic Catmull-Rom splines for metro.',
    );
    process.exit(1);
  }

  console.log(
    `Building geometry (mode: ${isOffline ? 'OFFLINE' : `ONLINE via ${osrmBaseUrl}`})...\n`,
  );

  const results: Array<{
    type: 'metro' | 'bus';
    id: string;
    file: string;
    quality: GeometryQuality;
    lengthMeters: number;
    vertexCount: number;
  }> = [];

  // ==========================================
  // 1. METRO GEOMETRY PIPELINE
  // ==========================================
  const metroData = JSON.parse(
    readFileSync(METRO_JSON_PATH, 'utf-8'),
  ) as MetroData;

  for (const line of metroData.lines) {
    let coordinates: [number, number][] | null = null;
    let quality: GeometryQuality = 'exact';

    const sourceStitched = loadMetroSourceWays(line.id);
    if (sourceStitched) {
      // Simplify with Douglas-Peucker at 2 m tolerance
      coordinates = douglasPeucker(sourceStitched, 2);
      quality = 'exact';
    } else {
      // Fallback: Catmull-Rom spline through station coordinates
      const stationCoords = line.stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
      }));
      const spline = catmullRomSpline(stationCoords, 10);
      coordinates = spline.coordinates;
      quality = 'schematic';
    }

    const lengthMeters =
      Math.round(coordinatesLengthMeters(coordinates) * 10) / 10;
    const outFile = resolve(METRO_GEOMETRY_DIR, `${line.id}.geojson`);

    const feature: GeometryFeature = {
      type: 'Feature',
      properties: {
        lineId: line.id,
        lineLabel: line.name,
        corridor: line.corridor,
        geometryQuality: quality,
        lengthMeters,
        stationCount: line.stations.length,
        generatedAt: new Date().toISOString(),
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    };

    writeFileSync(outFile, JSON.stringify(feature, null, 2) + '\n', 'utf-8');

    results.push({
      type: 'metro',
      id: line.id,
      file: `data/geometry/metro/${line.id}.geojson`,
      quality,
      lengthMeters,
      vertexCount: coordinates.length,
    });
  }

  // ==========================================
  // 2. BUS GEOMETRY PIPELINE
  // ==========================================
  const busData = JSON.parse(
    readFileSync(BUS_ROUTES_JSON_PATH, 'utf-8'),
  ) as BusRoutesData;

  for (const route of busData.routes) {
    const coordinates: [number, number][] = [];
    let quality: GeometryQuality = 'exact';

    if (isOffline || !osrmBaseUrl) {
      quality = 'estimated';
      for (let i = 0; i < route.stops.length - 1; i++) {
        const from = route.stops[i]!;
        const to = route.stops[i + 1]!;
        const bezier = bezierEstimate(
          { lat: from.lat, lng: from.lng },
          { lat: to.lat, lng: to.lng },
        );

        for (let k = i === 0 ? 0 : 1; k < bezier.coordinates.length; k++) {
          coordinates.push(bezier.coordinates[k]!);
        }
      }
    } else {
      try {
        for (let i = 0; i < route.stops.length - 1; i++) {
          const from = route.stops[i]!;
          const to = route.stops[i + 1]!;
          const segCoords = await fetchOsrmSegment(osrmBaseUrl, from, to);
          for (let k = i === 0 ? 0 : 1; k < segCoords.length; k++) {
            coordinates.push(segCoords[k]!);
          }
        }
        quality = 'exact';
      } catch (err) {
        console.warn(
          `[bus] OSRM routing failed for route ${route.routeNo}, falling back to Bézier:`,
          err,
        );
        coordinates.length = 0;
        quality = 'estimated';
        for (let i = 0; i < route.stops.length - 1; i++) {
          const from = route.stops[i]!;
          const to = route.stops[i + 1]!;
          const bezier = bezierEstimate(
            { lat: from.lat, lng: from.lng },
            { lat: to.lat, lng: to.lng },
          );
          for (let k = i === 0 ? 0 : 1; k < bezier.coordinates.length; k++) {
            coordinates.push(bezier.coordinates[k]!);
          }
        }
      }
    }

    const lengthMeters =
      Math.round(coordinatesLengthMeters(coordinates) * 10) / 10;
    const outFile = resolve(BUS_GEOMETRY_DIR, `${route.routeNo}.geojson`);

    const feature: GeometryFeature = {
      type: 'Feature',
      properties: {
        routeNo: route.routeNo,
        lineLabel: route.label,
        geometryQuality: quality,
        lengthMeters,
        stopCount: route.stops.length,
        generatedAt: new Date().toISOString(),
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    };

    writeFileSync(outFile, JSON.stringify(feature, null, 2) + '\n', 'utf-8');

    results.push({
      type: 'bus',
      id: route.routeNo,
      file: `data/geometry/bus/${route.routeNo}.geojson`,
      quality,
      lengthMeters,
      vertexCount: coordinates.length,
    });
  }

  // ==========================================
  // SUMMARY REPORT
  // ==========================================
  console.log('Geometry Generation Complete:');
  console.log(
    '-------------------------------------------------------------------------------------',
  );
  console.log(
    'Type'.padEnd(7) +
      'ID'.padEnd(16) +
      'Quality'.padEnd(12) +
      'Length (m)'.padEnd(14) +
      'Vertices'.padEnd(10) +
      'Output File',
  );
  console.log(
    '-------------------------------------------------------------------------------------',
  );
  for (const r of results) {
    console.log(
      r.type.padEnd(7) +
        r.id.padEnd(16) +
        r.quality.padEnd(12) +
        r.lengthMeters.toFixed(1).padEnd(14) +
        r.vertexCount.toString().padEnd(10) +
        r.file,
    );
  }
  console.log(
    '-------------------------------------------------------------------------------------',
  );
  console.log(`Total files generated: ${results.length}\n`);
}

main().catch((err) => {
  console.error('Fatal error during build-geometry:', err);
  process.exit(1);
});
