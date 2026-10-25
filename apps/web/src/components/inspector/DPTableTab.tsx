import React from 'react';
import type { ProfilerMetrics } from '@pocketroute/shared';

export interface DPTableTabProps {
  metrics: ProfilerMetrics;
}

interface SampleStateRow {
  stateId: string;
  stationName: string;
  lineLabel: string;
  mode: string;
  costs: Record<
    number,
    { time: string; status: 'optimal' | 'feasible' | 'pruned' | 'unreached' }
  >;
  frontier: Array<{ cost: number; time: string; optimal?: boolean }>;
}

export const DPTableTab: React.FC<DPTableTabProps> = ({ metrics }) => {
  const { V, B } = metrics.graph;
  const denseCellsCount = V * (B + 1);
  const isDense = denseCellsCount <= 20000;

  // Selected cost slabs to display horizontally
  const costCols = [0, 10, 15, 20, 30, 35, 45, 50, 60, 70, 75].filter(
    (c) => c <= B,
  );

  // Representative states across lines and macro rides
  const sampleRows: SampleStateRow[] = [
    {
      stateId: 'swargate|NONE',
      stationName: 'Swargate (Origin)',
      lineLabel: 'Walk Access',
      mode: 'WALK',
      costs: {
        0: { time: '17:30', status: 'optimal' },
        10: { time: '17:30', status: 'feasible' },
        15: { time: '17:30', status: 'feasible' },
        20: { time: '17:30', status: 'feasible' },
        30: { time: '17:30', status: 'feasible' },
        35: { time: '17:30', status: 'feasible' },
      },
      frontier: [{ cost: 0, time: '17:30', optimal: true }],
    },
    {
      stateId: 'mandai|METRO_PURPLE',
      stationName: 'Mandai Metro',
      lineLabel: 'Purple Line',
      mode: 'METRO',
      costs: {
        0: { time: '∞', status: 'unreached' },
        10: { time: '17:41', status: 'pruned' },
        15: { time: '17:38', status: 'optimal' },
        20: { time: '17:38', status: 'feasible' },
        30: { time: '17:38', status: 'feasible' },
        35: { time: '17:38', status: 'feasible' },
      },
      frontier: [
        { cost: 10, time: '17:41' },
        { cost: 15, time: '17:38', optimal: true },
      ],
    },
    {
      stateId: 'civil_court|METRO_PURPLE',
      stationName: 'Civil Court',
      lineLabel: 'Purple Line',
      mode: 'METRO',
      costs: {
        0: { time: '∞', status: 'unreached' },
        10: { time: '∞', status: 'unreached' },
        15: { time: '17:48', status: 'optimal' },
        20: { time: '17:48', status: 'feasible' },
        30: { time: '17:48', status: 'feasible' },
        35: { time: '17:48', status: 'feasible' },
      },
      frontier: [{ cost: 15, time: '17:48', optimal: true }],
    },
    {
      stateId: 'pune_station|BUS_2',
      stationName: 'Pune Railway Station',
      lineLabel: 'Bus 2 Corridor',
      mode: 'BUS',
      costs: {
        0: { time: '∞', status: 'unreached' },
        10: { time: '18:15', status: 'pruned' },
        15: { time: '∞', status: 'unreached' },
        20: { time: '18:08', status: 'feasible' },
        25: { time: '18:02', status: 'optimal' },
        30: { time: '18:02', status: 'feasible' },
        35: { time: '18:02', status: 'feasible' },
      },
      frontier: [
        { cost: 10, time: '18:15' },
        { cost: 20, time: '18:08' },
        { cost: 25, time: '18:02', optimal: true },
      ],
    },
    {
      stateId: 'collector_office|AUTO',
      stationName: 'Collector Office (Dest)',
      lineLabel: 'Auto Feeder',
      mode: 'AUTO',
      costs: {
        0: { time: '∞', status: 'unreached' },
        10: { time: '∞', status: 'unreached' },
        20: { time: '18:25', status: 'feasible' },
        35: { time: '18:08', status: 'pruned' },
        45: { time: '18:08', status: 'optimal' },
        50: { time: '18:08', status: 'feasible' },
        60: { time: '18:08', status: 'feasible' },
        70: { time: '18:08', status: 'feasible' },
      },
      frontier: [
        { cost: 20, time: '18:25' },
        { cost: 45, time: '18:08', optimal: true },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5 text-ink">
      {/* 1. Header & Threshold Context */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-base font-bold text-ink">
            {isDense
              ? 'Dense Cost-Indexed DP Table (dp[s][c])'
              : 'Sparse Pareto Frontier per State'}
          </h3>
          <span
            className={`font-mono text-xs px-2.5 py-0.5 rounded-full font-bold ${
              isDense
                ? 'bg-success/15 text-success border border-success/30'
                : 'bg-warning/15 text-warning border border-warning/30'
            }`}
          >
            {isDense
              ? `V × (B+1) = ${denseCellsCount.toLocaleString()} ≤ 20k (Dense)`
              : `V × (B+1) = ${denseCellsCount.toLocaleString()} > 20k (Sparse)`}
          </span>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          {isDense
            ? 'For small networks, Algorithm D stores exact earliest arrival timestamps in float matrix dp[state][cost]. Green cells mark the optimal Smart path; struck-through cells were pruned.'
            : 'For graphs exceeding 20,000 cells, Algorithm C uses sparse Pareto frontier lists to maintain optimal memory bounds without dense allocation.'}
        </p>
      </div>

      {/* 2. Dense Mode (PRD §15.4: V * (B+1) <= 20,000) */}
      {isDense ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-success/20 border border-success/50" />
              <span>Smart Path (Optimal)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="line-through text-ink-muted/50 font-mono">
                18:08
              </span>
              <span>Pruned by Bound</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-ink-muted/40 font-mono">∞</span>
              <span>Unreached</span>
            </span>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Dense dynamic programming table"
            className="overflow-x-auto rounded-card border border-border bg-surface-solid shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-canvas border-b border-border text-[11px] font-mono text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2 sticky left-0 bg-canvas z-10 border-r border-border min-w-[160px]">
                    State (v, l)
                  </th>
                  {costCols.map((c) => (
                    <th key={c} className="px-3 py-2 text-center min-w-[70px]">
                      c = ₹{c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
                {sampleRows.map((row) => (
                  <tr
                    key={row.stateId}
                    className="hover:bg-canvas/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 sticky left-0 bg-surface-solid border-r border-border z-10">
                      <div className="flex flex-col">
                        <span className="font-sans font-medium text-ink">
                          {row.stationName}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {row.lineLabel}
                        </span>
                      </div>
                    </td>
                    {costCols.map((c) => {
                      const entry = row.costs[c];
                      if (!entry || entry.status === 'unreached') {
                        return (
                          <td
                            key={c}
                            className="px-3 py-2.5 text-center text-ink-muted/30 select-none"
                          >
                            ∞
                          </td>
                        );
                      }

                      if (entry.status === 'optimal') {
                        return (
                          <td
                            key={c}
                            className="px-3 py-2.5 text-center bg-success/20 text-success font-bold border border-success/40 rounded-sm"
                          >
                            {entry.time}
                          </td>
                        );
                      }

                      if (entry.status === 'pruned') {
                        return (
                          <td
                            key={c}
                            className="px-3 py-2.5 text-center line-through text-ink-muted/50 select-none"
                            title="Pruned by dominance or budget"
                          >
                            {entry.time}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={c}
                          className="px-3 py-2.5 text-center text-ink"
                        >
                          {entry.time}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 3. Sparse Pareto Frontier Fallback (PRD §15.4: V * (B+1) > 20,000) */
        <div className="flex flex-col gap-3">
          <div className="p-3.5 rounded-card bg-warning/10 border border-warning/30 text-xs text-warning flex items-start gap-2.5">
            <span className="font-bold text-sm">ℹ</span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                Sparse Pareto Representation Active
              </span>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Graph state space ({denseCellsCount.toLocaleString()} cells)
                exceeds the 20,000 dense threshold. Showing non-dominated labels
                (cost c, arrival t) maintained by Algorithm C.
              </p>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Sparse Pareto frontier table"
            className="overflow-x-auto rounded-card border border-border bg-surface-solid shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <table className="w-full text-xs text-left">
              <thead className="bg-canvas border-b border-border text-[11px] font-mono text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2">State (v, l)</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Frontier Size</th>
                  <th className="px-3 py-2">Pareto Labels [(Fare, Arrival)]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
                {sampleRows.map((row) => (
                  <tr key={row.stateId} className="hover:bg-canvas/30">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-sans font-medium text-ink">
                          {row.stationName}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {row.stateId}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-sans text-xs">
                      {row.mode}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-primary">
                      {row.frontier.length}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {row.frontier.map((lbl, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                              lbl.optimal
                                ? 'bg-success/20 text-success border-success/40 font-bold'
                                : 'bg-canvas text-ink border-border'
                            }`}
                          >
                            (₹{lbl.cost}, {lbl.time})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
