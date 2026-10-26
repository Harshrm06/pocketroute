import React, { useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  Marker,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Leg, PlanRoutes, Route } from '@pocketroute/shared';
import type {
  FlyToBoundsOptions,
  FlyToPointOptions,
  LngLatBounds,
  LngLatPoint,
  MapViewHandle,
  MapViewProps,
} from './types.js';

const DEFAULT_PUNE_CENTER: [number, number] = [73.8567, 18.5204]; // [lng, lat]
const DEFAULT_ZOOM = 12.5;

// Color tokens matching PRD §14.2 & §14.7
const COLOR_TOKENS = {
  metroPurple: '#7c3aed',
  metroAqua: '#0891b2',
  bus: '#059669',
  auto: '#d97706',
  cab: '#4f46e5',
  walk: '#0284c7',
  casing: '#ffffff',
  selectedHighlight: '#2563eb',
};

// OpenFreeMap vector tile style
const DEFAULT_STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ||
  'https://tiles.openfreemap.org/styles/liberty';

// 30 fps walk dash frames for marching ants animation (PRD §10.4)
const DASH_FRAMES: number[][] = [
  [0, 2, 4, 2],
  [0.5, 2, 3.5, 2],
  [1, 2, 3, 2],
  [1.5, 2, 2.5, 2],
  [2, 2, 2, 2],
  [2.5, 2, 1.5, 2],
  [3, 2, 1, 2],
  [3.5, 2, 0.5, 2],
];

import { getPointAtArcLength, haversineMeters } from './arc-length.js';

function extractLegs(
  routeSet: Route | Leg[] | PlanRoutes | null | undefined,
): Leg[] {
  if (!routeSet) return [];
  if (Array.isArray(routeSet)) return routeSet;
  if ('legs' in routeSet && Array.isArray(routeSet.legs)) return routeSet.legs;
  if ('smart' in routeSet) {
    if (routeSet.smart && routeSet.smart.legs) return routeSet.smart.legs;
    if (routeSet.fastest && routeSet.fastest.legs) return routeSet.fastest.legs;
  }
  return [];
}

function extractCoordinatesFromLegs(legs: Leg[]): [number, number][] {
  const coords: [number, number][] = [];
  legs.forEach((leg) => {
    if (leg.geometry && Array.isArray(leg.geometry.coordinates)) {
      leg.geometry.coordinates.forEach((c) => {
        if (typeof c[0] === 'number' && typeof c[1] === 'number') {
          coords.push([c[0], c[1]]);
        }
      });
    }
  });
  return coords;
}

function getModeColor(leg: Leg): string {
  if (leg.mode === 'METRO') {
    return leg.lineId === 'METRO_AQUA'
      ? COLOR_TOKENS.metroAqua
      : COLOR_TOKENS.metroPurple;
  }
  if (leg.mode === 'BUS') return COLOR_TOKENS.bus;
  if (leg.mode === 'AUTO') return COLOR_TOKENS.auto;
  if (leg.mode === 'CAB') return COLOR_TOKENS.cab;
  return COLOR_TOKENS.walk;
}

export const MapLibreInternal = React.forwardRef<MapViewHandle, MapViewProps>(
  (
    {
      initialRoute,
      allRoutes,
      selectedLegIndex,
      onLegClick,
      className = '',
      styleUrl = DEFAULT_STYLE_URL,
      onMapClick,
      onMarkerDragEnd,
      userLocation,
      onMyLocationClick,
      simulatedCommuter,
      hoveredLegIndex,
    },
    ref,
  ) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const markersRef = useRef<Marker[]>([]);
    const userLocationMarkerRef = useRef<Marker | null>(null);
    const commuterMarkerRef = useRef<Marker | null>(null);
    const commuterModeRef = useRef<string | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const routeLegsRef = useRef<Leg[]>(extractLegs(initialRoute));
    const allRoutesRef = useRef<MapViewProps['allRoutes']>(allRoutes);
    const selectedIndexRef = useRef<number | undefined>(selectedLegIndex);
    const hoveredIndexRef = useRef<number | null | undefined>(hoveredLegIndex);

    // Track reduced motion preference
    const prefersReducedMotionRef = useRef<boolean>(
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
    );

    // Sync allRoutes ref
    useEffect(() => {
      allRoutesRef.current = allRoutes;
    }, [allRoutes]);

    // Creates GeoJSON FeatureCollection for route legs
    const buildGeoJson = (
      legs: Leg[],
      selectedIdx?: number,
      hoveredIdx?: number | null,
    ): GeoJSON.FeatureCollection => {
      const features: GeoJSON.Feature[] = legs.map((leg, idx) => {
        const isSelected = selectedIdx !== undefined && selectedIdx === idx;
        const isHovered =
          hoveredIdx !== undefined && hoveredIdx !== null && hoveredIdx === idx;
        const isEstimated = leg.geometryQuality === 'estimated';
        const color = getModeColor(leg);

        return {
          type: 'Feature',
          properties: {
            legIndex: idx,
            mode: leg.mode,
            lineId: leg.lineId,
            lineLabel: leg.lineLabel,
            color,
            isEstimated,
            isSelected,
            isHovered,
          },
          geometry: leg.geometry,
        };
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    };

    // Sync hovered leg preview
    useEffect(() => {
      hoveredIndexRef.current = hoveredLegIndex;
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        const source = map.getSource('route-source') as
          | GeoJSONSource
          | undefined;
        if (source) {
          source.setData(
            buildGeoJson(
              routeLegsRef.current,
              selectedIndexRef.current,
              hoveredLegIndex,
            ),
          );
        }
      }
    }, [hoveredLegIndex]);

    // Clears custom HTML markers from map
    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };

    // Adds custom HTML pill markers & non-colliding callouts (PRD §10.4, §14.7, §22.1)
    const renderMarkers = (
      map: MapLibreMap,
      legs: Leg[],
      routesMap?: MapViewProps['allRoutes'],
    ) => {
      clearMarkers();
      if (legs.length === 0) return;

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      if (!firstLeg || !lastLeg) return;

      // 1. Start Marker: Emerald pill, anchored bottom-left, z-index 400 (PRD §22.1b)
      const originEl = document.createElement('div');
      originEl.className =
        'start-marker marker-tag select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
      originEl.style.zIndex = '400';
      originEl.setAttribute('role', 'button');
      originEl.setAttribute('tabindex', '0');
      originEl.setAttribute('data-testid', 'start-marker');
      originEl.setAttribute('aria-label', `Start: ${firstLeg.from.name}`);
      originEl.innerHTML = `
        <div class="marker-pill px-2.5 sm:px-3 py-1.5 rounded-pill bg-[#059669] text-white font-sans text-xs font-semibold shadow-e2 border border-white/20 flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
          <span class="marker-full-text max-w-[70px] sm:max-w-[120px] md:max-w-[180px] truncate">Start: ${firstLeg.from.name}</span>
          <span class="marker-compact-icon hidden font-bold text-[10px]">Start</span>
          <span class="marker-full-text font-mono text-[11px] opacity-80 shrink-0">${firstLeg.departAt}</span>
        </div>
      `;
      const originMarker = new Marker({
        element: originEl,
        anchor: 'bottom-left',
        offset: [0, -36],
        draggable: true,
      })
        .setLngLat([firstLeg.from.lng, firstLeg.from.lat])
        .addTo(map);

      originMarker.on('dragend', () => {
        const lngLat = originMarker.getLngLat();
        onMarkerDragEnd?.('origin', { lat: lngLat.lat, lng: lngLat.lng });
      });
      markersRef.current.push(originMarker);

      // 2. Intermediate Leg Transition Markers & Stops
      legs.forEach((leg, idx) => {
        // Add intermediate interchange chip between legs
        if (idx < legs.length - 1) {
          const nextLeg = legs[idx + 1];
          const modeColor = getModeColor(leg);
          const stopEl = document.createElement('div');
          stopEl.className =
            'stop-marker marker-tag select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
          stopEl.style.zIndex = '390';
          stopEl.innerHTML = `
            <div class="marker-pill px-2 py-0.5 rounded-pill bg-surface-solid text-ink font-sans text-[11px] font-medium shadow-e1 border border-border flex items-center gap-1.5 whitespace-nowrap">
              <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${modeColor}"></span>
              <span class="marker-full-text max-w-[70px] sm:max-w-[100px] truncate">${leg.to.name}</span>
              <span class="marker-compact-icon hidden text-[9px] font-semibold">${leg.to.name.slice(0, 3)}</span>
              <span class="marker-full-text font-mono text-[10px] text-ink-muted shrink-0">${nextLeg ? nextLeg.departAt : leg.arriveAt}</span>
            </div>
          `;
          const stopMarker = new Marker({
            element: stopEl,
            anchor: 'bottom',
            offset: [0, -10],
          })
            .setLngLat([leg.to.lng, leg.to.lat])
            .addTo(map);
          markersRef.current.push(stopMarker);
        }
      });

      // 3. Destination Marker: Coral pill, anchored bottom-right, z-index 401 (PRD §22.1b)
      const destEl = document.createElement('div');
      destEl.className =
        'dest-marker marker-tag select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
      destEl.style.zIndex = '401';
      destEl.setAttribute('role', 'button');
      destEl.setAttribute('tabindex', '0');
      destEl.setAttribute('data-testid', 'dest-marker');
      destEl.setAttribute('aria-label', `Dest: ${lastLeg.to.name}`);
      destEl.innerHTML = `
        <div class="marker-pill px-2.5 sm:px-3 py-1.5 rounded-pill bg-[#f43f5e] text-white font-sans text-xs font-semibold shadow-e2 border border-white/20 flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-2 h-2 rounded-sm bg-white shrink-0"></span>
          <span class="marker-full-text max-w-[70px] sm:max-w-[120px] md:max-w-[180px] truncate">Dest: ${lastLeg.to.name}</span>
          <span class="marker-compact-icon hidden font-bold text-[10px]">Dest</span>
          <span class="marker-full-text font-mono text-[11px] opacity-80 shrink-0">${lastLeg.arriveAt}</span>
        </div>
      `;
      const destMarker = new Marker({
        element: destEl,
        anchor: 'bottom-right',
        offset: [0, -36],
        draggable: true,
      })
        .setLngLat([lastLeg.to.lng, lastLeg.to.lat])
        .addTo(map);

      destMarker.on('dragend', () => {
        const lngLat = destMarker.getLngLat();
        onMarkerDragEnd?.('destination', { lat: lngLat.lat, lng: lngLat.lng });
      });
      markersRef.current.push(destMarker);

      // 4. Route Callouts based on cumulative Haversine arc length (PRD §22.1c)
      // Check if multiple comparison routes are present
      const routes = routesMap ?? allRoutesRef.current;
      const hasMultiple =
        routes &&
        routes.fastest &&
        routes.smart &&
        routes.cheapest &&
        routes.fastest !== routes.cheapest;

      if (hasMultiple && routes.fastest && routes.smart && routes.cheapest) {
        // Multi-route callouts: 35% Fastest, 55% Smart, 70% Cheapest, alternating perpendicular sides
        const routeConfigs = [
          {
            key: 'fastest',
            label: 'Fastest',
            route: routes.fastest,
            ratio: 0.35,
            side: 'right' as const,
            color: '#4f46e5',
            testId: 'route-callout-fastest',
          },
          {
            key: 'smart',
            label: 'Smart Budget',
            route: routes.smart,
            ratio: 0.55,
            side: 'left' as const,
            color: '#059669',
            testId: 'route-callout-smart',
          },
          {
            key: 'cheapest',
            label: 'Cheapest',
            route: routes.cheapest,
            ratio: 0.7,
            side: 'right' as const,
            color: '#d97706',
            testId: 'route-callout-cheapest',
          },
        ];

        routeConfigs.forEach((cfg) => {
          const coords = extractCoordinatesFromLegs(cfg.route.legs);
          let safeRatio = cfg.ratio;

          // Prevent callouts from anchoring too close to origin or destination
          if (coords.length > 1) {
            const firstCoord = coords[0]!;
            const lastCoord = coords[coords.length - 1]!;
            // Test candidate ratio
            const candidate = getPointAtArcLength(
              coords,
              safeRatio,
              16,
              cfg.side,
            );
            if (candidate) {
              const dStart = haversineMeters(
                candidate.point[1],
                candidate.point[0],
                firstCoord[1],
                firstCoord[0],
              );
              const dEnd = haversineMeters(
                candidate.point[1],
                candidate.point[0],
                lastCoord[1],
                lastCoord[0],
              );
              if (dEnd < 600) {
                safeRatio = Math.max(0.25, safeRatio - 0.12);
              } else if (dStart < 600) {
                safeRatio = Math.min(0.75, safeRatio + 0.12);
              }
            }
          }

          const arcPoint = getPointAtArcLength(coords, safeRatio, 16, cfg.side);
          if (arcPoint) {
            const calloutEl = document.createElement('div');
            calloutEl.className =
              'route-callout marker-tag select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
            calloutEl.style.zIndex = '450';
            calloutEl.setAttribute('data-testid', cfg.testId);
            calloutEl.innerHTML = `
              <div class="marker-pill px-2.5 py-1 rounded-pill bg-surface-solid text-ink font-sans text-xs font-semibold shadow-e2 border border-border flex items-center gap-1.5 whitespace-nowrap">
                <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${cfg.color}"></span>
                <span class="marker-full-text">${cfg.label} • ${Math.round(cfg.route.durationMin)}m • ₹${cfg.route.totalFareINR}</span>
                <span class="marker-compact-icon hidden text-[10px]">${cfg.label.slice(0, 1)}</span>
              </div>
            `;
            const calloutMarker = new Marker({
              element: calloutEl,
              anchor: 'center',
              offset: arcPoint.perpendicularOffsetPx,
            })
              .setLngLat(arcPoint.point)
              .addTo(map);
            markersRef.current.push(calloutMarker);
          }
        });
      } else {
        // Single visible route callout placed at strictly 50% arc length (PRD §22.1c)
        const coords = extractCoordinatesFromLegs(legs);
        const arcPoint = getPointAtArcLength(coords, 0.5, 14, 'left');
        if (arcPoint) {
          const hasEstimated = legs.some(
            (l) => l.geometryQuality === 'estimated',
          );
          const totalFare = legs.reduce((acc, l) => acc + (l.fareINR || 0), 0);
          const totalMin = Math.round(
            legs.reduce((acc, l) => acc + (l.durationMin || 0), 0),
          );

          const calloutEl = document.createElement('div');
          calloutEl.className =
            'route-callout marker-tag select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
          calloutEl.style.zIndex = '450';
          calloutEl.setAttribute('data-testid', 'route-callout');
          calloutEl.innerHTML = `
            <div class="marker-pill px-2.5 py-1 rounded-pill bg-surface-solid text-ink font-sans text-xs font-semibold shadow-e2 border border-border flex items-center gap-1.5 whitespace-nowrap">
              <span class="w-2 h-2 rounded-full shrink-0 ${hasEstimated ? 'bg-warning' : 'bg-success'}"></span>
              <span class="marker-full-text">${hasEstimated ? 'Estimated Path' : 'Optimal Route'} • ${totalMin}m • ₹${totalFare}</span>
              <span class="marker-compact-icon hidden text-[10px] font-bold">●</span>
            </div>
          `;
          const calloutMarker = new Marker({
            element: calloutEl,
            anchor: 'center',
            offset: arcPoint.perpendicularOffsetPx,
          })
            .setLngLat(arcPoint.point)
            .addTo(map);
          markersRef.current.push(calloutMarker);
        }
      }
    };

    // Updates route sources and markers
    const applyRoute = (
      legs: Leg[],
      selectedIdx?: number,
      routesMap?: MapViewProps['allRoutes'],
    ) => {
      routeLegsRef.current = legs;
      selectedIndexRef.current = selectedIdx;
      if (routesMap !== undefined) {
        allRoutesRef.current = routesMap;
      }
      const map = mapRef.current;
      if (!map) return;

      // Render custom HTML markers immediately without waiting for vector style load
      renderMarkers(map, legs, allRoutesRef.current);

      if (map.isStyleLoaded()) {
        const source = map.getSource('route-source') as
          | GeoJSONSource
          | undefined;
        if (source) {
          source.setData(
            buildGeoJson(legs, selectedIdx, hoveredIndexRef.current),
          );
        }
      }
    };

    // Setup MapLibre layers matching PRD §10.4 and §14.7
    const initRouteLayers = (map: MapLibreMap) => {
      if (map.getSource('route-source')) return;

      // Single GeoJSON source holding all route legs
      map.addSource('route-source', {
        type: 'geojson',
        data: buildGeoJson(
          routeLegsRef.current,
          selectedIndexRef.current,
          hoveredIndexRef.current,
        ),
      });

      // Layer 1: Walk Casing (width 5px, white)
      map.addLayer({
        id: 'layer-walk-casing',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'mode'], 'WALK'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });

      // Layer 2: Walk Route (width 3px, #0284c7, animated dashed)
      map.addLayer({
        id: 'layer-walk',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'mode'], 'WALK'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.walk,
          'line-width': 3,
          'line-dasharray': [2, 2],
        },
      });

      // Layer 3: Auto Casing (width 6px)
      map.addLayer({
        id: 'layer-auto-casing',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'AUTO'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 6,
          'line-opacity': 0.85,
        },
      });

      // Layer 4: Auto Route (width 4px, #d97706)
      map.addLayer({
        id: 'layer-auto',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'AUTO'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.auto,
          'line-width': 4,
        },
      });

      // Layer 5: Cab Casing (width 6px)
      map.addLayer({
        id: 'layer-cab-casing',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'CAB'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 6,
          'line-opacity': 0.85,
        },
      });

      // Layer 6: Cab Route (width 4px, #4f46e5)
      map.addLayer({
        id: 'layer-cab',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'CAB'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.cab,
          'line-width': 4,
        },
      });

      // Layer 7: Bus Casing (width 7px)
      map.addLayer({
        id: 'layer-bus-casing',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'BUS'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 7,
          'line-opacity': 0.85,
        },
      });

      // Layer 8: Bus Route (width 5px, #059669)
      map.addLayer({
        id: 'layer-bus',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['==', ['get', 'mode'], 'BUS'],
          ['!=', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.bus,
          'line-width': 5,
        },
      });

      // Layer 8b: Estimated Route Casing (PRD §10.3, §10.4)
      map.addLayer({
        id: 'layer-estimated-casing',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['!=', ['get', 'mode'], 'WALK'],
          ['==', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 6,
          'line-opacity': 0.85,
        },
      });

      // Layer 8c: Estimated Route Dashed (PRD §10.3, §10.4: static [3, 2] dashed pattern)
      map.addLayer({
        id: 'layer-estimated',
        type: 'line',
        source: 'route-source',
        filter: [
          'all',
          ['!=', ['get', 'mode'], 'WALK'],
          ['==', ['get', 'isEstimated'], true],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-dasharray': [3, 2],
        },
      });

      // Layer 9: Metro Casing (width 8px)
      map.addLayer({
        id: 'layer-metro-casing',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'mode'], 'METRO'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': COLOR_TOKENS.casing,
          'line-width': 8,
          'line-opacity': 0.9,
        },
      });

      // Layer 10: Metro Route (width 6px, #7c3aed or #0891b2)
      map.addLayer({
        id: 'layer-metro',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'mode'], 'METRO'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'lineId'], 'METRO_AQUA'],
            COLOR_TOKENS.metroAqua,
            COLOR_TOKENS.metroPurple,
          ],
          'line-width': 6,
        },
      });

      // Layer 10b: Hovered Leg Highlight Casing (cyan glow, +4px)
      map.addLayer({
        id: 'layer-hovered-casing',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'isHovered'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 10,
          'line-opacity': 0.85,
        },
      });

      // Layer 10c: Hovered Leg Highlight (selected mode stroke, +2px)
      map.addLayer({
        id: 'layer-hovered-highlight',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'isHovered'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
        },
      });

      // Layer 11: Selected Leg Highlight Casing (white, +4px)
      map.addLayer({
        id: 'layer-selected-casing',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'isSelected'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.95,
        },
      });

      // Layer 12: Selected Leg Highlight (selected mode stroke, +2px)
      map.addLayer({
        id: 'layer-selected-highlight',
        type: 'line',
        source: 'route-source',
        filter: ['==', ['get', 'isSelected'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
        },
      });

      // Interactive leg click handling
      const interactiveLayers = [
        'layer-walk',
        'layer-auto',
        'layer-cab',
        'layer-bus',
        'layer-metro',
        'layer-estimated',
      ];

      interactiveLayers.forEach((layerId) => {
        map.on('click', layerId, (e) => {
          if (e.features && e.features[0]) {
            const legIdx = e.features[0].properties?.legIndex;
            if (typeof legIdx === 'number' && routeLegsRef.current[legIdx]) {
              const clickedLeg = routeLegsRef.current[legIdx];
              if (clickedLeg && onLegClick) {
                onLegClick(legIdx, clickedLeg);
              }
            }
          }
        });

        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      });

      // Render initial HTML markers
      renderMarkers(map, routeLegsRef.current);
    };

    // 30 fps animated walk dash offset (PRD §10.4)
    const startWalkAnimation = (map: MapLibreMap) => {
      if (prefersReducedMotionRef.current) return;

      let frameIdx = 0;
      let lastTime = performance.now();
      const targetInterval = 1000 / 30; // 33.3 ms (30 fps)

      const animate = (currentTime: number) => {
        const delta = currentTime - lastTime;
        if (delta >= targetInterval) {
          lastTime = currentTime - (delta % targetInterval);
          frameIdx = (frameIdx + 1) % DASH_FRAMES.length;

          if (map.getLayer('layer-walk')) {
            const nextPattern = DASH_FRAMES[frameIdx];
            if (nextPattern) {
              map.setPaintProperty('layer-walk', 'line-dasharray', nextPattern);
            }
          }
        }
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const stopWalkAnimation = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    // Imperative ref implementation
    useImperativeHandle(ref, () => ({
      flyToBounds: (bounds: LngLatBounds, options?: FlyToBoundsOptions) => {
        const map = mapRef.current;
        if (!map) return;

        const duration = prefersReducedMotionRef.current
          ? 0
          : (options?.duration ?? 900); // 900 ms per PRD §10.4

        map.fitBounds(bounds as LngLatBoundsLike, {
          padding: options?.padding ?? 64,
          duration,
          maxZoom: options?.maxZoom ?? 16,
        });
      },

      flyToPoint: (
        point: LngLatPoint,
        zoom = 15,
        options?: FlyToPointOptions,
      ) => {
        const map = mapRef.current;
        if (!map) return;

        const center: [number, number] = Array.isArray(point)
          ? point
          : [point.lng, point.lat];

        const duration = prefersReducedMotionRef.current
          ? 0
          : (options?.duration ?? 900);

        map.flyTo({
          center,
          zoom,
          duration,
          offset: options?.offset ?? [0, 0],
        });
      },

      setRoute: (
        routeSet: Route | Leg[] | PlanRoutes | null,
        selectedLegIdx?: number,
        allRoutesInput?: MapViewProps['allRoutes'],
      ) => {
        const legs = extractLegs(routeSet);
        if (allRoutesInput !== undefined) {
          allRoutesRef.current = allRoutesInput;
        }
        applyRoute(legs, selectedLegIdx, allRoutesRef.current);

        // Auto-fit to route if legs exist with layout safe zone padding (PRD §22.1)
        if (legs.length > 0 && mapRef.current) {
          const lats = legs.flatMap((l) => [l.from.lat, l.to.lat]);
          const lngs = legs.flatMap((l) => [l.from.lng, l.to.lng]);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          const duration = prefersReducedMotionRef.current ? 0 : 900;
          const isDesktop =
            typeof window !== 'undefined' && window.innerWidth >= 1024;
          const isTablet =
            typeof window !== 'undefined' &&
            window.innerWidth >= 640 &&
            window.innerWidth < 1024;
          const padding = isDesktop
            ? { top: 96, bottom: 80, left: 420, right: 460 }
            : isTablet
              ? { top: 96, bottom: 80, left: 390, right: 60 }
              : { top: 200, bottom: 220, left: 32, right: 32 };

          mapRef.current.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding, duration },
          );
        }
      },

      setSimulatedCommuter: (point) => {
        const map = mapRef.current;
        if (!map) return;
        if (!point) {
          if (commuterMarkerRef.current) {
            commuterMarkerRef.current.remove();
            commuterMarkerRef.current = null;
            commuterModeRef.current = null;
          }
          return;
        }

        if (!commuterMarkerRef.current) {
          const el = document.createElement('div');
          el.className =
            'commuter-marker select-none pointer-events-none transition-transform duration-100';
          el.style.zIndex = '460';
          el.setAttribute('data-testid', 'simulated-commuter-marker');
          el.innerHTML = `
            <div class="px-2 py-1 rounded-pill bg-[#0f172a] text-white border border-white/40 shadow-e3 flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
              <span class="commuter-mode-text">${point.mode}</span>
            </div>
          `;
          const marker = new Marker({ element: el, anchor: 'center' })
            .setLngLat([point.lng, point.lat])
            .addTo(map);
          commuterMarkerRef.current = marker;
          commuterModeRef.current = point.mode;
        } else {
          commuterMarkerRef.current.setLngLat([point.lng, point.lat]);
          if (commuterModeRef.current !== point.mode) {
            commuterModeRef.current = point.mode;
            const textEl = commuterMarkerRef.current
              .getElement()
              .querySelector('.commuter-mode-text');
            if (textEl) textEl.textContent = point.mode;
          }
        }
      },

      getMap: () => mapRef.current,
    }));

    // Initialize MapLibre GL map instance
    useEffect(() => {
      if (!mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: DEFAULT_PUNE_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: {
          compact: false,
        },
      });

      mapRef.current = map;

      // Zoom listener for compact marker tags when zoom < 12 (PRD §22.1c)
      const handleZoom = () => {
        if (!mapContainerRef.current) return;
        if (map.getZoom() < 12) {
          mapContainerRef.current.classList.add('map-zoomed-out');
        } else {
          mapContainerRef.current.classList.remove('map-zoomed-out');
        }
      };
      map.on('zoom', handleZoom);

      // Map click-to-pin listener (PRD §22.3)
      map.on('click', (e) => {
        onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      map.on('load', () => {
        initRouteLayers(map);
        startWalkAnimation(map);
        handleZoom();

        // If initialRoute had legs, fit map to them
        const initialLegs = routeLegsRef.current;
        if (initialLegs.length > 0) {
          const lats = initialLegs.flatMap((l) => [l.from.lat, l.to.lat]);
          const lngs = initialLegs.flatMap((l) => [l.from.lng, l.to.lng]);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          const isDesktop =
            typeof window !== 'undefined' && window.innerWidth >= 1024;
          const padding = isDesktop
            ? { top: 96, bottom: 80, left: 420, right: 460 }
            : { top: 200, bottom: 220, left: 32, right: 32 };

          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding, duration: 0 },
          );
        }
      });

      // Cleanup on unmount (PRD Task #5)
      return () => {
        stopWalkAnimation();
        clearMarkers();
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.remove();
          userLocationMarkerRef.current = null;
        }
        if (commuterMarkerRef.current) {
          commuterMarkerRef.current.remove();
          commuterMarkerRef.current = null;
        }
        map.remove();
        mapRef.current = null;
      };
    }, [styleUrl]);

    // Handle updates to userLocation GPS marker (PRD §22.2)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
        userLocationMarkerRef.current = null;
      }
      if (
        userLocation &&
        typeof userLocation.lat === 'number' &&
        typeof userLocation.lng === 'number'
      ) {
        const el = document.createElement('div');
        el.className =
          'user-gps-marker select-none pointer-events-none relative flex items-center justify-center';
        el.style.zIndex = '420';
        el.setAttribute('data-testid', 'gps-user-marker');
        el.innerHTML = `
          <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 gps-pulse-ring"></div>
          <div class="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
        `;
        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
        userLocationMarkerRef.current = marker;
      }
    }, [userLocation]);

    // Handle updates to simulatedCommuter marker (PRD §22.4)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (!simulatedCommuter) {
        if (commuterMarkerRef.current) {
          commuterMarkerRef.current.remove();
          commuterMarkerRef.current = null;
          commuterModeRef.current = null;
        }
        return;
      }

      if (!commuterMarkerRef.current) {
        const el = document.createElement('div');
        el.className =
          'commuter-marker select-none pointer-events-none transition-transform duration-100';
        el.style.zIndex = '460';
        el.setAttribute('data-testid', 'simulated-commuter-marker');
        el.innerHTML = `
          <div class="px-2 py-1 rounded-pill bg-[#0f172a] text-white border border-white/40 shadow-e3 flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
            <span class="commuter-mode-text">${simulatedCommuter.mode}</span>
          </div>
        `;
        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([simulatedCommuter.lng, simulatedCommuter.lat])
          .addTo(map);
        commuterMarkerRef.current = marker;
        commuterModeRef.current = simulatedCommuter.mode;
      } else {
        commuterMarkerRef.current.setLngLat([
          simulatedCommuter.lng,
          simulatedCommuter.lat,
        ]);
        if (commuterModeRef.current !== simulatedCommuter.mode) {
          commuterModeRef.current = simulatedCommuter.mode;
          const textEl = commuterMarkerRef.current
            .getElement()
            .querySelector('.commuter-mode-text');
          if (textEl) textEl.textContent = simulatedCommuter.mode;
        }
      }
    }, [simulatedCommuter]);

    // Handle updates to userLocation (PRD §22.2)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
        userLocationMarkerRef.current = null;
      }

      if (userLocation) {
        const el = document.createElement('div');
        el.className =
          'user-location-marker relative flex items-center justify-center pointer-events-none select-none';
        el.style.zIndex = '410';
        el.setAttribute('data-testid', 'user-location-marker');
        el.innerHTML = `
          <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 gps-pulse-ring"></div>
          <div class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
        `;
        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
        userLocationMarkerRef.current = marker;
      }
    }, [userLocation]);

    const handleMyLocation = () => {
      if (userLocation && mapRef.current) {
        mapRef.current.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 15,
          essential: true,
        });
      } else if (onMyLocationClick) {
        onMyLocationClick();
      }
    };

    // Handle updates to selectedLegIndex
    useEffect(() => {
      if (selectedLegIndex !== selectedIndexRef.current) {
        applyRoute(routeLegsRef.current, selectedLegIndex);
      }
    }, [selectedLegIndex]);

    return (
      <div
        className={`relative overflow-hidden w-screen h-screen ${className}`}
      >
        <div
          ref={mapContainerRef}
          aria-label="Pune Interactive Transit Map"
          role="region"
          style={{ width: '100%', height: '100%' }}
          className="absolute inset-0"
        />

        {/* Floating "My Location" Button (PRD Section 22.2) */}
        <button
          type="button"
          onClick={handleMyLocation}
          aria-label="My Location"
          data-testid="my-location-button"
          className="absolute bottom-24 right-4 z-20 w-11 h-11 rounded-full bg-surface-solid/90 hover:bg-surface-solid shadow-e3 border border-border flex items-center justify-center text-ink hover:text-primary active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus backdrop-blur-sm"
          title="Recenter on my location"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-primary"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    );
  },
);

MapLibreInternal.displayName = 'MapLibreInternal';
