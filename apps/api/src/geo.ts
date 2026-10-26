/**
 * Reverse geocoding service with 24-hour in-memory cache, 1 req/sec throttle,
 * 2s timeout, and graceful fallback to Current Location (<lat>, <lng>).
 * PRD Section 22.2.
 */
export interface ReverseGeocodeResult {
  displayName: string;
  areaName: string;
  lat: number;
  lng: number;
  source: 'cache' | 'nominatim' | 'fallback';
}

interface CacheEntry {
  data: ReverseGeocodeResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class ReverseGeocodingService {
  private cache = new Map<string, CacheEntry>();
  private lastRequestTime = 0;
  private userAgent: string;
  private nominatimUrl: string;

  constructor(nominatimUrl?: string, userAgent?: string) {
    this.nominatimUrl =
      nominatimUrl ??
      process.env.NOMINATIM_REVERSE_URL ??
      'https://nominatim.openstreetmap.org/reverse';
    this.userAgent =
      userAgent ??
      process.env.NOMINATIM_USER_AGENT ??
      'PocketRoute-Pune/1.1 (transit-optimizer@pocketroute.local)';
  }

  async reverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    const latRounded = Number(lat.toFixed(4));
    const lngRounded = Number(lng.toFixed(4));
    const cacheKey = `${latRounded.toFixed(4)},${lngRounded.toFixed(4)}`;

    // 1. Check in-memory 24-hour cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.data, source: 'cache' };
    }

    const fallbackCoordStr = `${latRounded.toFixed(4)}, ${lngRounded.toFixed(4)}`;
    const fallbackResult: ReverseGeocodeResult = {
      displayName: `Current Location (${fallbackCoordStr})`,
      areaName: fallbackCoordStr,
      lat,
      lng,
      source: 'fallback',
    };

    // 2. Throttle to 1 request per second
    const now = Date.now();
    const waitMs = Math.max(0, 1000 - (now - this.lastRequestTime));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestTime = Date.now();

    // 3. Fetch Nominatim with 2s timeout
    try {
      const url = new URL(this.nominatimUrl);
      url.searchParams.set('format', 'json');
      url.searchParams.set('lat', lat.toString());
      url.searchParams.set('lon', lng.toString());

      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) {
        this.cache.set(cacheKey, {
          data: fallbackResult,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return fallbackResult;
      }

      const data = (await res.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };

      const address = data.address || {};
      const areaName =
        address.suburb ||
        address.neighbourhood ||
        address.city_district ||
        address.quarter ||
        address.residential ||
        address.village ||
        address.town ||
        address.city ||
        (data.display_name
          ? data.display_name.split(',')[0]?.trim() || fallbackCoordStr
          : fallbackCoordStr);

      const result: ReverseGeocodeResult = {
        displayName: `Current Location (${areaName})`,
        areaName,
        lat,
        lng,
        source: 'nominatim',
      };

      this.cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return result;
    } catch {
      // Timeout, network error, or parse failure: cache fallback so repeated queries are served from cache
      this.cache.set(cacheKey, {
        data: fallbackResult,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return fallbackResult;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Hybrid Geo Search (PRD Section 23 & Step 4)
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type {
  GeoSearchResult,
  GeoSearchResponse,
  Place,
} from '@pocketroute/shared';

export const geoSearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

export interface TransitStopRef {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface GeoSearchCacheEntry {
  data: GeoSearchResult[];
  expiresAt: number;
}

let globalLastNominatimRequestTime = 0;

export function resetGlobalNominatimThrottle(): void {
  globalLastNominatimRequestTime = 0;
}

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]!
          : Math.min(row[j - 1]!, row[j]!, prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length]!;
}

// Bounding box for Pune and PCMC (Step 4c/4d)
export const PUNE_PCMC_BBOX = {
  minLat: 18.4,
  maxLat: 18.72,
  minLng: 73.65,
  maxLng: 74.05,
};

export class GeoSearchService {
  private places: Place[];
  private transitStops: TransitStopRef[];
  private nominatimUrl: string;
  private userAgent: string;
  private osmCache = new Map<string, GeoSearchCacheEntry>();

  constructor(
    places: Place[],
    transitStops: TransitStopRef[] = [],
    nominatimUrl?: string,
    userAgent?: string,
  ) {
    this.places = places;
    this.transitStops = transitStops;
    this.nominatimUrl =
      nominatimUrl ??
      process.env.NOMINATIM_URL ??
      'https://nominatim.openstreetmap.org';
    this.userAgent =
      userAgent ??
      process.env.NOMINATIM_USER_AGENT ??
      'PocketRoute/1.2.0 (contact@pocketroute.example)';
  }

  private isInsideBbox(lat: number, lng: number): boolean {
    return (
      lat >= PUNE_PCMC_BBOX.minLat &&
      lat <= PUNE_PCMC_BBOX.maxLat &&
      lng >= PUNE_PCMC_BBOX.minLng &&
      lng <= PUNE_PCMC_BBOX.maxLng
    );
  }

  private findMatchingTransitStop(
    name: string,
    lat: number,
    lng: number,
  ): string | undefined {
    const normName = normalizeSearchText(name);
    // 1. Check exact or very close name match
    for (const stop of this.transitStops) {
      if (normalizeSearchText(stop.name) === normName) {
        return stop.id;
      }
    }
    // 2. Check spatial proximity within 150m
    let closestStopId: string | undefined;
    let closestDistM = 150;
    for (const stop of this.transitStops) {
      const dist = haversineDistanceM(lat, lng, stop.lat, stop.lng);
      if (dist <= closestDistM) {
        closestDistM = dist;
        closestStopId = stop.id;
      }
    }
    return closestStopId;
  }

  /**
   * Tier 1 (instant local): Fuzzy match against places.json
   */
  searchTier1(query: string, limit = 8): GeoSearchResult[] {
    const normQ = normalizeSearchText(query);
    if (!normQ) return [];

    const qTokens = normQ.split(/\s+/).filter(Boolean);
    type PlaceWithCoords = Place & { lat: number; lng: number };

    const scored: Array<{ place: PlaceWithCoords; score: number }> = [];

    for (const p of this.places) {
      // Exclude null-coordinate places from routing/search
      if (p.lat === null || p.lng === null) continue;
      if (!this.isInsideBbox(p.lat, p.lng)) continue;

      const normName = normalizeSearchText(p.name);
      const nameTokens = normName.split(/\s+/).filter(Boolean);
      let bestScore = 0;

      // Check name match
      if (normName === normQ) {
        bestScore = Math.max(bestScore, 100);
      } else if (normName.startsWith(normQ)) {
        bestScore = Math.max(bestScore, 85);
      } else if (normName.includes(normQ)) {
        bestScore = Math.max(bestScore, 70);
      } else if (
        qTokens.length > 0 &&
        qTokens.every((qt) => nameTokens.some((nt) => nt.startsWith(qt)))
      ) {
        bestScore = Math.max(bestScore, 75);
      } else {
        // Fallback: edit distance <= 2
        const ed = levenshtein(normQ, normName);
        if (ed <= 2) {
          bestScore = Math.max(bestScore, 60 - ed * 5);
        } else if (qTokens.length === 1 && normQ.length >= 3) {
          for (const nt of nameTokens) {
            const tokenEd = levenshtein(normQ, nt);
            if (tokenEd <= 2) {
              bestScore = Math.max(bestScore, 50 - tokenEd * 5);
              break;
            }
          }
        }
      }

      // Check aliases match
      for (const alias of p.aliases || []) {
        const normAlias = normalizeSearchText(alias);
        const aliasTokens = normAlias.split(/\s+/).filter(Boolean);

        if (normAlias === normQ) {
          bestScore = Math.max(bestScore, 95);
        } else if (normAlias.startsWith(normQ)) {
          bestScore = Math.max(bestScore, 80);
        } else if (normAlias.includes(normQ)) {
          bestScore = Math.max(bestScore, 65);
        } else if (
          qTokens.length > 0 &&
          qTokens.every((qt) => aliasTokens.some((at) => at.startsWith(qt)))
        ) {
          bestScore = Math.max(bestScore, 70);
        } else {
          const ed = levenshtein(normQ, normAlias);
          if (ed <= 2) {
            bestScore = Math.max(bestScore, 55 - ed * 5);
          }
        }
      }

      if (bestScore > 0) {
        scored.push({
          place: p as PlaceWithCoords,
          score: bestScore,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ place }) => {
      const transitStopId = this.findMatchingTransitStop(
        place.name,
        place.lat,
        place.lng,
      );
      return {
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        source: 'local' as const,
        ...(transitStopId ? { transitStopId } : {}),
      };
    });
  }

  /**
   * Tier 2 (live OSM Nominatim search with rate limit, 24h cache, 2s timeout)
   */
  async searchTier2(query: string, limit = 8): Promise<GeoSearchResult[]> {
    const normQ = normalizeSearchText(query);
    if (!normQ) return [];

    const cached = this.osmCache.get(normQ);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // Process-wide throttle: at most 1 req/sec
    const now = Date.now();
    const waitMs = Math.max(0, 1000 - (now - globalLastNominatimRequestTime));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    globalLastNominatimRequestTime = Date.now();

    const url = new URL('/search', this.nominatimUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('bounded', '1');
    url.searchParams.set('viewbox', '73.65,18.72,74.05,18.40');

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      throw new Error(`Nominatim responded with status ${res.status}`);
    }

    interface NominatimV2Item {
      place_id: number;
      osm_id: number;
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
    }

    const items = (await res.json()) as NominatimV2Item[];
    const osmResults: GeoSearchResult[] = [];

    for (const item of items) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);

      if (isNaN(lat) || isNaN(lng)) continue;
      if (!this.isInsideBbox(lat, lng)) continue;

      const displayName =
        item.name ||
        item.display_name.split(',')[0]?.trim() ||
        item.display_name;

      const transitStopId = this.findMatchingTransitStop(displayName, lat, lng);

      osmResults.push({
        id: `osm_${item.osm_id || item.place_id}`,
        name: displayName,
        lat,
        lng,
        source: 'osm' as const,
        ...(transitStopId ? { transitStopId } : {}),
      });
    }

    // Cache 24 hours in LRU
    if (this.osmCache.size > 500) {
      const firstKey = this.osmCache.keys().next().value;
      if (firstKey) this.osmCache.delete(firstKey);
    }
    this.osmCache.set(normQ, {
      data: osmResults,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return osmResults;
  }

  /**
   * Hybrid search: Tier 1 first, then Tier 2, deduplicated by coordinates within 50 meters.
   * If live search fails or is offline, returns Tier 1 with liveSearch: "unavailable".
   */
  async search(query: string, limit = 8): Promise<GeoSearchResponse> {
    const tier1Results = this.searchTier1(query, limit);

    let tier2Results: GeoSearchResult[] = [];
    let liveSearch: 'available' | 'unavailable' = 'available';

    try {
      tier2Results = await this.searchTier2(query, limit);
    } catch {
      liveSearch = 'unavailable';
    }

    // Deduplicate: Tier 1 results first, then Tier 2 if not within 50 meters of any existing
    const merged: GeoSearchResult[] = [...tier1Results];

    for (const t2 of tier2Results) {
      const isDuplicate = merged.some(
        (existing) =>
          haversineDistanceM(t2.lat, t2.lng, existing.lat, existing.lng) <= 50,
      );
      if (!isDuplicate) {
        merged.push(t2);
      }
    }

    return {
      results: merged.slice(0, limit),
      liveSearch,
    };
  }

  clearCache(): void {
    this.osmCache.clear();
  }
}
