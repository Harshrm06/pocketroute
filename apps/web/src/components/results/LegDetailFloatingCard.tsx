import React from 'react';
import type { Leg } from '@pocketroute/shared';
import { ModeChip } from '../ui/index.js';
import { Clock, MapPin, X, ArrowRight } from 'lucide-react';

export interface LegDetailFloatingCardProps {
  leg: Leg;
  legIndex: number;
  totalLegs: number;
  onClose: () => void;
}

export const LegDetailFloatingCard: React.FC<LegDetailFloatingCardProps> = ({
  leg,
  legIndex,
  totalLegs,
  onClose,
}) => {
  return (
    <div
      data-testid="leg-detail-floating-card"
      role="region"
      aria-label={`Leg ${legIndex + 1} details: ${leg.instruction}`}
      className="absolute top-20 left-4 z-[450] sm:left-[396px] max-w-[340px] w-full bg-surface-solid/95 backdrop-blur-md rounded-card shadow-e3 border border-border p-3.5 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ModeChip
            mode={
              leg.lineId === 'METRO_PURPLE'
                ? 'METRO_PURPLE'
                : leg.lineId === 'METRO_AQUA'
                  ? 'METRO_AQUA'
                  : leg.mode
            }
          />
          <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
            Leg {legIndex + 1} of {totalLegs}
          </span>
        </div>
        <button
          type="button"
          data-testid="close-leg-detail-btn"
          onClick={onClose}
          aria-label="Close leg details"
          className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-canvas transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-xs font-bold text-ink leading-snug">
        {leg.instruction}
      </div>

      <div className="flex flex-col gap-1.5 text-[11px] text-ink-muted border-t border-border/60 pt-2 font-mono">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 truncate text-ink">
            <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate">{leg.from.name}</span>
          </span>
          <span className="shrink-0 font-bold">{leg.departAt}</span>
        </div>

        <div className="flex items-center justify-center text-ink-muted/60 my-0.5">
          <ArrowRight className="w-3.5 h-3.5 rotate-90" />
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 truncate text-ink">
            <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
            <span className="truncate">{leg.to.name}</span>
          </span>
          <span className="shrink-0 font-bold">{leg.arriveAt}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs border-t border-border/60 pt-2">
        <div className="flex items-center gap-1.5 text-ink-muted">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">
            {leg.durationMin} min ({leg.distanceKm.toFixed(1)} km)
          </span>
        </div>
        <span className="font-mono font-bold text-ink">
          {leg.fareINR > 0 ? `₹${leg.fareINR}` : 'Free'}
        </span>
      </div>
    </div>
  );
};
