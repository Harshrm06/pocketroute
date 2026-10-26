import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GeoSearchService, resetGlobalNominatimThrottle } from './geo.js';
import { buildApp } from './app.js';
import type { Place } from '@pocketroute/shared';

describe('GeoSearchService and /api/v1/geo/search (Step 4)', () => {
  let app: FastifyInstance;

  const mockPlaces: Place[] = [
    {
      id: 'pl_swargate',
      name: 'Swargate Bus Stand',
      aliases: ['Swargate ST', 'Swargate Depot'],
      lat: 18.5015,
      lng: 73.8542,
      category: 'transit',
    },
    {
      id: 'pl_vit',
      name: 'Vishwakarma Institute of Technology',
      aliases: ['VIT', 'VIT Pune', 'VIT Bibwewadi'],
      lat: 18.4636,
      lng: 73.8682,
      category: 'education',
    },
    {
      id: 'pl_out_of_bounds',
      name: 'Mumbai Gateway',
      aliases: ['Gateway of India'],
      lat: 18.922,
      lng: 72.8347,
      category: 'landmark',
    },
    {
      id: 'pl_null_coords',
      name: 'Saswad Road Rural Outpost',
      aliases: ['Saswad Rural'],
      lat: null,
      lng: null,
      category: 'landmark',
    },
  ];

  const mockTransitStops = [
    {
      id: 'b140_swargate',
      name: 'Swargate',
      lat: 18.5016,
      lng: 73.8543,
    },
    {
      id: 'b140_bibwewadi',
      name: 'Bibwewadi',
      lat: 18.4695,
      lng: 73.8637,
    },
  ];

  beforeEach(async () => {
    resetGlobalNominatimThrottle();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Tier 1 instant local search & bounding box filtering', () => {
    it('finds local matches with token prefix and diacritics normalized', () => {
      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const res = service.searchTier1('VIT Pune');
      expect(res.length).toBeGreaterThan(0);
      expect(res[0]?.name).toBe('Vishwakarma Institute of Technology');
      expect(res[0]?.source).toBe('local');
    });

    it('attaches transitStopId when place matches transit stop within 150m', () => {
      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const res = service.searchTier1('Swargate');
      expect(res.length).toBeGreaterThan(0);
      expect(res[0]?.transitStopId).toBe('b140_swargate');
    });

    it('does not attach transitStopId for non-stop landmarks like VIT', () => {
      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const res = service.searchTier1('VIT');
      expect(res.length).toBeGreaterThan(0);
      expect(res[0]?.transitStopId).toBeUndefined();
    });

    it('excludes null-coordinate places and places outside Pune bounding box', () => {
      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const resNull = service.searchTier1('Saswad');
      expect(resNull.length).toBe(0);

      const resOut = service.searchTier1('Mumbai');
      expect(resOut.length).toBe(0);
    });
  });

  describe('Tier 2 live OSM Nominatim search with mocked upstream', () => {
    it('falls back to Tier 1 with liveSearch: "unavailable" when Nominatim fails', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new Error('Network error (mocked offline)'));
      vi.stubGlobal('fetch', fetchMock);

      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const result = await service.search('VIT');

      expect(result.liveSearch).toBe('unavailable');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]?.name).toBe(
        'Vishwakarma Institute of Technology',
      );
      expect(result.results[0]?.source).toBe('local');
    });

    it('filters out upstream results outside Pune and PCMC bounding box', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            place_id: 101,
            osm_id: 1001,
            name: 'VIT College Pune',
            display_name: 'VIT College, Bibwewadi, Pune',
            lat: '18.4638',
            lon: '73.8685',
          },
          {
            place_id: 102,
            osm_id: 1002,
            name: 'VIT Vellore',
            display_name: 'VIT Vellore, Tamil Nadu',
            lat: '12.9692',
            lon: '79.1559',
          },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const result = await service.search('VIT');

      expect(result.liveSearch).toBe('available');
      // Should contain the in-bounds result and NOT the Vellore result
      const vellore = result.results.find((r) => r.name.includes('Vellore'));
      expect(vellore).toBeUndefined();
    });

    it('caches OSM responses for identical queries', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            place_id: 201,
            osm_id: 2001,
            name: 'Fergusson College Gate',
            display_name: 'Fergusson College Gate, FC Road, Pune',
            lat: '18.5204',
            lon: '73.8415',
          },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const res1 = await service.search('fergusson');
      const res2 = await service.search('fergusson');

      expect(res1.results.length).toBeGreaterThan(0);
      expect(res2.results.length).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deduplicates results within 50 meters', async () => {
      // Return a result ~10 meters from local Swargate (18.5015, 73.8542)
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            place_id: 301,
            osm_id: 3001,
            name: 'Swargate ST Stand OSM',
            display_name: 'Swargate ST Stand OSM, Pune',
            lat: '18.50155',
            lon: '73.85425',
          },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = new GeoSearchService(mockPlaces, mockTransitStops);
      const result = await service.search('Swargate');

      // The local result is first; the OSM result within 50m should be deduplicated
      const osmMatches = result.results.filter((r) => r.source === 'osm');
      expect(osmMatches.length).toBe(0);
    });
  });

  describe('Fastify /api/v1/geo/search integration tests', () => {
    beforeEach(async () => {
      app = await buildApp({ logger: false });
      await app.ready();
    });

    it('validates query: returns 400 when q is less than 2 characters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/geo/search?q=a',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Validation Error');
    });

    it('validates query: returns 400 when limit exceeds 10', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/geo/search?q=swargate&limit=25',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('Validation Error');
    });

    it('returns 200 with results and liveSearch flag for valid search query', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/geo/search?q=swargate&limit=5',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.results).toBeInstanceOf(Array);
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.liveSearch).toBeDefined();
    });
  });
});
