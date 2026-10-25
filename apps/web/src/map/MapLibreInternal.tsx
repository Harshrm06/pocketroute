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
      selectedLegIndex,
      onLegClick,
      className = '',
      styleUrl = DEFAULT_STYLE_URL,
    },
    ref,
  ) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const markersRef = useRef<Marker[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const routeLegsRef = useRef<Leg[]>(extractLegs(initialRoute));
    const selectedIndexRef = useRef<number | undefined>(selectedLegIndex);

    // Track reduced motion preference
    const prefersReducedMotionRef = useRef<boolean>(
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
    );

    // Creates GeoJSON FeatureCollection for route legs
    const buildGeoJson = (
      legs: Leg[],
      selectedIdx?: number,
    ): GeoJSON.FeatureCollection => {
      const features: GeoJSON.Feature[] = legs.map((leg, idx) => {
        const isSelected = selectedIdx !== undefined && selectedIdx === idx;
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
          },
          geometry: leg.geometry,
        };
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    };

    // Clears custom HTML markers from map
    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };

    // Adds custom HTML pill markers (PRD §10.4, §14.7)
    const renderMarkers = (map: MapLibreMap, legs: Leg[]) => {
      clearMarkers();
      if (legs.length === 0) return;

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      if (!firstLeg || !lastLeg) return;

      // 1. Origin Pill Marker (Ink background, white text)
      const originEl = document.createElement('div');
      originEl.className =
        'origin-marker select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
      originEl.setAttribute('role', 'button');
      originEl.setAttribute('aria-label', `Origin: ${firstLeg.from.name}`);
      originEl.innerHTML = `
        <div class="px-3 py-1.5 rounded-pill bg-ink text-white font-sans text-xs font-semibold shadow-e2 border border-white/20 flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
          <span class="max-w-[120px] md:max-w-[180px] truncate">${firstLeg.from.name}</span>
          <span class="font-mono text-[11px] opacity-80 shrink-0">${firstLeg.departAt}</span>
        </div>
      `;
      const originMarker = new Marker({ element: originEl, anchor: 'bottom' })
        .setLngLat([firstLeg.from.lng, firstLeg.from.lat])
        .addTo(map);
      markersRef.current.push(originMarker);

      // 2. Intermediate Leg Transition Markers & Stops
      legs.forEach((leg, idx) => {
        // For estimated geometry legs, add a small "estimated path" pill label at midpoint (PRD §10.4, §10.3)
        if (
          leg.geometryQuality === 'estimated' &&
          leg.geometry.coordinates.length > 0
        ) {
          const midCoords =
            leg.geometry.coordinates[
              Math.floor(leg.geometry.coordinates.length / 2)
            ];
          if (
            midCoords &&
            midCoords[0] !== undefined &&
            midCoords[1] !== undefined
          ) {
            const estEl = document.createElement('div');
            estEl.className = 'select-none pointer-events-none';
            estEl.innerHTML = `
              <div class="px-2 py-0.5 rounded-pill bg-surface-solid border border-border shadow-e1 text-[10px] font-mono font-medium text-warning flex items-center gap-1 whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full bg-warning shrink-0"></span>
                <span>estimated path</span>
              </div>
            `;
            const estMarker = new Marker({ element: estEl, anchor: 'center' })
              .setLngLat([midCoords[0], midCoords[1]])
              .addTo(map);
            markersRef.current.push(estMarker);
          }
        }

        // Add intermediate interchange chip between legs
        if (idx < legs.length - 1) {
          const nextLeg = legs[idx + 1];
          const modeColor = getModeColor(leg);
          const stopEl = document.createElement('div');
          stopEl.className =
            'stop-marker select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
          stopEl.innerHTML = `
            <div class="px-2 py-0.5 rounded-pill bg-surface-solid text-ink font-sans text-[11px] font-medium shadow-e1 border border-border flex items-center gap-1.5 whitespace-nowrap">
              <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${modeColor}"></span>
              <span class="max-w-[100px] truncate">${leg.to.name}</span>
              <span class="font-mono text-[10px] text-ink-muted shrink-0">${nextLeg ? nextLeg.departAt : leg.arriveAt}</span>
            </div>
          `;
          const stopMarker = new Marker({ element: stopEl, anchor: 'bottom' })
            .setLngLat([leg.to.lng, leg.to.lat])
            .addTo(map);
          markersRef.current.push(stopMarker);
        }
      });

      // 3. Destination Pill Marker (Mode-neutral slate background, white text)
      const destEl = document.createElement('div');
      destEl.className =
        'dest-marker select-none pointer-events-auto cursor-pointer transition-transform duration-150 hover:scale-105';
      destEl.setAttribute('role', 'button');
      destEl.setAttribute('aria-label', `Destination: ${lastLeg.to.name}`);
      destEl.innerHTML = `
        <div class="px-3 py-1.5 rounded-pill bg-slate-700 text-white font-sans text-xs font-semibold shadow-e2 border border-white/20 flex items-center gap-1.5 whitespace-nowrap">
          <span class="w-2 h-2 rounded-sm bg-white shrink-0"></span>
          <span class="max-w-[120px] md:max-w-[180px] truncate">${lastLeg.to.name}</span>
          <span class="font-mono text-[11px] opacity-80 shrink-0">${lastLeg.arriveAt}</span>
        </div>
      `;
      const destMarker = new Marker({ element: destEl, anchor: 'bottom' })
        .setLngLat([lastLeg.to.lng, lastLeg.to.lat])
        .addTo(map);
      markersRef.current.push(destMarker);
    };

    // Updates route sources and markers
    const applyRoute = (legs: Leg[], selectedIdx?: number) => {
      routeLegsRef.current = legs;
      selectedIndexRef.current = selectedIdx;
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      const source = map.getSource('route-source') as GeoJSONSource | undefined;
      if (source) {
        source.setData(buildGeoJson(legs, selectedIdx));
      }

      renderMarkers(map, legs);
    };

    // Setup MapLibre layers matching PRD §10.4 and §14.7
    const initRouteLayers = (map: MapLibreMap) => {
      if (map.getSource('route-source')) return;

      // Single GeoJSON source holding all route legs
      map.addSource('route-source', {
        type: 'geojson',
        data: buildGeoJson(routeLegsRef.current, selectedIndexRef.current),
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
      ) => {
        const legs = extractLegs(routeSet);
        applyRoute(legs, selectedLegIdx);

        // Auto-fit to route if legs exist
        if (legs.length > 0 && mapRef.current) {
          const lats = legs.flatMap((l) => [l.from.lat, l.to.lat]);
          const lngs = legs.flatMap((l) => [l.from.lng, l.to.lng]);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          const duration = prefersReducedMotionRef.current ? 0 : 900;
          mapRef.current.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 80, duration },
          );
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

      map.on('load', () => {
        initRouteLayers(map);
        startWalkAnimation(map);

        // If initialRoute had legs, fit map to them
        const initialLegs = routeLegsRef.current;
        if (initialLegs.length > 0) {
          const lats = initialLegs.flatMap((l) => [l.from.lat, l.to.lat]);
          const lngs = initialLegs.flatMap((l) => [l.from.lng, l.to.lng]);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          map.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 72, duration: 0 },
          );
        }
      });

      // Cleanup on unmount (PRD Task #5)
      return () => {
        stopWalkAnimation();
        clearMarkers();
        map.remove();
        mapRef.current = null;
      };
    }, [styleUrl]);

    // Handle updates to selectedLegIndex
    useEffect(() => {
      if (selectedLegIndex !== selectedIndexRef.current) {
        applyRoute(routeLegsRef.current, selectedLegIndex);
      }
    }, [selectedLegIndex]);

    return (
      <div
        ref={mapContainerRef}
        aria-label="Pune Interactive Transit Map"
        role="region"
        style={{ width: '100vw', height: '100vh' }}
        className={`relative overflow-hidden ${className}`}
      />
    );
  },
);

MapLibreInternal.displayName = 'MapLibreInternal';
