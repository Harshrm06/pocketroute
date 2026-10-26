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
      // Timeout, network error, or parse failure: fallback gracefully without throwing
      return fallbackResult;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
