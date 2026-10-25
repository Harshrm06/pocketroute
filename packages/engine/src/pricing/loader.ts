import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fareTablesSchema, type FareTables } from '@pocketroute/shared';

let defaultFareTable: FareTables | null = null;

/**
 * Validates raw fare data against fareTablesSchema.
 */
export function loadFares(raw: unknown): FareTables {
  return fareTablesSchema.parse(raw);
}

/**
 * Loads and validates fare tables from a JSON file.
 * Defaults to data/pune/fares.json in the project root.
 */
export function loadFaresFromFile(filePath?: string): FareTables {
  const resolvedPath =
    filePath ??
    fileURLToPath(new URL('../../../../data/pune/fares.json', import.meta.url));
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const json = JSON.parse(content) as unknown;
  return loadFares(json);
}

/**
 * Retrieves the cached default fare table, loading it if necessary.
 */
export function getDefaultFares(): FareTables {
  if (!defaultFareTable) {
    defaultFareTable = loadFaresFromFile();
  }
  return defaultFareTable;
}

/**
 * Overrides the default fare table in-memory (useful for testing or custom configs).
 */
export function setDefaultFares(fares: FareTables): void {
  defaultFareTable = fares;
}
