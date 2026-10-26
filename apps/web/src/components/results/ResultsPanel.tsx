import React, { useState } from 'react';
import { PillButton, Surface } from '../ui/index.js';
import { usePlanStore } from '../../store/plan.js';
import { ResultsSkeleton } from './ResultsSkeleton.js';
import { ResultsEmptyState } from './ResultsEmptyState.js';
import { RouteCard } from './RouteCard.js';
import { TimelineView } from './TimelineView.js';
import type { Leg, Route } from '@pocketroute/shared';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
} from 'lucide-react';

export interface ResultsPanelProps {
  onSelectLeg?: (index: number, leg: Leg) => void;
  onHoverLeg?: (index: number | null, leg?: Leg | null) => void;
  onStartSimulation?: () => void;
  isSimulating?: boolean;
  selectedLegIndex?: number;
  className?: string;
  isMobileSheet?: boolean;
}

export type MobileSnapPoint = 'peek' | 'half' | 'full';

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  onSelectLeg,
  onHoverLeg,
  onStartSimulation,
  isSimulating = false,
  selectedLegIndex,
  className = '',
  isMobileSheet = false,
}) => {
  const {
    status,
    result,
    selectedRouteKey,
    selectRouteKey,
    setBudget,
    planRoute,
    budgetINR,
    isMetroClosed,
  } = usePlanStore();

  const [snapPoint, setSnapPoint] = useState<MobileSnapPoint>('half');

  // Infeasible warning handler
  const handleFixBudget = async (minBudget: number) => {
    setBudget(minBudget);
    await planRoute();
  };

  const cycleSnapPoint = () => {
    if (snapPoint === 'peek') setSnapPoint('half');
    else if (snapPoint === 'half') setSnapPoint('full');
    else setSnapPoint('peek');
  };

  const snapClasses = {
    peek: 'h-[96px]',
    half: 'h-[50vh]',
    full: 'h-[92vh]',
  };

  const routes = result?.routes;
  const infeasible = result?.infeasible;
  const comparison = result?.comparison;
  const smartRoute = routes?.smart;
  const activeRoute: Route | null = routes
    ? ((selectedRouteKey === 'smart' ? smartRoute : routes[selectedRouteKey]) ??
      routes.fastest ??
      routes.cheapest)
    : null;

  return (
    <Surface
      elevation="e3"
      className={`flex flex-col bg-surface-solid/90 overflow-hidden transition-all duration-200 ease-out ${
        isMobileSheet
          ? `w-full rounded-t-card border-t border-border shadow-e3 ${snapClasses[snapPoint]}`
          : 'w-full max-h-[calc(100vh-32px)]'
      } ${className}`}
    >
      {/* Mobile sheet drag handle & header toggle (PRD §14.6) */}
      {isMobileSheet && (
        <button
          type="button"
          onClick={cycleSnapPoint}
          aria-label={`Results & Timeline (Current height: ${snapPoint}. Click to change snap point.)`}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer hover:bg-ink/5 transition-colors shrink-0"
        >
          <div className="w-10 h-1 rounded-full bg-ink/20 mb-1" />
          <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
            <span>Results & Timeline</span>
            {snapPoint === 'full' ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </div>
        </button>
      )}

      {/* Scrollable Container */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Route results and itinerary"
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/40"
      >
        {status === 'loading' ? (
          <ResultsSkeleton />
        ) : !result || !routes || !activeRoute ? (
          <ResultsEmptyState />
        ) : (
          <>
            {/* 1. Infeasible Budget Warning (PRD §15.2) */}
            {infeasible && (
              <div
                role="alert"
                className="p-3.5 rounded-card bg-warning/10 border border-warning/30 flex flex-col gap-2.5"
              >
                <div className="flex items-start gap-2.5 text-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-ink">
                      Budget Too Low for Transit
                    </span>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      No route exists under ₹{budgetINR}. Minimum required fare
                      to reach destination is ₹
                      {infeasible.minimumRequiredFareINR}.
                    </p>
                  </div>
                </div>

                <PillButton
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    handleFixBudget(infeasible.minimumRequiredFareINR)
                  }
                  className="self-start text-xs"
                >
                  Set budget to ₹{infeasible.minimumRequiredFareINR} & re-route
                </PillButton>
              </div>
            )}

            {/* Metro Closed Notice (PRD §22.5) */}
            {isMetroClosed() && (
              <div
                role="note"
                data-testid="metro-closed-notice"
                className="p-3 rounded-card bg-amber-500/10 border border-amber-500/30 text-xs text-ink flex items-center gap-2 shrink-0"
              >
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  Metro is closed at this time. Routed via bus and auto.
                </span>
              </div>
            )}

            {/* 2. Route Comparison Cards Row (PRD §14.5 & §15.2, Step 5a) */}
            <div
              role="radiogroup"
              aria-label="Route Alternatives"
              className="grid grid-cols-3 gap-2 shrink-0"
            >
              <RouteCard
                type="smart"
                route={smartRoute ?? null}
                selected={selectedRouteKey === 'smart'}
                savingsINR={comparison?.fareSavedVsFastestINR}
                onSelect={() => selectRouteKey('smart')}
              />

              <RouteCard
                type="fastest"
                route={routes.fastest}
                selected={selectedRouteKey === 'fastest'}
                onSelect={() => selectRouteKey('fastest')}
              />

              <RouteCard
                type="cheapest"
                route={routes.cheapest}
                selected={selectedRouteKey === 'cheapest'}
                onSelect={() => selectRouteKey('cheapest')}
              />
            </div>

            {/* 3. Summary Line (PRD §15.2) */}
            <div className="px-3 py-2 rounded-card bg-canvas/60 border border-border flex items-center justify-between text-xs text-ink shrink-0">
              <div className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-ink-muted" />
                <span>
                  Arrive at{' '}
                  <strong className="font-mono font-bold tabular-nums">
                    {activeRoute.arrivalTime}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-ink-muted">
                <span>
                  <strong className="text-ink font-bold">
                    ₹{activeRoute.totalFareINR}
                  </strong>{' '}
                  total
                </span>
                <span>·</span>
                <span>
                  {activeRoute.legs.filter((l) => l.mode !== 'WALK').length}{' '}
                  transfers
                </span>
              </div>
            </div>

            {/* 3B. Simulate Live Commute Button (PRD §22.4) */}
            <button
              type="button"
              data-testid="simulate-commute-btn"
              onClick={onStartSimulation}
              className="w-full py-2.5 px-3 rounded-btn bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {isSimulating
                  ? 'Simulating Live Commute…'
                  : 'Simulate Live Commute'}
              </span>
            </button>

            {/* 4. Timeline View (PRD §14.5, §14.8, Step 5) */}
            <TimelineView
              legs={activeRoute.legs}
              dailyPassTip={result?.dailyPassTip}
              selectedLegIndex={selectedLegIndex}
              onSelectLeg={onSelectLeg}
              onHoverLeg={onHoverLeg}
              onSnapPointReset={() => {
                if (isMobileSheet) {
                  setSnapPoint('half');
                }
              }}
            />
          </>
        )}
      </div>
    </Surface>
  );
};
