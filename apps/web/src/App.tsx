import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Styleguide } from './pages/Styleguide.js';
import { MapView, type MapViewHandle } from './map/index.js';
import { Dock } from './components/dock/index.js';
import { ResultsPanel } from './components/results/index.js';
import { InspectorSkeleton } from './components/inspector/index.js';
import { SettingsPopover } from './components/settings/index.js';
import { ErrorBoundary, PillButton, Surface } from './components/ui/index.js';
import { fixtureRoute } from './fixtures/route.js';
import { usePlanStore } from './store/plan.js';
import { api } from './lib/api.js';
import { Moon, Sun } from 'lucide-react';
import type { Leg, Route } from '@pocketroute/shared';
import { LegDetailFloatingCard } from './components/results/LegDetailFloatingCard.js';
import { CommuteSimulatorHUD } from './components/simulation/CommuteSimulatorHUD.js';
import { type ModeVariant } from './components/ui/ModeChip.js';
import { haversineMeters, getPointAtArcLength } from './map/arc-length.js';

// Lazy-load the Inspector and Recharts to keep initial route shell <= 300 KB gzip (PRD §16)
const InspectorDrawer = React.lazy(() =>
  import('./components/inspector/InspectorDrawer.js').then((m) => ({
    default: m.InspectorDrawer,
  })),
);

function getCommuterStateAtProgress(route: Route, progress: number) {
  const legs = route.legs;
  if (!legs || legs.length === 0) return null;

  const legDistances = legs.map((leg) => {
    const coords = (leg.geometry?.coordinates as [number, number][]) ?? [];
    let d = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      if (p1 && p2) {
        d += haversineMeters(p1[1], p1[0], p2[1], p2[0]);
      }
    }
    return Math.max(d, 1);
  });

  const totalDistance = legDistances.reduce((acc, d) => acc + d, 0);
  const targetDistance = Math.min(1, Math.max(0, progress)) * totalDistance;

  let acc = 0;
  let activeLegIdx = 0;
  for (let i = 0; i < legs.length; i++) {
    const dist = legDistances[i] ?? 1;
    if (targetDistance <= acc + dist || i === legs.length - 1) {
      activeLegIdx = i;
      break;
    }
    acc += dist;
  }

  const activeLeg = legs[activeLegIdx];
  if (!activeLeg) return null;

  const legDist = legDistances[activeLegIdx] ?? 1;
  const legProgress = Math.min(
    1,
    Math.max(0, (targetDistance - acc) / legDist),
  );

  const coords = (activeLeg.geometry?.coordinates as [number, number][]) ?? [];
  let lat = activeLeg.from.lat;
  let lng = activeLeg.from.lng;

  if (coords.length > 1) {
    const arc = getPointAtArcLength(coords, legProgress, 0);
    if (arc) {
      lng = arc.point[0];
      lat = arc.point[1];
    }
  }

  let moneySpent = 0;
  for (let i = 0; i <= activeLegIdx; i++) {
    const legItem = legs[i];
    if (legItem) {
      moneySpent += legItem.fareINR || 0;
    }
  }

  const [depH, depM] = (route.departureTime || '09:00').split(':').map(Number);
  const elapsedMin = Math.round(progress * (route.durationMin || 0));
  const currentTotalMins = ((depH || 0) * 60 + (depM || 0) + elapsedMin) % 1440;
  const hStr = String(Math.floor(currentTotalMins / 60)).padStart(2, '0');
  const mStr = String(currentTotalMins % 60).padStart(2, '0');
  const currentTime = `${hStr}:${mStr}`;

  return {
    point: { lat, lng, mode: activeLeg.mode },
    mode: activeLeg.mode,
    moneySpent,
    currentTime,
  };
}

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  const [selectedLegIdx, setSelectedLegIdx] = useState<number | undefined>(
    undefined,
  );
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const mapRef = useRef<MapViewHandle>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const [pinChoicePoint, setPinChoicePoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pinAddress, setPinAddress] = useState<string>('');
  const [hoveredLegIdx, setHoveredLegIdx] = useState<number | null>(null);

  // Live Commute Simulation State (PRD §22.4)
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSimPlaying, setIsSimPlaying] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);
  const [simMoneySpent, setSimMoneySpent] = useState<number>(0);
  const [simCurrentTime, setSimCurrentTime] = useState<string>('00:00');
  const [simCurrentMode, setSimCurrentMode] = useState<ModeVariant>('WALK');
  const [simCommuterPoint, setSimCommuterPoint] = useState<{
    lat: number;
    lng: number;
    mode: string;
  } | null>(null);

  const simRafRef = useRef<number | null>(null);
  const simStartTimeRef = useRef<number>(0);
  const simPausedAtRef = useRef<number>(0);
  const DURATION_MS = 20000;

  const {
    result,
    selectedRouteKey,
    budgetINR,
    userLocation,
    requestCurrentLocation,
    setOrigin,
    setDestination,
    loadParams,
  } = usePlanStore();

  // Load transit operating parameters from /api/v1/params
  useEffect(() => {
    loadParams();
  }, [loadParams]);

  // Active route: either planned route from store or default fixture route
  const activeRoute: Route = result?.routes[selectedRouteKey] ?? fixtureRoute;

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update map when active route changes
  useEffect(() => {
    if (mapRef.current && activeRoute) {
      mapRef.current.setRoute(activeRoute, selectedLegIdx, result?.routes);
    }
  }, [activeRoute, selectedLegIdx, result?.routes]);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const updateSimAtProgress = (p: number) => {
    const state = getCommuterStateAtProgress(activeRoute, p);
    if (!state) return;
    setSimProgress(p);
    setSimCommuterPoint(state.point);
    setSimCurrentMode(state.mode);
    setSimMoneySpent(state.moneySpent);
    setSimCurrentTime(state.currentTime);
  };

  const handleStartSimulation = () => {
    setIsSimulating(true);
    setSimProgress(0);
    simPausedAtRef.current = 0;
    updateSimAtProgress(0);

    if (prefersReducedMotion) {
      setIsSimPlaying(false);
      return;
    }

    setIsSimPlaying(true);
    simStartTimeRef.current = performance.now();
  };

  const handleTogglePlaySim = () => {
    if (isSimPlaying) {
      if (simRafRef.current) {
        cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      simPausedAtRef.current = simProgress * DURATION_MS;
      setIsSimPlaying(false);
    } else {
      if (simProgress >= 1) {
        simPausedAtRef.current = 0;
        setSimProgress(0);
      }
      setIsSimPlaying(true);
      simStartTimeRef.current = performance.now() - simPausedAtRef.current;
    }
  };

  const handleRestartSim = () => {
    if (simRafRef.current) {
      cancelAnimationFrame(simRafRef.current);
      simRafRef.current = null;
    }
    simPausedAtRef.current = 0;
    setSimProgress(0);
    updateSimAtProgress(0);
    if (!prefersReducedMotion) {
      setIsSimPlaying(true);
      simStartTimeRef.current = performance.now();
    } else {
      setIsSimPlaying(false);
    }
  };

  const handleCloseSim = () => {
    if (simRafRef.current) {
      cancelAnimationFrame(simRafRef.current);
      simRafRef.current = null;
    }
    setIsSimulating(false);
    setIsSimPlaying(false);
    setSimCommuterPoint(null);
  };

  const handleSeekSim = (p: number) => {
    simPausedAtRef.current = p * DURATION_MS;
    if (isSimPlaying) {
      simStartTimeRef.current = performance.now() - simPausedAtRef.current;
    }
    updateSimAtProgress(p);
  };

  // 60 fps simulation animation loop
  useEffect(() => {
    if (!isSimulating || !isSimPlaying) {
      if (simRafRef.current) {
        cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      const elapsed = now - simStartTimeRef.current;
      const p = Math.min(1, Math.max(0, elapsed / DURATION_MS));
      updateSimAtProgress(p);

      if (p >= 1) {
        setIsSimPlaying(false);
        simRafRef.current = null;
      } else {
        simRafRef.current = requestAnimationFrame(tick);
      }
    };

    simRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (simRafRef.current) {
        cancelAnimationFrame(simRafRef.current);
        simRafRef.current = null;
      }
    };
  }, [isSimulating, isSimPlaying, activeRoute]);

  // Dedicated /styleguide route
  if (currentPath === '/styleguide') {
    return <Styleguide />;
  }

  // Handle clicking a timeline leg (PRD §22.4)
  const handleSelectLeg = (idx: number, leg: Leg) => {
    setSelectedLegIdx(idx);
    if (mapRef.current) {
      mapRef.current.setRoute(activeRoute, idx, result?.routes);

      // Fit bounds to selected leg with padding clearing dock and bottom sheet (PRD §22.4)
      const lats = [leg.from.lat, leg.to.lat];
      const lngs = [leg.from.lng, leg.to.lng];
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

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
          : { top: 180, bottom: 350, left: 32, right: 32 };

      mapRef.current.flyToBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding, duration: 900 },
      );
    }
  };

  // Map Click-to-Pin Handler (PRD §22.3)
  const handleMapClick = async (point: { lat: number; lng: number }) => {
    const currentOrigin = usePlanStore.getState().origin;
    const currentDest = usePlanStore.getState().destination;

    if (!currentOrigin) {
      try {
        const geo = await api.reverseGeocode(point.lat, point.lng);
        setOrigin({
          name:
            geo.displayName ||
            `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
          lat: point.lat,
          lng: point.lng,
        });
      } catch {
        setOrigin({
          name: `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
          lat: point.lat,
          lng: point.lng,
        });
      }
      if (currentDest) {
        await usePlanStore.getState().planRoute();
      }
    } else if (!currentDest) {
      try {
        const geo = await api.reverseGeocode(point.lat, point.lng);
        setDestination({
          name:
            geo.displayName ||
            `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
          lat: point.lat,
          lng: point.lng,
        });
      } catch {
        setDestination({
          name: `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
          lat: point.lat,
          lng: point.lng,
        });
      }
      await usePlanStore.getState().planRoute();
    } else {
      // Both filled: ask "Set as Start or Destination?"
      setPinChoicePoint(point);
      setPinAddress(`(${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);
      try {
        const geo = await api.reverseGeocode(point.lat, point.lng);
        if (geo.areaName) setPinAddress(geo.areaName);
      } catch {
        // Fallback already prepared
      }
    }
  };

  const handleSetPinnedAsStart = async () => {
    if (!pinChoicePoint) return;
    const point = pinChoicePoint;
    setPinChoicePoint(null);
    try {
      const geo = await api.reverseGeocode(point.lat, point.lng);
      setOrigin({
        name:
          geo.displayName ||
          `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      });
    } catch {
      setOrigin({
        name: `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      });
    }
    const state = usePlanStore.getState();
    if (state.origin && state.destination) {
      await state.planRoute();
    }
  };

  const handleSetPinnedAsDestination = async () => {
    if (!pinChoicePoint) return;
    const point = pinChoicePoint;
    setPinChoicePoint(null);
    try {
      const geo = await api.reverseGeocode(point.lat, point.lng);
      setDestination({
        name:
          geo.displayName ||
          `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      });
    } catch {
      setDestination({
        name: `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      });
    }
    const state = usePlanStore.getState();
    if (state.origin && state.destination) {
      await state.planRoute();
    }
  };

  // Draggable Marker Release Handler (PRD §22.3)
  const handleMarkerDragEnd = async (
    type: 'origin' | 'destination',
    point: { lat: number; lng: number },
  ) => {
    try {
      const geo = await api.reverseGeocode(point.lat, point.lng);
      const updated = {
        name:
          geo.displayName ||
          `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      };
      if (type === 'origin') {
        setOrigin(updated);
      } else {
        setDestination(updated);
      }
    } catch {
      const fallback = {
        name: `Location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lat: point.lat,
        lng: point.lng,
      };
      if (type === 'origin') {
        setOrigin(fallback);
      } else {
        setDestination(fallback);
      }
    }
    const state = usePlanStore.getState();
    if (state.origin && state.destination) {
      await state.planRoute();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-canvas">
      {/* 1. Full-screen Interactive Vector Map Layer wrapped in Error Boundary (PRD §10.4 & §16) */}
      <ErrorBoundary
        fallbackTitle="Map Rendering Error"
        fallbackMessage="MapLibre vector styles failed to render. You can still plan routes using the search dock."
        className="absolute inset-0 z-0"
      >
        <MapView
          ref={mapRef}
          initialRoute={activeRoute}
          allRoutes={result?.routes}
          selectedLegIndex={selectedLegIdx}
          onLegClick={(idx, leg) => handleSelectLeg(idx, leg)}
          userLocation={userLocation}
          onMyLocationClick={requestCurrentLocation}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
          hoveredLegIndex={hoveredLegIdx}
          simulatedCommuter={simCommuterPoint}
        />
      </ErrorBoundary>

      {/* 1C. Map Pin Choice Dialog (PRD §22.3) */}
      {pinChoicePoint && (
        <div
          role="dialog"
          aria-label="Set point as Start or Destination"
          data-testid="pin-choice-prompt"
          className="absolute top-20 left-1/2 -translate-x-1/2 z-[450] bg-surface-solid shadow-e3 border border-border rounded-xl p-4 flex flex-col gap-3 min-w-[280px] max-w-[340px] text-ink animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">
              Set as Start or Destination?
            </span>
            <button
              type="button"
              onClick={() => setPinChoicePoint(null)}
              className="text-ink-muted hover:text-ink text-sm p-1 font-bold cursor-pointer"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
          <div className="text-[11px] text-ink-muted truncate">
            Pinned: <span className="font-medium text-ink">{pinAddress}</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              data-testid="set-as-start-btn"
              onClick={handleSetPinnedAsStart}
              className="flex-1 py-1.5 px-3 rounded-btn text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Set Start
            </button>
            <button
              type="button"
              data-testid="set-as-dest-btn"
              onClick={handleSetPinnedAsDestination}
              className="flex-1 py-1.5 px-3 rounded-btn text-xs font-medium bg-[#f43f5e] hover:bg-rose-600 text-white shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Set Dest
            </button>
          </div>
        </div>
      )}

      {/* 1D. Floating Leg Detail Card (PRD §22.4) */}
      {selectedLegIdx !== undefined && activeRoute.legs[selectedLegIdx] && (
        <LegDetailFloatingCard
          leg={activeRoute.legs[selectedLegIdx]}
          legIndex={selectedLegIdx}
          totalLegs={activeRoute.legs.length}
          onClose={() => setSelectedLegIdx(undefined)}
        />
      )}

      {/* 1E. Live Commute Simulation HUD (PRD §22.4) */}
      {isSimulating && (
        <CommuteSimulatorHUD
          isPlaying={isSimPlaying}
          onTogglePlay={handleTogglePlaySim}
          onRestart={handleRestartSim}
          onClose={handleCloseSim}
          progress={simProgress}
          onSeek={handleSeekSim}
          currentTime={simCurrentTime}
          moneySpent={simMoneySpent}
          currentMode={simCurrentMode}
          isReducedMotion={prefersReducedMotion}
        />
      )}

      {/* 1B. Map Safe Zone Overlay Layer (PRD §22.1a) */}
      <div
        className="pointer-events-none absolute inset-0 z-[25] flex flex-col justify-start overflow-hidden safe-area-inset"
        aria-hidden="true"
      >
        {/* Desktop: safe offset by dock 380px + 16px buffer = 396px */}
        <div className="hidden lg:flex pl-[396px] pt-20 pr-4 gap-3 pointer-events-none">
          <div
            id="desktop-map-overlay-zone"
            className="flex items-center gap-2 pointer-events-none"
          />
        </div>
        {/* Tablet: safe offset by dock 360px + 16px buffer = 376px */}
        <div className="hidden sm:flex lg:hidden pl-[376px] pt-20 pr-4 gap-3 pointer-events-none">
          <div
            id="tablet-map-overlay-zone"
            className="flex items-center gap-2 pointer-events-none"
          />
        </div>
      </div>

      {/* Top Header Navigation (Shared across viewports) */}
      <header
        role="banner"
        className="absolute top-4 left-4 z-30 flex items-center gap-2 pointer-events-none"
      >
        <Surface
          elevation="e2"
          className="pointer-events-auto px-3.5 py-2 flex items-center gap-3 bg-surface-solid/90 border border-border"
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold tracking-tight text-ink">
              PocketRoute
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-contrast font-bold">
              PUNE
            </span>
          </div>

          <div className="h-4 w-px bg-border mx-0.5" aria-hidden="true" />

          <div className="flex items-center gap-1.5">
            <button
              ref={inspectorTriggerRef}
              type="button"
              onClick={() => setIsInspectorOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isInspectorOpen}
              className="px-2.5 py-1 text-xs font-semibold rounded-card border border-border bg-surface-solid hover:bg-canvas text-ink transition-colors shadow-e1 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              DAA Inspector
            </button>

            <PillButton
              variant="secondary"
              size="sm"
              onClick={() => navigateTo('/styleguide')}
              aria-label="View design system styleguide"
            >
              Styleguide
            </PillButton>

            <SettingsPopover />

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === 'light'
                  ? 'Switch to dark theme'
                  : 'Switch to light theme'
              }
              className="p-2 rounded-full text-ink-muted hover:text-ink hover:bg-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
          </div>
        </Surface>
      </header>

      {/* 2. Responsive UI Layers (PRD §14.6) */}

      {/* 2A. Mobile Viewport (< 640 px): Top dock card, bottom sheet results card */}
      <div className="sm:hidden absolute inset-0 pointer-events-none z-20 flex flex-col justify-between safe-area-inset">
        {/* Top dock card */}
        <div className="pointer-events-auto mt-14 px-2 w-full max-h-[44vh] overflow-y-auto">
          <ErrorBoundary
            fallbackTitle="Dock Error"
            fallbackMessage="Failed to load search dock."
          >
            <Dock
              onSuccess={() => {
                setSelectedLegIdx(undefined);
              }}
            />
          </ErrorBoundary>
        </div>

        {/* Bottom sheet results card with snap points */}
        <div className="pointer-events-auto w-full">
          <ErrorBoundary
            fallbackTitle="Results Error"
            fallbackMessage="Failed to load route results."
          >
            <ResultsPanel
              isMobileSheet={true}
              selectedLegIndex={selectedLegIdx}
              onSelectLeg={handleSelectLeg}
              onHoverLeg={setHoveredLegIdx}
              onStartSimulation={handleStartSimulation}
              isSimulating={isSimulating}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* 2B. Tablet Viewport (640 px to 1023 px): Left column floating dock (360 px), results below dock */}
      <div className="hidden sm:flex lg:hidden absolute top-16 left-4 z-20 w-[360px] max-h-[calc(100vh-80px)] flex-col gap-3 pointer-events-none safe-area-left safe-area-bottom">
        <div className="pointer-events-auto shrink-0">
          <ErrorBoundary
            fallbackTitle="Dock Error"
            fallbackMessage="Failed to load search dock."
          >
            <Dock
              onSuccess={() => {
                setSelectedLegIdx(undefined);
              }}
            />
          </ErrorBoundary>
        </div>

        <div className="pointer-events-auto flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary
            fallbackTitle="Results Error"
            fallbackMessage="Failed to load route results."
          >
            <ResultsPanel
              selectedLegIndex={selectedLegIdx}
              onSelectLeg={handleSelectLeg}
              onHoverLeg={setHoveredLegIdx}
              onStartSimulation={handleStartSimulation}
              isSimulating={isSimulating}
              className="max-h-[calc(100vh-420px)]"
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* 2C. Desktop Viewport (>= 1024 px): Dock 380 px left, results panel 420 px right */}
      <div className="hidden lg:block">
        {/* Left Dock: 380 px */}
        <aside
          aria-label="Transit Planning Dock"
          className="absolute top-16 left-4 z-20 w-[380px] pointer-events-none safe-area-left"
        >
          <div className="pointer-events-auto">
            <ErrorBoundary
              fallbackTitle="Dock Error"
              fallbackMessage="Failed to load search dock."
            >
              <Dock
                onSuccess={() => {
                  setSelectedLegIdx(undefined);
                }}
              />
            </ErrorBoundary>
          </div>
        </aside>

        {/* Right Results Panel: 420 px */}
        <aside
          aria-label="Route Results and Itinerary"
          className="absolute top-4 right-4 z-20 w-[420px] max-h-[calc(100vh-32px)] pointer-events-none safe-area-right safe-area-bottom"
        >
          <div className="pointer-events-auto h-full">
            <ErrorBoundary
              fallbackTitle="Results Error"
              fallbackMessage="Failed to load route results."
            >
              <ResultsPanel
                selectedLegIndex={selectedLegIdx}
                onSelectLeg={handleSelectLeg}
                onHoverLeg={setHoveredLegIdx}
                onStartSimulation={handleStartSimulation}
                isSimulating={isSimulating}
                className="max-h-[calc(100vh-32px)]"
              />
            </ErrorBoundary>
          </div>
        </aside>
      </div>

      {/* 3. DAA Algorithm & Complexity Inspector Drawer (PRD §15.4) wrapped in Suspense & ErrorBoundary */}
      {isInspectorOpen && (
        <ErrorBoundary
          fallbackTitle="Inspector Error"
          fallbackMessage="Unable to load the DAA Algorithm Inspector."
          onReset={() => setIsInspectorOpen(false)}
        >
          <Suspense fallback={<InspectorSkeleton />}>
            <InspectorDrawer
              isOpen={isInspectorOpen}
              onClose={() => setIsInspectorOpen(false)}
              triggerRef={inspectorTriggerRef}
              metrics={result?.metrics ?? null}
              budgetINR={result?.budgetINR ?? budgetINR}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
};
