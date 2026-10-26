/**
 * Places search service with 24-hour in-memory cache and Nominatim fallback.
 * PRD Section 9.2, 12.1.
 */
import type { Place } from '@pocketroute/shared';

export interface PlaceSearchResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  source: 'local' | 'nominatim';
}

interface CacheEntry {
  data: PlaceSearchResult[];
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class PlacesSearchService {
  private cache = new Map<string, CacheEntry>();
  private places: Place[];
  private nominatimUrl: string;

  constructor(places: Place[], nominatimUrl?: string) {
    this.places = places;
    this.nominatimUrl =
      nominatimUrl ??
      process.env.NOMINATIM_URL ??
      'https://nominatim.openstreetmap.org';
  }

  /**
   * Searches places locally first, with Nominatim fallback if local matches are weak.
   */
  async search(query: string, limit = 8): Promise<PlaceSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const effectiveLimit = Math.max(1, Math.min(limit, 8));
    const cacheKey = `${q}:${effectiveLimit}`;

    // 1. Check in-memory 24-hour cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 2. Search local seed
    type PlaceWithCoords = Place & { lat: number; lng: number };
    const scored: Array<{ place: PlaceWithCoords; score: number }> = [];
    for (const p of this.places) {
      const nameLower = p.name.toLowerCase();
      let matchScore = 0;

      if (nameLower === q) {
        matchScore = 100;
      } else if (nameLower.startsWith(q)) {
        matchScore = 80;
      } else if (nameLower.includes(q)) {
        matchScore = 60;
      } else {
        for (const alias of p.aliases) {
          const aLower = alias.toLowerCase();
          if (aLower === q) {
            matchScore = Math.max(matchScore, 50);
          } else if (aLower.startsWith(q)) {
            matchScore = Math.max(matchScore, 40);
          } else if (aLower.includes(q)) {
            matchScore = Math.max(matchScore, 30);
          }
        }
      }

      if (matchScore > 0 && p.lat !== null && p.lng !== null) {
        scored.push({
          place: p as PlaceWithCoords,
          score: matchScore,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const localResults: PlaceSearchResult[] = scored
      .slice(0, effectiveLimit)
      .map(({ place }) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        source: 'local',
      }));

    // 3. Fallback to Nominatim if local matches are weak (< effectiveLimit)
    const finalResults = localResults;
    if (localResults.length < effectiveLimit) {
      const needed = effectiveLimit - localResults.length;
      try {
        const nominatimResults = await this.queryNominatim(q, needed);
        // Avoid duplicate coordinates
        for (const nr of nominatimResults) {
          const exists = finalResults.some(
            (r) =>
              Math.abs(r.lat - nr.lat) < 0.001 &&
              Math.abs(r.lng - nr.lng) < 0.001,
          );
          if (!exists && finalResults.length < effectiveLimit) {
            finalResults.push(nr);
          }
        }
      } catch {
        // Fallback gracefully if Nominatim network request times out or fails
      }
    }

    // 4. Cache results for 24 hours
    this.cache.set(cacheKey, {
      data: finalResults,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return finalResults;
  }

  /**
   * Queries OpenStreetMap Nominatim with a 2-second timeout bounded to Pune box.
   */
  private async queryNominatim(
    query: string,
    count: number,
  ): Promise<PlaceSearchResult[]> {
    const url = new URL('/search', this.nominatimUrl);
    url.searchParams.set('q', `${query}, Pune`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(count));
    // Pune bounding box viewbox: left,top,right,bottom -> minLng,maxLat,maxLng,minLat
    url.searchParams.set('viewbox', '73.70,18.70,74.00,18.40');
    url.searchParams.set('bounded', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const resp = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PocketRoute/1.0 (transit-planner)',
        },
      });

      if (!resp.ok) return [];

      interface NominatimItem {
        osm_id: number;
        display_name: string;
        lat: string;
        lon: string;
        type?: string;
      }

      const items = (await resp.json()) as NominatimItem[];
      return items.map((item) => ({
        id: `nom_${item.osm_id}`,
        name: item.display_name.split(',')[0]?.trim() || item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        category: item.type ?? 'landmark',
        source: 'nominatim',
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Clears the in-memory cache (useful for tests). */
  clearCache(): void {
    this.cache.clear();
  }
}
