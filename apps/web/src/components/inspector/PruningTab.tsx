import React from 'react';
import type { ProfilerMetrics } from '@pocketroute/shared';

export interface PruningTabProps {
  metrics: ProfilerMetrics;
}

export const PruningTab: React.FC<PruningTabProps> = ({ metrics }) => {
  const { budget, timeBound, dominance } = metrics.pruned;
  const total = budget + timeBound + dominance;

  const budgetPct = total > 0 ? (budget / total) * 100 : 0;
  const timeBoundPct = total > 0 ? (timeBound / total) * 100 : 0;
  const dominancePct = total > 0 ? (dominance / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 text-ink">
      {/* 1. Header & Pruning Strategy Overview */}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-base font-bold text-ink">
          Branch & Bound Pruning Counters (PRD §8.3, §15.4)
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          Algorithm C evaluates three admissible pruning criteria in order
          before pushing any candidate label to the priority queue, drastically
          reducing the exponential search space.
        </p>
      </div>

      {/* 2. Pruned Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* P1: Budget Bound */}
        <div className="p-3.5 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-warning/15 text-warning font-bold">
              RULE P1
            </span>
            <span className="font-mono text-xs text-ink-muted">
              {budgetPct.toFixed(1)}%
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-ink tabular-nums">
              {budget.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-ink">Budget Bound</div>
          </div>
          <span className="text-[11px] font-mono text-ink-muted mt-auto">
            c&apos; + LB_c[w] &gt; B
          </span>
        </div>

        {/* P2: Time Bound vs Incumbent */}
        <div className="p-3.5 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-metro-purple/15 text-metro-purple font-bold">
              RULE P2
            </span>
            <span className="font-mono text-xs text-ink-muted">
              {timeBoundPct.toFixed(1)}%
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-ink tabular-nums">
              {timeBound.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-ink">
              Time Bound vs Incumbent
            </div>
          </div>
          <span className="text-[11px] font-mono text-ink-muted mt-auto">
            t&apos; + LB_t[w] ≥ incumbent
          </span>
        </div>

        {/* P3: Pareto Dominance */}
        <div className="p-3.5 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-focus/15 text-focus font-bold">
              RULE P3
            </span>
            <span className="font-mono text-xs text-ink-muted">
              {dominancePct.toFixed(1)}%
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-ink tabular-nums">
              {dominance.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-ink">
              Pareto Dominance
            </div>
          </div>
          <span className="text-[11px] font-mono text-ink-muted mt-auto">
            Dominated by state label
          </span>
        </div>
      </div>

      {/* 3. Stacked Progress Bar (PRD §15.4) */}
      <div className="flex flex-col gap-2.5 p-4 rounded-card bg-surface-solid border border-border shadow-e1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-ink">
            Pruning Breakdown ({total.toLocaleString()} total labels avoided)
          </span>
          <span className="font-mono text-xs text-success font-bold">
            100% Admissible
          </span>
        </div>

        {/* Stacked Bar */}
        <div className="w-full h-4 rounded-full bg-canvas overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${budgetPct}%` }}
            className="h-full bg-warning transition-[width] duration-300"
            title={`Rule P1 (Budget): ${budget.toLocaleString()} (${budgetPct.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${timeBoundPct}%` }}
            className="h-full bg-metro-purple transition-[width] duration-300"
            title={`Rule P2 (Time Bound): ${timeBound.toLocaleString()} (${timeBoundPct.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${dominancePct}%` }}
            className="h-full bg-focus transition-[width] duration-300"
            title={`Rule P3 (Dominance): ${dominance.toLocaleString()} (${dominancePct.toFixed(1)}%)`}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
            <span className="font-medium text-ink">
              P1 Budget ({budgetPct.toFixed(0)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-metro-purple shrink-0" />
            <span className="font-medium text-ink">
              P2 Time Bound ({timeBoundPct.toFixed(0)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-focus shrink-0" />
            <span className="font-medium text-ink">
              P3 Dominance ({dominancePct.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>

      {/* 4. Correctness Proof Insight */}
      <div className="p-3.5 rounded-card bg-canvas border border-border text-xs text-ink-muted flex flex-col gap-1">
        <span className="font-semibold text-ink">
          Theorem 1 & Admissibility Guarantee:
        </span>
        <p className="text-[11px] leading-relaxed">
          Because <span className="font-mono text-ink">LB_c</span> and{' '}
          <span className="font-mono text-ink">LB_t</span> are computed via
          backward Dijkstra on static graph relaxations without waits, they are
          strictly admissible lower bounds. Pruning never eliminates an optimal
          or feasible Smart path.
        </p>
      </div>
    </div>
  );
};
