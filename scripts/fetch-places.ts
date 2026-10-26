/**
 * scripts/fetch-places.ts
 *
 * Fetches place coordinates from Nominatim when network is available.
 * If network is blocked / offline, writes entries with coordinates set to null
 * and "verified": false, excluding null-coordinate entries from routing.
 * PRD §23 & Step 4f.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PlaceEntry {
  id: string;
  name: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  category: string;
  verified?: boolean;
  notes?: string;
}

interface PlacesFile {
  effectiveFrom: string;
  source?: string;
  places: PlaceEntry[];
}

const PLACES_PATH = resolve(process.cwd(), 'data/pune/places.json');
const NOMINATIM_BASE =
  process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ??
  'PocketRoute-Transit/1.2.0 (contact@pocketroute.example)';

async function fetchFromNominatim(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('/search', NOMINATIM_BASE);
  url.searchParams.set('q', `${query}, Pune, India`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('viewbox', '73.65,18.72,74.05,18.40');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const items = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (items.length > 0 && items[0]) {
      const lat = parseFloat(items[0].lat);
      const lng = parseFloat(items[0].lon);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('Loading data/pune/places.json...');
  const data: PlacesFile = JSON.parse(readFileSync(PLACES_PATH, 'utf-8'));
  console.log(`Current places count: ${data.places.length}`);

  let updatedCount = 0;
  let nullCount = 0;

  for (const place of data.places) {
    if (place.lat === null || place.lng === null) {
      console.log(`Resolving coordinates for ${place.name}...`);
      const coords = await fetchFromNominatim(place.name);
      if (coords) {
        place.lat = coords.lat;
        place.lng = coords.lng;
        place.verified = false;
        place.notes = 'Fetched from Nominatim OSM';
        updatedCount++;
        console.log(`  -> Found: ${coords.lat}, ${coords.lng}`);
      } else {
        place.verified = false;
        place.notes =
          'Coordinates unverified; network unavailable or not found';
        nullCount++;
        console.log(
          `  -> Unresolved; keeping lat/lng as null (excluded from routing)`,
        );
      }
      // Respect 1 req/sec rate limit
      await new Promise((r) => setTimeout(r, 1050));
    }
  }

  writeFileSync(PLACES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(
    `Places file updated. Resolved: ${updatedCount}, Null remaining: ${nullCount}. Total places: ${data.places.length}`,
  );
}

main().catch((err) => {
  console.error('fetch-places error:', err);
  process.exit(1);
});
