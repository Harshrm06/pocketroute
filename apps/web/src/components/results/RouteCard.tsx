import React from 'react';
import { Card } from '../ui/index.js';
import type { Route } from '@pocketroute/shared';
import { Sparkles, TrendingDown, Zap } from 'lucide-react';

export interface RouteCardProps {
  type: 'smart' | 'fastest' | 'cheapest';
  route: Route | null;
  selected: boolean;
  savingsINR?: number | null;
  onSelect: () => void;
}

export function formatTime12(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mStr = m.toString().padStart(2, '0');
  return `${h12}:${mStr} ${period}`;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  type,
  route,
  selected,
  savingsINR,
  onSelect,
}) => {
  const isSmart = type === 'smart';
  const isFastest = type === 'fastest';

  const busLegs = route?.legs.filter((l) => l.mode === 'BUS') || [];

  return (
    <Card
      interactive
      selected={selected}
      role="radio"
      aria-checked={selected}
      aria-label={
        route
          ? `${type.toUpperCase()} route: ₹${route.totalFareINR}, ${route.durationMin} minutes, arriving ${formatTime12(route.arrivalTime)}`
          : `${type.toUpperCase()} route infeasible`
      }
      onClick={onSelect}
      className={`p-2.5 flex flex-col justify-between gap-1.5 transition-all ${
        selected && isSmart
          ? 'ring-2 ring-success border-success/40 bg-success/5'
          : selected
            ? 'ring-2 ring-primary border-primary/40 bg-primary/5'
            : isSmart
              ? 'hover:border-success/30'
              : 'hover:border-ink/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[10px] font-bold flex items-center gap-0.5 ${
            isSmart
              ? 'text-success'
              : isFastest
                ? 'text-warning'
                : 'text-primary'
          }`}
        >
          {isSmart && <Sparkles className="w-3 h-3" />}
          {isFastest && <Zap className="w-3 h-3 text-warning" />}
          {!isSmart && !isFastest && (
            <TrendingDown className="w-3 h-3 text-primary" />
          )}
          {type.toUpperCase()}
        </span>

        {isSmart && savingsINR ? (
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-success/15 text-success font-semibold">
            -₹{savingsINR}
          </span>
        ) : null}
      </div>

      <div>
        {route ? (
          <>
            <div className="font-mono text-base font-bold text-ink tabular-nums leading-none">
              ₹{route.totalFareINR}
            </div>
            <div className="font-mono text-[11px] text-ink-muted tabular-nums mt-0.5">
              {route.durationMin}m · {formatTime12(route.arrivalTime)}
            </div>

            {/* Bus pills if any bus legs exist (Step 5a) */}
            {busLegs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5 pt-1 border-t border-border/50">
                {busLegs.map((busLeg, i) => {
                  const numbers =
                    busLeg.routeNumbers && busLeg.routeNumbers.length > 0
                      ? busLeg.routeNumbers
                      : [busLeg.lineId.replace(/^BUS_/, '')];
                  const primaryNo = numbers[0]!;
                  const secondaryNo = numbers[1];

                  return (
                    <div
                      key={`bus-pill-${i}`}
                      className="inline-flex items-center gap-1"
                    >
                      <span
                        data-testid="bus-pill-primary"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border border-emerald-600/30 font-mono"
                      >
                        <span>🚌</span>
                        <span>Bus {primaryNo}</span>
                      </span>
                      {secondaryNo && (
                        <span
                          data-testid="bus-pill-secondary"
                          className="text-[9px] px-1 py-0.2 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 font-mono"
                        >
                          or Bus {secondaryNo}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="font-mono text-sm font-bold text-warning tabular-nums leading-none">
              Infeasible
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5">Over budget</div>
          </>
        )}
      </div>
    </Card>
  );
};
