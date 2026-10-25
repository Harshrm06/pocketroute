/**
 * PocketRoute API Client.
 * PRD Section 9, 12.1.
 */
import type {
  PlanRequestInput,
  PlanResponse,
  ProblemDetail,
} from '@pocketroute/shared';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    '',
  ) || '/api/v1';

export class ApiError extends Error {
  public problem?: ProblemDetail;
  public status: number;

  constructor(status: number, message: string, problem?: ProblemDetail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let problem: ProblemDetail | undefined;
    const contentType = response.headers.get('content-type') || '';

    if (
      contentType.includes('application/problem+json') ||
      contentType.includes('application/json')
    ) {
      try {
        problem = (await response.json()) as ProblemDetail;
      } catch {
        // Fall back to plain statusText
      }
    }

    const message =
      problem?.detail ||
      problem?.title ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, problem);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json() as Promise<T>;
}

export interface PlaceSearchResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  source: 'local' | 'nominatim';
}

export interface NetworkResponsePayload {
  lines: Array<{
    id: string;
    name: string;
    mode: 'METRO' | 'BUS';
    color: string;
    geometry: unknown;
    stations: unknown[];
  }>;
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

export interface HealthResponse {
  status: string;
  version: string;
  dataVersion: string;
  uptimeSec: number;
}

/**
 * PocketRoute API client endpoints.
 */
export const api = {
  /**
   * Plans routes across multi-modal transit networks (Route A, B, Smart).
   */
  async planRoute(
    planRequest: PlanRequestInput,
    includeMetrics = false,
  ): Promise<PlanResponse> {
    const query = includeMetrics ? '?includeMetrics=true' : '';
    return request<PlanResponse>(`/route/plan${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planRequest),
    });
  },

  /**
   * Autocomplete search for places and landmarks.
   */
  async searchPlaces(query: string, limit = 8): Promise<PlaceSearchResult[]> {
    const params = new URLSearchParams();
    params.set('q', query);
    if (limit) params.set('limit', String(limit));
    return request<PlaceSearchResult[]>(`/places/search?${params.toString()}`);
  },

  /**
   * Fetches line, corridor, and station geometry for map rendering.
   */
  async getNetwork(): Promise<NetworkResponsePayload> {
    return request<NetworkResponsePayload>('/network');
  },

  /**
   * API health probe.
   */
  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/health');
  },
};
