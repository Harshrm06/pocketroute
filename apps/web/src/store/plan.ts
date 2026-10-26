import { create } from 'zustand';
import type {
  PlanRequestInput,
  PlanResponse,
  ProblemDetail,
  StopPoint,
} from '@pocketroute/shared';
import { MIN_BUDGET, MAX_BUDGET } from '@pocketroute/shared';
import { api, ApiError } from '../lib/api.js';

export interface RecentPlaceRecord {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  frequency: number;
  lastUsed: number;
}

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SelectedRouteKey = 'smart' | 'fastest' | 'cheapest';

export interface ValidationErrors {
  origin?: string;
  destination?: string;
  budget?: string;
}

export interface LocationMessage {
  type: 'error' | 'info';
  text: string;
  showDemoFallback?: boolean;
}

export interface PlanState {
  origin: StopPoint | null;
  destination: StopPoint | null;
  departureTime: string; // 'now' or 'HH:mm'
  budgetINR: number;
  status: PlanStatus;
  result: PlanResponse | null;
  selectedRouteKey: SelectedRouteKey;
  error: string | null;
  problem: ProblemDetail | null;
  validationErrors: ValidationErrors;
  recentPlaces: RecentPlaceRecord[];

  // Live GPS state (not persisted, cleared on reload)
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
  isLocating: boolean;
  locationMessage: LocationMessage | null;

  // Actions
  setOrigin: (point: StopPoint | null) => void;
  setDestination: (point: StopPoint | null) => void;
  swapEndpoints: () => void;
  setDepartureTime: (time: string) => void;
  setBudgetINR: (budget: number) => void;
  setBudget: (budget: number) => void;
  setSelectedRouteKey: (key: SelectedRouteKey) => void;
  selectRouteKey: (key: SelectedRouteKey) => void;
  setUserLocation: (
    loc: { lat: number; lng: number; accuracy?: number } | null,
  ) => void;
  setIsLocating: (val: boolean) => void;
  setLocationMessage: (msg: LocationMessage | null) => void;
  requestCurrentLocation: () => Promise<void>;
  simulateDemoLocation: () => void;
  validate: () => boolean;
  planRoute: () => Promise<PlanResponse | null>;
  recordRecentPlace: (place: {
    name: string;
    lat: number;
    lng: number;
  }) => void;
  clearRecentPlaces: () => void;
  getTopRecentPlaces: (limit?: number) => RecentPlaceRecord[];
  reset: () => void;
}

const STORAGE_KEY = 'pr.recent';

/**
 * Loads recent places frequency map from localStorage with try/catch.
 */
function loadRecentPlaces(): RecentPlaceRecord[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch {
    // Private mode / storage access errors ignored per spec
  }
  return [];
}

/**
 * Persists recent places frequency map to localStorage with try/catch.
 */
function saveRecentPlaces(places: RecentPlaceRecord[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    }
  } catch {
    // Storage access errors ignored per spec
  }
}

export const usePlanStore = create<PlanState>((set, get) => ({
  origin: null,
  destination: null,
  departureTime: 'now',
  budgetINR: 75, // Default ₹75 per PRD §15.1
  status: 'idle',
  result: null,
  selectedRouteKey: 'smart',
  error: null,
  problem: null,
  validationErrors: {},
  recentPlaces: loadRecentPlaces(),
  userLocation: null,
  isLocating: false,
  locationMessage: null,

  setUserLocation: (loc) => set({ userLocation: loc }),
  setIsLocating: (val) => set({ isLocating: val }),
  setLocationMessage: (msg) => set({ locationMessage: msg }),

  simulateDemoLocation: () => {
    // Verified Swargate coordinates from data/pune/places.json (18.5015, 73.8542)
    const demoPlace = {
      name: 'Current Location (Swargate)',
      lat: 18.5015,
      lng: 73.8542,
    };
    set((state) => {
      const errors = { ...state.validationErrors };
      delete errors.origin;
      return {
        origin: demoPlace,
        userLocation: { lat: demoPlace.lat, lng: demoPlace.lng, accuracy: 25 },
        isLocating: false,
        locationMessage: null,
        validationErrors: errors,
      };
    });
  },

  requestCurrentLocation: async () => {
    set({ isLocating: true, locationMessage: null });

    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      set({
        isLocating: false,
        locationMessage: {
          type: 'error',
          text: 'Geolocation requires a secure context (HTTPS or localhost).',
          showDemoFallback: true,
        },
      });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      set({
        isLocating: false,
        locationMessage: {
          type: 'error',
          text: 'Geolocation is not supported by your browser.',
          showDemoFallback: true,
        },
      });
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        },
      );

      const { latitude: lat, longitude: lng, accuracy } = position.coords;

      // Check Pune bounding box: lat 18.40 to 18.70, lng 73.70 to 74.00
      if (lat < 18.4 || lat > 18.7 || lng < 73.7 || lng > 74.0) {
        set({
          isLocating: false,
          locationMessage: {
            type: 'error',
            text: 'You appear to be outside Pune. Pick a start point, or try the demo location.',
            showDemoFallback: true,
          },
        });
        return;
      }

      // Reverse geocode via API
      let displayName = `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      try {
        const geoRes = await api.reverseGeocode(lat, lng);
        if (geoRes && geoRes.displayName) {
          displayName = geoRes.displayName;
        }
      } catch {
        // Fallback already prepared
      }

      set((state) => {
        const errors = { ...state.validationErrors };
        delete errors.origin;
        return {
          origin: {
            name: displayName,
            lat,
            lng,
          },
          userLocation: { lat, lng, accuracy },
          isLocating: false,
          locationMessage: null,
          validationErrors: errors,
        };
      });
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      let text = 'Unable to retrieve location.';
      if (geoErr && geoErr.code === 1) {
        text =
          'Location permission denied. Please allow access in browser settings, or try the demo location.';
      } else if (geoErr && geoErr.code === 2) {
        text =
          'Position unavailable. Please check your GPS signal or try the demo location.';
      } else if (geoErr && geoErr.code === 3) {
        text =
          'Location request timed out (10s). Please try again or use the demo location.';
      }

      set({
        isLocating: false,
        locationMessage: {
          type: 'error',
          text,
          showDemoFallback: true,
        },
      });
    }
  },

  setOrigin: (point) => {
    set((state) => {
      const errors = { ...state.validationErrors };
      delete errors.origin;
      return { origin: point, validationErrors: errors, error: null };
    });
  },

  setDestination: (point) => {
    set((state) => {
      const errors = { ...state.validationErrors };
      delete errors.destination;
      return { destination: point, validationErrors: errors, error: null };
    });
  },

  swapEndpoints: () => {
    set((state) => ({
      origin: state.destination,
      destination: state.origin,
      validationErrors: {},
      error: null,
    }));
  },

  setDepartureTime: (time) => set({ departureTime: time }),

  setBudgetINR: (budget) => {
    const intBudget = Math.round(budget);
    set((state) => {
      const errors = { ...state.validationErrors };
      if (intBudget < MIN_BUDGET || intBudget > MAX_BUDGET) {
        errors.budget = `Budget must be between ₹${MIN_BUDGET} and ₹${MAX_BUDGET}.`;
      } else {
        delete errors.budget;
      }
      return { budgetINR: intBudget, validationErrors: errors };
    });
  },

  setBudget: (budget) => {
    get().setBudgetINR(budget);
  },

  setSelectedRouteKey: (key) => set({ selectedRouteKey: key }),
  selectRouteKey: (key) => set({ selectedRouteKey: key }),

  recordRecentPlace: (place) => {
    if (!place.name) return;
    const current = get().recentPlaces;
    const nameKey = place.name.trim().toLowerCase();

    const existingIdx = current.findIndex(
      (p) =>
        p.name.trim().toLowerCase() === nameKey ||
        (Math.abs(p.lat - place.lat) < 0.0005 &&
          Math.abs(p.lng - place.lng) < 0.0005),
    );

    let updated: RecentPlaceRecord[];
    const now = Date.now();

    if (existingIdx >= 0) {
      const item = current[existingIdx]!;
      const updatedItem: RecentPlaceRecord = {
        ...item,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        frequency: item.frequency + 1,
        lastUsed: now,
      };
      updated = [
        updatedItem,
        ...current.filter((_, idx) => idx !== existingIdx),
      ];
    } else {
      const newItem: RecentPlaceRecord = {
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        frequency: 1,
        lastUsed: now,
      };
      updated = [newItem, ...current];
    }

    // Sort by frequency descending, then lastUsed descending; keep top 25
    updated.sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return b.lastUsed - a.lastUsed;
    });

    const capped = updated.slice(0, 25);
    saveRecentPlaces(capped);
    set({ recentPlaces: capped });
  },

  getTopRecentPlaces: (limit = 3) => {
    return get().recentPlaces.slice(0, limit);
  },

  clearRecentPlaces: () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    set({ recentPlaces: [] });
  },

  validate: () => {
    const { origin, destination, budgetINR } = get();
    const errors: ValidationErrors = {};

    if (!origin) {
      errors.origin = 'Please select a starting location.';
    }

    if (!destination) {
      errors.destination = 'Please select a destination.';
    }

    if (origin && destination) {
      // Check if same stop or coordinates within 50m
      const latDiff = Math.abs(origin.lat - destination.lat);
      const lngDiff = Math.abs(origin.lng - destination.lng);
      const sameName =
        origin.name.trim().toLowerCase() ===
        destination.name.trim().toLowerCase();

      if (sameName || (latDiff < 0.0005 && lngDiff < 0.0005)) {
        errors.destination = 'Start and End points must be different.';
      }
    }

    if (
      !Number.isInteger(budgetINR) ||
      budgetINR < MIN_BUDGET ||
      budgetINR > MAX_BUDGET
    ) {
      errors.budget = `Budget must be between ₹${MIN_BUDGET} and ₹${MAX_BUDGET}.`;
    }

    set({ validationErrors: errors });
    return Object.keys(errors).length === 0;
  },

  planRoute: async () => {
    if (!get().validate()) {
      return null;
    }

    const { origin, destination, departureTime, budgetINR } = get();
    if (!origin || !destination) return null;

    set({ status: 'loading', error: null, problem: null });

    const requestPayload: PlanRequestInput = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      departureTime,
      budgetINR,
    };

    try {
      const response = await api.planRoute(requestPayload, true);

      // Record successful query endpoints in recent places frequency map
      get().recordRecentPlace(origin);
      get().recordRecentPlace(destination);

      set({
        status: 'ready',
        result: response,
        selectedRouteKey: response.routes.smart ? 'smart' : 'fastest',
        error: null,
        problem: null,
      });

      return response;
    } catch (err: unknown) {
      let friendlyMessage = 'Unable to compute route. Please try again.';
      let problemDetail: ProblemDetail | null = null;

      if (err instanceof ApiError) {
        problemDetail = err.problem ?? null;
        if (err.status === 400) {
          friendlyMessage =
            err.problem?.detail ||
            err.problem?.title ||
            'Invalid route request. Please verify coordinates and budget.';
        } else if (err.status === 429) {
          friendlyMessage =
            'Too many route requests. Please wait a moment before trying again.';
        } else {
          friendlyMessage =
            err.problem?.detail || err.problem?.title || err.message;
        }
      } else if (err instanceof Error) {
        friendlyMessage = err.message;
      }

      set({
        status: 'error',
        error: friendlyMessage,
        problem: problemDetail,
      });

      return null;
    }
  },

  reset: () => {
    set({
      origin: null,
      destination: null,
      status: 'idle',
      result: null,
      error: null,
      problem: null,
      validationErrors: {},
    });
  },
}));
