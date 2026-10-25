import React from 'react';
import type { ProfilerMetrics } from '@pocketroute/shared';

export interface RelaxationsTabProps {
  metrics: ProfilerMetrics;
}

export const RelaxationsTab: React.FC<RelaxationsTabProps> = ({ metrics }) => {
  const { pq, relaxations, labels, theory } = metrics;
  const theoreticalOps = theory.rcspp.ops;
  const measuredTotalOps = relaxations + labels.created + pq.pushes;
  const efficiencyRatio =
    theoreticalOps > 0 ? (measuredTotalOps / theoreticalOps) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 text-ink">
      {/* 1. Header */}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-base font-bold text-ink">
          Search Operations & Theoretical Ratio (PRD §8.6, §15.4)
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          Comparing measured runtime heap operations and edge relaxations
          against the theoretical worst-case bound{' '}
          <span className="font-mono text-ink font-semibold">
            {theory.rcspp.bound}
          </span>
          .
        </p>
      </div>

      {/* 2. Measured Search Operations Table */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Measured Operational Counters
        </span>
        <div
          tabIndex={0}
          role="region"
          aria-label="Measured operational counters table"
          className="overflow-x-auto rounded-card border border-border bg-surface-solid shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <table className="w-full text-xs text-left">
            <thead className="bg-canvas border-b border-border text-[11px] font-mono text-ink-muted uppercase">
              <tr>
                <th className="px-3.5 py-2">Operation Type</th>
                <th className="px-3.5 py-2 text-right">Count</th>
                <th className="px-3.5 py-2">Algorithmic Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Priority Queue Pushes
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-ink">
                  {pq.pushes.toLocaleString()}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Candidate labels inserted into min-heap
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Priority Queue Pops
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-ink">
                  {pq.pops.toLocaleString()}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Minimum arrival time states expanded
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Edge Relaxations
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-primary">
                  {relaxations.toLocaleString()}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Out-edges evaluated after Rule C macro-ride filter
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Pareto Labels Created
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-ink">
                  {labels.created.toLocaleString()}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Non-dominated state records instantiated
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Dominance Removed
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-warning">
                  {labels.dominanceRemoved.toLocaleString()}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Stale labels evicted by superior incoming paths
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-2.5 font-sans font-medium text-ink">
                  Maximum Frontier Size
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold text-success">
                  {labels.maxFrontierSize}
                </td>
                <td className="px-3.5 py-2.5 font-sans text-ink-muted">
                  Largest non-dominated frontier (bound ≤ B + 1)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Theoretical Bound vs Measured Efficiency Card */}
      <div className="p-4 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-xs text-ink uppercase tracking-wider">
            Theoretical Bound vs Measured Ratio
          </span>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-bold">
            {efficiencyRatio.toFixed(3)}% of worst-case
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded bg-canvas border border-border flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted">
              Measured Total Ops (Relaxations + Labels + Pushes)
            </span>
            <span className="font-mono text-lg font-bold text-ink tabular-nums">
              {measuredTotalOps.toLocaleString()}
            </span>
          </div>

          <div className="p-3 rounded bg-canvas border border-border flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted">
              Theoretical Bound Ops (O(E·L·B·log(V·L·B)))
            </span>
            <span className="font-mono text-lg font-bold text-primary tabular-nums">
              {theoreticalOps.toLocaleString()}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-ink-muted leading-relaxed">
          The branch-and-bound pruning rules reduce the actual search operations
          to a tiny fraction ({efficiencyRatio.toFixed(3)}%) of the theoretical
          upper bound, demonstrating the practical efficiency of Algorithm C on
          real urban networks.
        </p>
      </div>
    </div>
  );
};
