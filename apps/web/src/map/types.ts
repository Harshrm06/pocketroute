import type { Leg, PlanRoutes, Route } from '@pocketroute/shared';
import type { Map as MapLibreMap } from 'maplibre-gl';

export type LngLatBounds =
  | [[number, number], [number, number]]
  | [number, number, number, number];

export type LngLatPoint = [number, number] | { lat: number; lng: number };

export interface FlyToBoundsOptions {
  padding?:
    | number
    | { top: number; bottom: number; left: number; right: number };
  duration?: number;
  maxZoom?: number;
}

export interface FlyToPointOptions {
  duration?: number;
  offset?: [number, number];
}

export interface MapViewHandle {
  /**
   * Smoothly pans and zooms map to given bounds (PRD §10.4: 900 ms, disabled under prefers-reduced-motion).
   */
  flyToBounds: (bounds: LngLatBounds, options?: FlyToBoundsOptions) => void;

  /**
   * Smoothly pans map to given center point.
   */
  flyToPoint: (
    point: LngLatPoint,
    zoom?: number,
    options?: FlyToPointOptions,
  ) => void;

  /**
   * Renders route legs, mode layers, casing, dashed walk, and markers.
   */
  setRoute: (
    routeSet: Route | Leg[] | PlanRoutes | null,
    selectedLegIndex?: number,
  ) => void;

  /**
   * Returns direct access to the underlying MapLibre map instance if needed.
   */
  getMap: () => MapLibreMap | null;
}

export interface MapViewProps {
  initialRoute?: Route | Leg[] | PlanRoutes | null;
  selectedLegIndex?: number;
  onLegClick?: (legIndex: number, leg: Leg) => void;
  className?: string;
  styleUrl?: string;
}
