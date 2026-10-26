/**
 * Fastify API application setup for PocketRoute.
 * PRD Sections 9, 12.1, 16.
 */
import { randomUUID } from 'node:crypto';
import fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
} from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { planRequestSchema, type ProblemDetail } from '@pocketroute/shared';
import { planRoutes } from '@pocketroute/engine';
import { loadPuneDataPack, type PuneDataPack } from './data.js';
import { PlacesSearchService } from './places.js';
import {
  ReverseGeocodingService,
  GeoSearchService,
  geoSearchQuerySchema,
  type TransitStopRef,
} from './geo.js';

export interface AppOptions {
  dataDir?: string;
  dataPack?: PuneDataPack;
  rateLimitMax?: number;
  rateLimitTimeWindow?: string;
  corsOrigin?: string;
  nominatimUrl?: string;
  logger?: boolean | object;
}

/**
 * Converts departureTime ("HH:mm" or "now") and optional date ("YYYY-MM-DD")
 * to minutes since midnight IST using Intl with timeZone "Asia/Kolkata".
 * PRD Section 9.1 & Task Requirement 4.
 */
export function resolveDepartureMinutesIST(
  departureTime: string,
  nowDate = new Date(),
): number {
  if (departureTime === 'now') {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(nowDate);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }

  // Parse "HH:mm"
  const [hStr, mStr] = departureTime.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

/**
 * Builds and configures the Fastify application instance.
 */
export async function buildApp(
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const startTime = Date.now();

  // 1. Load data pack once at startup (fail-fast if invalid)
  const dataPack = options.dataPack ?? loadPuneDataPack(options.dataDir);
  const placesService = new PlacesSearchService(
    dataPack.places.places,
    options.nominatimUrl,
  );
  const geoService = new ReverseGeocodingService(options.nominatimUrl);

  // Collect transit stops for stop ID resolution in geo search
  const transitStops: TransitStopRef[] = [];
  const seenStopIds = new Set<string>();

  for (const line of dataPack.metro.lines) {
    for (const st of line.stations) {
      if (!seenStopIds.has(st.id)) {
        seenStopIds.add(st.id);
        transitStops.push({
          id: st.id,
          name: st.name,
          lat: st.lat,
          lng: st.lng,
        });
      }
    }
  }

  for (const route of dataPack.bus.routes) {
    for (const st of route.stops) {
      if (!seenStopIds.has(st.id)) {
        seenStopIds.add(st.id);
        transitStops.push({
          id: st.id,
          name: st.name,
          lat: st.lat,
          lng: st.lng,
        });
      }
    }
  }

  const geoSearchService = new GeoSearchService(
    dataPack.places.places,
    transitStops,
    options.nominatimUrl,
  );

  const app = fastify({
    bodyLimit: 8192, // 8 KB limit per PRD §9.5
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const headerVal = req.headers['x-request-id'];
      if (typeof headerVal === 'string' && headerVal.trim().length > 0) {
        return headerVal.trim();
      }
      return randomUUID();
    },
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // 2. Register Helmet security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // MapLibre vector maps need remote tiles/styles
  });

  // 3. Register CORS
  const allowedOrigin = options.corsOrigin ?? process.env.CORS_ORIGIN ?? '*';
  await app.register(fastifyCors, {
    origin: allowedOrigin === '*' ? true : allowedOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // 4. Register Rate Limit
  const rateLimitMax =
    options.rateLimitMax ?? Number(process.env.RATE_LIMIT_PER_MIN ?? 300);
  const timeWindow = options.rateLimitTimeWindow ?? '1 minute';

  await app.register(fastifyRateLimit, {
    max: rateLimitMax,
    timeWindow,
    errorResponseBuilder: (_req, context) => {
      const problem: ProblemDetail = {
        type: 'https://pocketroute.example/errors/rate-limit',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit of ${context.max} requests per ${context.after} exceeded. Try again later.`,
      };
      return problem;
    },
  });

  // 5. Custom RFC 7807 problem+json error handler
  app.setErrorHandler((error, request, reply) => {
    reply.type('application/problem+json');
    const status =
      error.statusCode ?? (error as { status?: number }).status ?? 500;

    // Rate limit 429
    if (status === 429) {
      const problem: ProblemDetail = {
        type: 'https://pocketroute.example/errors/rate-limit',
        title: 'Too Many Requests',
        status: 429,
        detail:
          (error as { detail?: string }).detail ||
          error.message ||
          'Rate limit exceeded.',
      };
      return reply.status(429).send(problem);
    }

    // Payload too large 413
    if (status === 413) {
      const problem: ProblemDetail = {
        type: 'https://pocketroute.example/errors/payload-too-large',
        title: 'Payload Too Large',
        status: 413,
        detail: 'Request body exceeds the maximum allowable limit of 8 KB.',
      };
      return reply.status(413).send(problem);
    }

    // Validation / Bad Request 400
    if (status === 400 || error.validation) {
      const problem: ProblemDetail = {
        type: 'https://pocketroute.example/errors/validation-error',
        title: 'Invalid Request',
        status: 400,
        detail: error.message || 'Request validation failed.',
      };
      return reply.status(400).send(problem);
    }

    // Internal server error 500
    request.log.error(error);
    const problem: ProblemDetail = {
      type: 'https://pocketroute.example/errors/internal-error',
      title: 'Internal Server Error',
      status: status >= 400 ? status : 500,
      detail:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred while processing your request.'
          : error.message,
    };
    return reply.status(problem.status).send(problem);
  });

  // 6. 404 handler returning problem+json
  app.setNotFoundHandler((request, reply) => {
    reply.type('application/problem+json');
    const problem: ProblemDetail = {
      type: 'https://pocketroute.example/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found.`,
    };
    return reply.status(404).send(problem);
  });

  // -------------------------------------------------------------------------
  // Routes: /api/v1
  // -------------------------------------------------------------------------
  const v1Plugin: FastifyPluginAsync = async (v1) => {
    // POST /api/v1/route/plan
    v1.post<{
      Querystring: { includeMetrics?: string };
    }>(
      '/route/plan',
      {
        config: {
          rateLimit: {
            max: rateLimitMax,
            timeWindow,
          },
        },
      },
      async (req, reply) => {
        // Validate request body using Zod schema
        const parseResult = planRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          reply.type('application/problem+json');
          const invalidParams = parseResult.error.issues.map((issue) => ({
            name: issue.path.join('.') || 'body',
            reason: issue.message,
          }));

          const problem: ProblemDetail = {
            type: 'https://pocketroute.example/errors/validation-error',
            title: 'Validation Error',
            status: 400,
            detail:
              'Request body does not conform to the routing specification.',
            invalidParams,
          };
          return reply.status(400).send(problem);
        }

        const validRequest = parseResult.data;

        // Calculate IST departure minutes
        const depMinutesIST = resolveDepartureMinutesIST(
          validRequest.departureTime,
        );

        // Run multi-modal routing orchestrator
        const planResult = planRoutes(
          dataPack.staticGraph,
          validRequest,
          depMinutesIST,
        );

        // Attach request ID
        planResult.requestId = req.id;

        // Check includeMetrics query param (PRD §9.1: off by default)
        const includeMetrics = req.query.includeMetrics === 'true';
        if (!includeMetrics) {
          (planResult as unknown as { metrics?: unknown }).metrics = null;
        }

        return reply.status(200).send(planResult);
      },
    );

    // GET /api/v1/places/search?q=&limit=
    v1.get<{
      Querystring: { q?: string; limit?: string };
    }>('/places/search', async (req, reply) => {
      const q = req.query.q ?? '';
      const limit = req.query.limit ? Number(req.query.limit) : 8;

      const results = await placesService.search(q, limit);
      return reply.status(200).send(results);
    });

    // GET /api/v1/geo/reverse?lat=&lng=
    v1.get<{
      Querystring: { lat?: string; lng?: string };
    }>('/geo/reverse', async (req, reply) => {
      const latStr = req.query.lat;
      const lngStr = req.query.lng;

      if (
        !latStr ||
        !lngStr ||
        isNaN(Number(latStr)) ||
        isNaN(Number(lngStr))
      ) {
        return reply.status(400).send({
          type: 'https://pocketroute.example/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Missing or invalid lat/lng query parameters.',
        });
      }

      const lat = Number(latStr);
      const lng = Number(lngStr);
      const result = await geoService.reverse(lat, lng);
      return reply.status(200).send(result);
    });

    // GET /api/v1/geo/search?q=&limit= (PRD Section 23 & Step 4)
    v1.get<{
      Querystring: { q?: string; limit?: string };
    }>('/geo/search', async (req, reply) => {
      const parseResult = geoSearchQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        const invalidParams = parseResult.error.issues.map((issue) => ({
          name: issue.path.join('.') || 'query',
          reason: issue.message,
        }));
        return reply.status(400).send({
          type: 'https://pocketroute.example/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid query parameters for geo search.',
          invalidParams,
        });
      }

      const { q, limit } = parseResult.data;
      const result = await geoSearchService.search(q, limit);
      return reply.status(200).send(result);
    });

    // GET /api/v1/network
    v1.get('/network', async (req, reply) => {
      const clientEtag = req.headers['if-none-match'];

      if (clientEtag && clientEtag === dataPack.networkEtag) {
        return reply.status(304).send();
      }

      reply.header('ETag', dataPack.networkEtag);
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.status(200).send(dataPack.networkResponse);
    });

    // GET /api/v1/params (PRD §22.5)
    v1.get('/params', async (_req, reply) => {
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.status(200).send(dataPack.params);
    });

    // GET /api/v1/health
    v1.get('/health', async (_req, reply) => {
      const uptimeSec = Math.round((Date.now() - startTime) / 1000);
      return reply.status(200).send({
        status: 'ok',
        version: '0.0.0',
        dataVersion:
          process.env.DATA_VERSION ??
          dataPack.metro.effectiveFrom ??
          '2026.10.1',
        uptimeSec,
      });
    });
  };

  await app.register(v1Plugin, { prefix: '/api/v1' });

  return app;
}
