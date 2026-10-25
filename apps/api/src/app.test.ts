import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProblemDetail } from '@pocketroute/shared';
import { buildApp } from './app.js';

describe('apps/api (Fastify integration tests)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build app with high limit so standard tests don't exhaust it
    app = await buildApp({
      rateLimitMax: 100,
      rateLimitTimeWindow: '1 minute',
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health (PRD §9.4)', () => {
    it('returns 200 with status, version, dataVersion, uptimeSec', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('0.0.0');
      expect(body.dataVersion).toBeDefined();
      expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/v1/network (PRD §9.3)', () => {
    it('returns network geometry with ETag, supporting 304 Not Modified', async () => {
      const res1 = await app.inject({
        method: 'GET',
        url: '/api/v1/network',
      });

      expect(res1.statusCode).toBe(200);
      const etag = res1.headers['etag'];
      expect(etag).toBeDefined();
      const body = JSON.parse(res1.body);
      expect(body.lines).toBeInstanceOf(Array);
      expect(body.corridors).toBeInstanceOf(Array);
      expect(body.stations).toBeInstanceOf(Array);

      // Verify ETag conditional request
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v1/network',
        headers: {
          'if-none-match': etag as string,
        },
      });

      expect(res2.statusCode).toBe(304);
      expect(res2.body).toBe('');
    });
  });

  describe('GET /api/v1/places/search (PRD §9.2)', () => {
    it('returns up to 8 matching places for query "swargate"', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/places/search?q=swargate&limit=5',
      });

      expect(res.statusCode).toBe(200);
      const places = JSON.parse(res.body);
      expect(places).toBeInstanceOf(Array);
      expect(places.length).toBeGreaterThan(0);
      expect(places.length).toBeLessThanOrEqual(5);
      expect(places[0].name.toLowerCase()).toContain('swargate');
      expect(places[0].source).toBe('local');
    });

    it('returns empty array when query is empty', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/places/search?q=',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });
  });

  describe('POST /api/v1/route/plan (PRD §9.1)', () => {
    const validPlanPayload = {
      origin: { lat: 18.5015, lng: 73.8542, label: 'Swargate' },
      destination: { lat: 18.5303, lng: 73.8488, label: 'Shivajinagar' },
      departureTime: '17:30',
      date: '2026-10-25',
      budgetINR: 75,
      options: {
        maxWalkM: 1200,
        includeAuto: true,
        includeCab: true,
      },
    };

    it('valid plan request returns 200 with three routes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: validPlanPayload,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.requestId).toBeDefined();
      expect(data.budgetINR).toBe(75);
      expect(data.routes.smart).toBeDefined();
      expect(data.routes.fastest).toBeDefined();
      expect(data.routes.cheapest).toBeDefined();
      expect(data.routes.smart.feasible).toBe(true);
      expect(data.routes.fastest.feasible).toBe(true);
      expect(data.routes.cheapest.feasible).toBe(true);
      expect(data.comparison).toBeDefined();

      // By default, metrics is null (includeMetrics off)
      expect(data.metrics).toBeNull();
    });

    it('includeMetrics=true includes the metrics block', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan?includeMetrics=true',
        payload: validPlanPayload,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.metrics).not.toBeNull();
      expect(data.metrics.pq).toBeDefined();
      expect(data.metrics.graph.B).toBe(75);
      expect(data.metrics.timing.runs).toBe(5);
      expect(data.metrics.timing.medianMs).toBeGreaterThan(0);
      expect(data.metrics.theory.routeA.bound).toBe('O(E*L*log(V*L))');
    });

    it('Budget 9 returns 400 problem+json', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: {
          ...validPlanPayload,
          budgetINR: 9,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const problem: ProblemDetail = JSON.parse(res.body);
      expect(problem.status).toBe(400);
      expect(problem.title).toBe('Validation Error');
      expect(problem.invalidParams).toBeDefined();
      expect(problem.invalidParams!.some((p) => p.name === 'budgetINR')).toBe(
        true,
      );
    });

    it('Budget 301 returns 400 problem+json', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: {
          ...validPlanPayload,
          budgetINR: 301,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const problem: ProblemDetail = JSON.parse(res.body);
      expect(problem.status).toBe(400);
      expect(problem.invalidParams!.some((p) => p.name === 'budgetINR')).toBe(
        true,
      );
    });

    it('Budget 74.5 (non-integer) returns 400 problem+json', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: {
          ...validPlanPayload,
          budgetINR: 74.5,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const problem: ProblemDetail = JSON.parse(res.body);
      expect(problem.status).toBe(400);
      expect(problem.invalidParams!.some((p) => p.name === 'budgetINR')).toBe(
        true,
      );
    });

    it('Coordinates outside Pune return 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: {
          ...validPlanPayload,
          origin: {
            lat: 19.076, // Mumbai coordinate (outside Pune 18.40-18.70)
            lng: 72.8777,
            label: 'Mumbai',
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const problem: ProblemDetail = JSON.parse(res.body);
      expect(problem.status).toBe(400);
      expect(
        problem.invalidParams!.some((p) => p.name.startsWith('origin')),
      ).toBe(true);
    });

    it('Departure time "now" uses current IST time', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload: {
          ...validPlanPayload,
          departureTime: 'now',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.routes.fastest.feasible).toBe(true);
    });
  });

  describe('Rate Limiting (PRD §9.5)', () => {
    it('Rate limit returns 429 after exceeding limit on a dedicated app instance', async () => {
      // Create dedicated app with limit = 2
      const rateLimitedApp = await buildApp({
        rateLimitMax: 2,
        rateLimitTimeWindow: '1 minute',
        logger: false,
      });
      await rateLimitedApp.ready();

      const payload = {
        origin: { lat: 18.5015, lng: 73.8542, label: 'Swargate' },
        destination: { lat: 18.5303, lng: 73.8488, label: 'Shivajinagar' },
        departureTime: '17:30',
        budgetINR: 75,
      };

      // Request 1: OK
      const res1 = await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload,
      });
      expect(res1.statusCode).toBe(200);

      // Request 2: OK
      const res2 = await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload,
      });
      expect(res2.statusCode).toBe(200);

      // Request 3: 429 Too Many Requests
      const res3 = await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/v1/route/plan',
        payload,
      });
      expect(res3.statusCode).toBe(429);
      expect(res3.headers['content-type']).toContain(
        'application/problem+json',
      );
      const problem: ProblemDetail = JSON.parse(res3.body);
      expect(problem.status).toBe(429);
      expect(problem.title).toBe('Too Many Requests');

      await rateLimitedApp.close();
    });
  });
});
