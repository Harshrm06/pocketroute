import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BusRoutesData, MetroData, NetworkData } from './types.js';

let cachedNetwork: NetworkData | null = null;

/**
 * Loads the default Pune network (metro and bus routes) from the data/pune directory.
 */
export function loadNetworkFromFile(
  metroPath?: string,
  busPath?: string,
): NetworkData {
  const resolvedMetroPath =
    metroPath ??
    fileURLToPath(new URL('../../../../data/pune/metro.json', import.meta.url));
  const resolvedBusPath =
    busPath ??
    fileURLToPath(
      new URL('../../../../data/pune/bus_routes.json', import.meta.url),
    );

  const metroRaw = fs.readFileSync(resolvedMetroPath, 'utf-8');
  const busRaw = fs.readFileSync(resolvedBusPath, 'utf-8');

  const metro = JSON.parse(metroRaw) as MetroData;
  const bus = JSON.parse(busRaw) as BusRoutesData;

  return { metro, bus };
}

/**
 * Retrieves the cached default network, loading it from disk if not yet loaded.
 */
export function getDefaultNetwork(): NetworkData {
  if (!cachedNetwork) {
    cachedNetwork = loadNetworkFromFile();
  }
  return cachedNetwork;
}
