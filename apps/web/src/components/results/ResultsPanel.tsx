import React, { useState } from 'react';
import { Card, ModeChip, PillButton, Surface } from '../ui/index.js';
import { usePlanStore } from '../../store/plan.js';
import { ResultsSkeleton } from './ResultsSkeleton.js';
import { ResultsEmptyState } from './ResultsEmptyState.js';
import type { Leg, Route } from '@pocketroute/shared';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Play,
  Sparkles,
  TrendingDown,
  Zap,
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

            {/* 2. Route Comparison Cards Row (PRD §14.5 & §15.2) */}
            <div
              role="radiogroup"
              aria-label="Route Alternatives"
              className="grid grid-cols-3 gap-2 shrink-0"
            >
              {/* Smart Card (RCSPP) */}
              <Card
                interactive
                selected={selectedRouteKey === 'smart'}
                role="radio"
                aria-checked={selectedRouteKey === 'smart'}
                aria-label={
                  smartRoute
                    ? `Smart route: ₹${smartRoute.totalFareINR}, ${smartRoute.durationMin} minutes, arriving ${smartRoute.arrivalTime}`
                    : 'Smart route infeasible'
                }
                onClick={() => selectRouteKey('smart')}
                className={`p-2.5 flex flex-col justify-between gap-1 transition-all ${
                  selectedRouteKey === 'smart'
                    ? 'ring-2 ring-success border-success/40 bg-success/5'
                    : 'hover:border-success/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-success flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" />
                    SMART
                  </span>
                  {comparison?.fareSavedVsFastestINR ? (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-success/15 text-success font-semibold">
                      -₹{comparison.fareSavedVsFastestINR}
                    </span>
                  ) : null}
                </div>
                <div>
                  {smartRoute ? (
                    <>
                      <div className="font-mono text-base font-bold text-ink tabular-nums leading-none">
                        ₹{smartRoute.totalFareINR}
                      </div>
                      <div className="font-mono text-[11px] text-ink-muted tabular-nums mt-0.5">
                        {smartRoute.durationMin}m · {smartRoute.arrivalTime}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-sm font-bold text-warning tabular-nums leading-none">
                        Infeasible
                      </div>
                      <div className="text-[10px] text-ink-muted mt-0.5">
                        Over budget
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Fastest Card (Dijkstra TIME) */}
              <Card
                interactive
                selected={selectedRouteKey === 'fastest'}
                role="radio"
                aria-checked={selectedRouteKey === 'fastest'}
                aria-label={`Fastest route: ₹${routes.fastest.totalFareINR}, ${routes.fastest.durationMin} minutes, arriving ${routes.fastest.arrivalTime}`}
                onClick={() => selectRouteKey('fastest')}
                className="p-2.5 flex flex-col justify-between gap-1"
              >
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="text-[10px] font-bold flex items-center gap-0.5">
                    <Zap className="w-3 h-3 text-warning" />
                    FASTEST
                  </span>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-ink tabular-nums leading-none">
                    ₹{routes.fastest.totalFareINR}
                  </div>
                  <div className="font-mono text-[11px] text-ink-muted tabular-nums mt-0.5">
                    {routes.fastest.durationMin}m · {routes.fastest.arrivalTime}
                  </div>
                </div>
              </Card>

              {/* Cheapest Card (Dijkstra COST) */}
              <Card
                interactive
                selected={selectedRouteKey === 'cheapest'}
                role="radio"
                aria-checked={selectedRouteKey === 'cheapest'}
                aria-label={`Cheapest route: ₹${routes.cheapest.totalFareINR}, ${routes.cheapest.durationMin} minutes, arriving ${routes.cheapest.arrivalTime}`}
                onClick={() => selectRouteKey('cheapest')}
                className="p-2.5 flex flex-col justify-between gap-1"
              >
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="text-[10px] font-bold flex items-center gap-0.5">
                    <TrendingDown className="w-3 h-3 text-primary" />
                    CHEAPEST
                  </span>
                </div>
                <div>
                  <div className="font-mono text-base font-bold text-ink tabular-nums leading-none">
                    ₹{routes.cheapest.totalFareINR}
                  </div>
                  <div className="font-mono text-[11px] text-ink-muted tabular-nums mt-0.5">
                    {routes.cheapest.durationMin}m ·{' '}
                    {routes.cheapest.arrivalTime}
                  </div>
                </div>
              </Card>
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

            {/* 4. Timeline Ordered List (PRD §14.5, §14.8) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Route Timeline ({activeRoute.legs.length} Legs)
                </h4>
                <span className="text-[10px] text-ink-muted italic">
                  Tap leg to inspect on map
                </span>
              </div>

              <ol
                aria-label="Route step-by-step itinerary"
                className="flex flex-col relative border-l-2 border-border ml-3 pl-4 space-y-3"
              >
                {activeRoute.legs.map((leg, idx) => {
                  const isSelected = selectedLegIndex === idx;

                  return (
                    <li
                      key={`${leg.mode}-${idx}`}
                      className="relative group focus-within:ring-2 focus-within:ring-focus rounded-card"
                    >
                      {/* Node Circle on the rail */}
                      <div
                        aria-hidden="true"
                        className={`absolute -left-[23px] top-2.5 w-3 h-3 rounded-full border-2 bg-surface-solid transition-colors ${
                          isSelected
                            ? 'border-focus ring-2 ring-focus/30'
                            : 'border-border group-hover:border-ink'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          if (isMobileSheet) {
                            setSnapPoint('half');
                          }
                          onSelectLeg?.(idx, leg);
                        }}
                        onMouseEnter={() => onHoverLeg?.(idx, leg)}
                        onMouseLeave={() => onHoverLeg?.(null, null)}
                        className={`w-full text-left p-2.5 rounded-card border transition-all select-none flex flex-col gap-1.5 ${
                          isSelected
                            ? 'bg-surface-solid border-focus ring-1 ring-focus shadow-e1'
                            : 'bg-surface-solid/70 border-border hover:bg-surface-solid hover:border-ink/20'
                        }`}
                        aria-label={`Leg ${idx + 1}: Board ${leg.mode} at ${
                          leg.departAt
                        } from ${leg.from.name}, arrive ${leg.to.name} at ${
                          leg.arriveAt
                        }, fare ₹${leg.fareINR}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ModeChip
                              mode={
                                leg.lineId === 'METRO_PURPLE'
                                  ? 'METRO_PURPLE'
                                  : leg.lineId === 'METRO_AQUA'
                                    ? 'METRO_AQUA'
                                    : leg.mode
                              }
                              iconOnly
                            />
                            <span className="font-semibold text-xs text-ink truncate">
                              {leg.instruction}
                            </span>
                          </div>

                          <span className="font-mono text-xs font-bold text-ink shrink-0 tabular-nums">
                            {leg.fareINR > 0 ? `₹${leg.fareINR}` : 'Free'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-ink-muted font-mono tabular-nums">
                          <span>
                            {leg.departAt} → {leg.arriveAt} ({leg.durationMin}m)
                          </span>

                          {leg.waitMin > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-sans font-medium">
                              Wait {leg.waitMin} min (scheduled)
                            </span>
                          ) : (
                            <span className="text-[10px] text-ink-muted">
                              {leg.distanceKm.toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>
    </Surface>
  );
};
