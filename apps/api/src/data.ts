/**
 * Pune Data Pack loader and validator.
 * PRD Sections 5, 9, 10, 16.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type {
  BusRoutesData,
  FareTables,
  MetroData,
  ParamsData,
  PlacesData,
} from '@pocketroute/shared';
import {
  busRoutesDataSchema,
  fareTablesSchema,
  metroDataSchema,
  paramsDataSchema,
  placesDataSchema,
} from '@pocketroute/shared';
import { buildStaticGraph, type StaticGraphResult } from '@pocketroute/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PuneDataPack {
  metro: MetroData;
  bus: BusRoutesData;
  fares: FareTables;
  places: PlacesData;
  params: ParamsData;
  staticGraph: StaticGraphResult;
  networkResponse: NetworkResponsePayload;
  networkEtag: string;
}

export interface NetworkLine {
  id: string;
  name: string;
  mode: 'METRO' | 'BUS';
  color: string;
  geometry: unknown;
  stations: unknown[];
}

export interface NetworkResponsePayload {
  lines: NetworkLine[];
  corridors: Array<{
    id: string;
    routeNo: string;
    label: string;
    mode: 'BUS';
    color: string;
    geometry: unknown;
    stops: unknown[];
  }>;
  stations: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: 'metro_station' | 'bus_stop';
    lineId: string;
  }>;
}

/**
 * Resolves the root directory containing data/.
 */
function resolveRootDir(customDataDir?: string): string {
  if (customDataDir) return customDataDir;
  // Look for data relative to this package or monorepo root
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(__dirname, '../../../data'),
    path.resolve(__dirname, '../../../../data'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'data');
}

/**
 * Loads and validates a JSON file against a Zod schema, failing fast with readable errors.
 */
function loadAndValidate<T>(
  filePath: string,
  schema: {
    safeParse: (data: unknown) => {
      success: boolean;
      data?: unknown;
      error?: { issues: Array<{ path: unknown[]; message: string }> };
    };
  },
  label: string,
): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data pack file missing: ${filePath} (${label})`);
  }

  let raw: unknown;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON for ${label} at ${filePath}: ${String(err)}`,
    );
  }

  const result = schema.safeParse(raw);
  if (!result.success && result.error) {
    const issueDetails = result.error.issues
      .map(
        (i) => `  - [${i.path.map(String).join('.') || 'root'}]: ${i.message}`,
      )
      .join('\n');
    throw new Error(
      `Data pack schema validation failed for ${label} (${filePath}):\n${issueDetails}`,
    );
  }

  return result.data as T;
}

/**
 * Loads GeoJSON if present, returning null on error or absence.
 */
function tryLoadGeoJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Loads and validates the complete Pune data pack once at startup.
 */
export function loadPuneDataPack(customDataDir?: string): PuneDataPack {
  const dataDir = resolveRootDir(customDataDir);
  const puneDir = path.join(dataDir, 'pune');
  const geomDir = path.join(dataDir, 'geometry');

  // 1. Validate and load all 5 JSON configuration files
  const metro = loadAndValidate<MetroData>(
    path.join(puneDir, 'metro.json'),
    metroDataSchema,
    'Metro Data',
  );

  const bus = loadAndValidate<BusRoutesData>(
    path.join(puneDir, 'bus_routes.json'),
    busRoutesDataSchema,
    'Bus Routes Data',
  );

  const fares = loadAndValidate<FareTables>(
    path.join(puneDir, 'fares.json'),
    fareTablesSchema,
    'Fares Table',
  );

  const places = loadAndValidate<PlacesData>(
    path.join(puneDir, 'places.json'),
    placesDataSchema,
    'Places Data',
  );

  const params = loadAndValidate<ParamsData>(
    path.join(puneDir, 'params.json'),
    paramsDataSchema,
    'Params Data',
  );

  // 2. Build static graph for multi-modal routing engine
  const staticGraph = buildStaticGraph({ metro, bus });

  // 3. Assemble network response payload
  const purpleGeo = tryLoadGeoJson(
    path.join(geomDir, 'metro', 'METRO_PURPLE.geojson'),
  );
  const aquaGeo = tryLoadGeoJson(
    path.join(geomDir, 'metro', 'METRO_AQUA.geojson'),
  );

  const lines: NetworkLine[] = [
    {
      id: 'METRO_PURPLE',
      name: 'Purple Line (PCMC to Swargate)',
      mode: 'METRO',
      color: '#7C3AED',
      geometry: purpleGeo,
      stations:
        metro.lines.find((l) => l.id === 'METRO_PURPLE')?.stations ?? [],
    },
    {
      id: 'METRO_AQUA',
      name: 'Aqua Line (Vanaz to Ramwadi)',
      mode: 'METRO',
      color: '#0891B2',
      geometry: aquaGeo,
      stations: metro.lines.find((l) => l.id === 'METRO_AQUA')?.stations ?? [],
    },
  ];

  const corridors = bus.routes.map((r) => {
    const geo = tryLoadGeoJson(
      path.join(geomDir, 'bus', `${r.routeNo}.geojson`),
    );
    return {
      id: `BUS_${r.routeNo}`,
      routeNo: r.routeNo,
      label: r.label,
      mode: 'BUS' as const,
      color: '#059669',
      geometry: geo,
      stops: r.stops,
    };
  });

  const stations: NetworkResponsePayload['stations'] = [];
  for (const line of metro.lines) {
    for (const st of line.stations) {
      stations.push({
        id: st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        type: 'metro_station',
        lineId: line.id,
      });
    }
  }

  for (const r of bus.routes) {
    for (const st of r.stops) {
      stations.push({
        id: st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        type: 'bus_stop',
        lineId: `BUS_${r.routeNo}`,
      });
    }
  }

  const networkResponse: NetworkResponsePayload = {
    lines,
    corridors,
    stations,
  };

  const networkJson = JSON.stringify(networkResponse);
  const networkEtag = `W/"${createHash('sha256').update(networkJson).digest('hex').slice(0, 16)}"`;

  return {
    metro,
    bus,
    fares,
    places,
    params,
    staticGraph,
    networkResponse,
    networkEtag,
  };
}
