import React, { useState } from 'react';
import type { Leg } from '@pocketroute/shared';
import { ModeChip } from '../ui/index.js';
import { formatTime12 } from './RouteCard.js';
import { ChevronDown, Layers } from 'lucide-react';

export interface TimelineViewProps {
  legs: Leg[];
  dailyPassTip?: string | null;
  selectedLegIndex?: number;
  onSelectLeg?: (index: number, leg: Leg) => void;
  onHoverLeg?: (index: number | null, leg?: Leg | null) => void;
  onSnapPointReset?: () => void;
}

interface BusLegDetailsProps {
  leg: Leg;
}

const BusLegDetails: React.FC<BusLegDetailsProps> = ({ leg }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const numbers =
    leg.routeNumbers && leg.routeNumbers.length > 0
      ? leg.routeNumbers
      : [leg.lineId.replace(/^BUS_/, '')];
  const primaryNo = numbers[0]!;
  const secondaryNo = numbers[1];

  const stopCount =
    leg.intermediateStopsCount ?? leg.intermediateStops?.length ?? 0;
  const stops = leg.intermediateStops || [];

  return (
    <div className="flex flex-col gap-1 mt-1 text-xs text-ink">
      {/* Route numbers pill and headsign */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="bus-pill-primary"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border border-emerald-600/30 font-mono"
        >
          <span>🚌</span>
          <span>Bus {primaryNo}</span>
        </span>
        {secondaryNo && (
          <span
            data-testid="bus-pill-secondary"
            className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 font-mono"
          >
            or Bus {secondaryNo}
          </span>
        )}
        {leg.routeName && (
          <span className="text-[11px] font-medium text-ink-muted">
            {leg.routeName}
          </span>
        )}
      </div>

      {/* Boarding and alighting stop info */}
      <div className="flex flex-col gap-0.5 text-[11px] text-ink-muted">
        <div>
          <span className="font-semibold text-ink">Board:</span>{' '}
          {leg.boardingStop || leg.from.name}
          {leg.headsign && <span> (Towards {leg.headsign})</span>}
        </div>
        <div>
          <span className="font-semibold text-ink">Alight:</span>{' '}
          {leg.alightingStop || leg.to.name}
        </div>
      </div>

      {/* Expandable intermediate stops */}
      {stopCount > 0 && (
        <div className="mt-1">
          <button
            type="button"
            data-testid="expand-stops-btn"
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <span>{stopCount} stops</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {expanded && stops.length > 0 && (
            <div className="mt-1 pl-2.5 border-l-2 border-emerald-500/30 flex flex-col gap-0.5 text-[10px] text-ink-muted max-h-36 overflow-y-auto">
              {stops.map((stopName, sIdx) => (
                <span key={`stop-${sIdx}`}>• {stopName}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SchedulePillProps {
  leg: Leg;
}

const SchedulePill: React.FC<SchedulePillProps> = ({ leg }) => {
  const depTime = formatTime12(leg.scheduledDeparture || leg.departAt);
  const arrTime = formatTime12(leg.scheduledArrival || leg.arriveAt);
  const boardingName = leg.boardingStop || leg.from.name;
  const isBus = leg.mode === 'BUS';

  const nextDepartures = (leg.nextDepartures || []).map((t) => formatTime12(t));
  const freqMin = leg.frequencyMinutes;

  return (
    <div
      data-testid="schedule-pill"
      className="p-2 rounded-card bg-canvas/70 border border-border flex flex-col gap-0.5 text-xs text-ink"
    >
      <div className="font-mono font-semibold text-ink flex items-center gap-1.5 tabular-nums">
        <span>Departs {depTime}</span>
        <span>→</span>
        <span>Arrives {arrTime}</span>
      </div>

      {(freqMin || nextDepartures.length > 0) && (
        <div className="text-[11px] text-ink-muted font-mono tabular-nums leading-tight">
          {freqMin && <span>Every {freqMin} mins</span>}
          {freqMin && nextDepartures.length > 0 && <span> • </span>}
          {nextDepartures.length > 0 && (
            <span>
              Next {isBus ? 'buses' : 'trains'} from {boardingName}:{' '}
              {nextDepartures.join(', ')}
            </span>
          )}
        </div>
      )}

      <span className="text-[10px] text-ink-muted/80 tracking-wide mt-0.5">
        Scheduled estimate, not live
      </span>
    </div>
  );
};

export const TimelineView: React.FC<TimelineViewProps> = ({
  legs,
  dailyPassTip,
  selectedLegIndex,
  onSelectLeg,
  onHoverLeg,
  onSnapPointReset,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* Daily Pass Tip Badge (Step 5d) */}
      {dailyPassTip && (
        <div
          data-testid="daily-pass-tip-badge"
          className="p-3 rounded-card bg-surface-solid border-2 border-warning text-xs text-ink font-semibold flex items-center gap-2 shadow-sm"
        >
          <span className="text-base leading-none">🎫</span>
          <span className="leading-snug">{dailyPassTip}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          Route Timeline ({legs.length} Legs)
        </h4>
        <span className="text-[10px] text-ink-muted italic">
          Tap leg to inspect on map
        </span>
      </div>

      <ol
        aria-label="Route step-by-step itinerary"
        className="flex flex-col relative border-l-2 border-border ml-3 pl-4 space-y-3"
      >
        {legs.map((leg, idx) => {
          const isSelected = selectedLegIndex === idx;
          const prevLeg = idx > 0 ? legs[idx - 1] : undefined;

          // Check if bus-to-bus transfer marker needed (Step 5b)
          const isBusToBusTransfer =
            leg.mode === 'BUS' && prevLeg && prevLeg.mode === 'BUS';
          const transferHub =
            leg.transferAt ||
            prevLeg?.alightingStop ||
            leg.boardingStop ||
            leg.from.name;
          const transferWait = leg.transferWaitMinutes ?? leg.waitMin ?? 2;

          // Build single sentence aria-label for accessibility (Step 5e)
          let singleSentence = '';
          const depTime = formatTime12(leg.scheduledDeparture || leg.departAt);
          const arrTime = formatTime12(leg.scheduledArrival || leg.arriveAt);
          if (leg.mode === 'BUS') {
            const numbers =
              leg.routeNumbers && leg.routeNumbers.length > 0
                ? leg.routeNumbers
                : [leg.lineId.replace(/^BUS_/, '')];
            const primaryNo = numbers[0]!;
            const secondaryNo = numbers[1];
            const stopCount =
              leg.intermediateStopsCount ?? leg.intermediateStops?.length ?? 0;
            singleSentence = `Leg ${idx + 1}: Board Bus ${primaryNo}${secondaryNo ? ` or Bus ${secondaryNo}` : ''} at ${depTime} from ${leg.boardingStop || leg.from.name}, ride ${stopCount} stops towards ${leg.headsign || leg.to.name}, and alight at ${leg.alightingStop || leg.to.name} at ${arrTime}, fare ₹${leg.fareINR}.`;
          } else if (leg.mode === 'METRO') {
            const lineName =
              leg.lineId === 'METRO_PURPLE'
                ? 'Purple Line'
                : leg.lineId === 'METRO_AQUA'
                  ? 'Aqua Line'
                  : 'Metro';
            singleSentence = `Leg ${idx + 1}: Board ${lineName} at ${depTime} from ${leg.from.name}, alight at ${leg.to.name} at ${arrTime}, fare ₹${leg.fareINR}.`;
          } else {
            singleSentence = `Leg ${idx + 1}: Travel by ${leg.mode} from ${leg.from.name} to ${leg.to.name}, departing at ${depTime}, arriving at ${arrTime}, fare ${leg.fareINR > 0 ? `₹${leg.fareINR}` : 'free'}.`;
          }

          return (
            <React.Fragment key={`${leg.mode}-${idx}`}>
              {/* Transfer divider between bus legs (Step 5b) */}
              {isBusToBusTransfer && (
                <div
                  data-testid="bus-transfer-divider"
                  className="my-1 -ml-2 p-2 rounded-card bg-emerald-500/10 border border-emerald-500/20 text-xs text-ink flex items-center gap-2 font-medium"
                >
                  <span className="text-sm">🔄</span>
                  <span>
                    Change Bus at <strong>{transferHub}</strong> (Wait{' '}
                    {transferWait} mins)
                  </span>
                </div>
              )}

              <li className="relative group focus-within:ring-2 focus-within:ring-focus rounded-card">
                {/* Node Circle on the rail */}
                <div
                  aria-hidden="true"
                  className={`absolute -left-[23px] top-2.5 w-3 h-3 rounded-full border-2 bg-surface-solid transition-colors ${
                    isSelected
                      ? 'border-focus ring-2 ring-focus/30'
                      : 'border-border group-hover:border-ink'
                  }`}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSnapPointReset?.();
                    onSelectLeg?.(idx, leg);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSnapPointReset?.();
                      onSelectLeg?.(idx, leg);
                    }
                  }}
                  onMouseEnter={() => onHoverLeg?.(idx, leg)}
                  onMouseLeave={() => onHoverLeg?.(null, null)}
                  className={`w-full text-left p-2.5 rounded-card border transition-all select-none flex flex-col gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-surface-solid border-focus ring-1 ring-focus shadow-e1'
                      : 'bg-surface-solid/70 border-border hover:bg-surface-solid hover:border-ink/20'
                  }`}
                  aria-label={singleSentence}
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

                  {/* BUS Leg specific metadata (Step 5a) */}
                  {leg.mode === 'BUS' && <BusLegDetails leg={leg} />}

                  {/* Schedule pill for BUS and METRO legs (Step 5c) */}
                  {(leg.mode === 'BUS' || leg.mode === 'METRO') && (
                    <SchedulePill leg={leg} />
                  )}

                  {/* Basic leg timing footer for non-transit or extra info */}
                  {leg.mode !== 'BUS' && leg.mode !== 'METRO' && (
                    <div className="flex items-center justify-between text-[11px] text-ink-muted font-mono tabular-nums">
                      <span>
                        {depTime} → {arrTime} ({leg.durationMin}m)
                      </span>
                      <span>{leg.distanceKm.toFixed(1)} km</span>
                    </div>
                  )}
                </div>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
};
