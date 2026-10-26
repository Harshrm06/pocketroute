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
import { Moon, Sun } from 'lucide-react';
import type { Leg, Route } from '@pocketroute/shared';

// Lazy-load the Inspector and Recharts to keep initial route shell <= 300 KB gzip (PRD §16)
const InspectorDrawer = React.lazy(() =>
  import('./components/inspector/InspectorDrawer.js').then((m) => ({
    default: m.InspectorDrawer,
  })),
);

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

  const { result, selectedRouteKey, budgetINR } = usePlanStore();

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

  // Dedicated /styleguide route
  if (currentPath === '/styleguide') {
    return <Styleguide />;
  }

  // Handle clicking a timeline leg
  const handleSelectLeg = (idx: number, leg: Leg) => {
    setSelectedLegIdx(idx);
    if (mapRef.current) {
      mapRef.current.setRoute(activeRoute, idx, result?.routes);

      // Fit bounds to the selected leg (PRD §10.4: 900 ms flyTo)
      const lats = [leg.from.lat, leg.to.lat];
      const lngs = [leg.from.lng, leg.to.lng];
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      mapRef.current.flyToBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 120, duration: 900 },
      );
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
        />
      </ErrorBoundary>

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
