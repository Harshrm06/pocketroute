import React from 'react';
import type { ProfilerMetrics } from '@pocketroute/shared';

export interface OverviewTabProps {
  metrics: ProfilerMetrics;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ metrics }) => {
  const { V, E, L, B } = metrics.graph;
  const stateSpace = V * L;
  const stateEdges = E * L;

  return (
    <div className="flex flex-col gap-6 text-ink">
      {/* 1. Header & DAA Abstract */}
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-base font-bold text-ink">
          Multi-Modal RCSPP Algorithm Formulation
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          The routing engine solves the multi-modal budget-constrained shortest
          path problem (RCSPP) over a state graph{' '}
          <span className="font-mono text-ink font-semibold">S = V × L</span>,
          using macro-rides (Rule C) to eliminate intra-line boarding penalties
          and preserve exact slab pricing. Pruning is guided by backward
          Dijkstra lower bounds for remaining travel time (
          <span className="font-mono text-ink font-semibold">LB_t</span>) and
          remaining fare (
          <span className="font-mono text-ink font-semibold">LB_c</span>).
        </p>
      </div>

      {/* 2. Graph Size & Parameters Table (PRD §15.4) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Query Graph Dimensions (Current Request)
        </span>
        <div
          tabIndex={0}
          role="region"
          aria-label="Query graph dimensions table"
          className="overflow-x-auto rounded-card border border-border bg-surface-solid shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <table className="w-full text-xs text-left">
            <thead className="bg-canvas border-b border-border text-[11px] font-mono text-ink-muted uppercase">
              <tr>
                <th className="px-3 py-2">Parameter</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
              <tr>
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  Transit Nodes
                </td>
                <td className="px-3 py-2 font-bold text-primary">V</td>
                <td className="px-3 py-2 text-right font-bold text-ink">{V}</td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Stops, stations, and query endpoints
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  Transit Edges
                </td>
                <td className="px-3 py-2 font-bold text-primary">E</td>
                <td className="px-3 py-2 text-right font-bold text-ink">{E}</td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Macro-rides, transfers, feeder & walk legs
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  Lines & Modes
                </td>
                <td className="px-3 py-2 font-bold text-primary">L</td>
                <td className="px-3 py-2 text-right font-bold text-ink">{L}</td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Metro lines, bus corridors, feeder modes
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  Budget Constraint
                </td>
                <td className="px-3 py-2 font-bold text-primary">B</td>
                <td className="px-3 py-2 text-right font-bold text-ink">
                  ₹{B}
                </td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Maximum allowable total trip fare
                </td>
              </tr>
              <tr className="bg-canvas/40">
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  State Space Size
                </td>
                <td className="px-3 py-2 font-bold text-primary">S = V × L</td>
                <td className="px-3 py-2 text-right font-bold text-ink">
                  {stateSpace.toLocaleString()}
                </td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Expanded (node, line) state vertices
                </td>
              </tr>
              <tr className="bg-canvas/40">
                <td className="px-3 py-2 font-sans font-medium text-ink">
                  Expanded Edges
                </td>
                <td className="px-3 py-2 font-bold text-primary">
                  E_S = E × L
                </td>
                <td className="px-3 py-2 text-right font-bold text-ink">
                  {stateEdges.toLocaleString()}
                </td>
                <td className="px-3 py-2 font-sans text-ink-muted">
                  Search space transitions across line states
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. The Four Core Algorithms */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Algorithm Portfolio & Complexity Classes
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                Algorithm A: Dijkstra TIME
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                Route A
              </span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Unconstrained arrival time minimization using arrival timestamp as
              heap priority. Skips same-line consecutive edges (Rule C).
            </p>
            <span className="font-mono text-[11px] text-ink font-medium mt-auto">
              Bound: {metrics.theory.routeA.bound}
            </span>
          </div>

          <div className="p-3 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                Algorithm B: Dijkstra COST
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                Route B
              </span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Unconstrained cost minimization using lexicographic (fare, time)
              priority. Yields the absolute theoretical floor fare LB_c.
            </p>
            <span className="font-mono text-[11px] text-ink font-medium mt-auto">
              Bound: {metrics.theory.routeB.bound}
            </span>
          </div>

          <div className="p-3 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                Algorithm C: RCSPP Solver
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-bold">
                Smart Route
              </span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Label-setting Pareto frontier solver with branch-and-bound pruning
              (P1 budget, P2 time bound vs incumbent, P3 Pareto dominance).
            </p>
            <span className="font-mono text-[11px] text-ink font-medium mt-auto">
              Bound: {metrics.theory.rcspp.bound}
            </span>
          </div>

          <div className="p-3 rounded-card bg-surface-solid border border-border shadow-e1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                Algorithm D: Dense DP
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-bold">
                Unit III Ref
              </span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Exact cost-indexed dynamic programming table dp[(v, l)][c] over
              integers c ∈ [0, B]. Used for cross-check validation and table
              inspector.
            </p>
            <span className="font-mono text-[11px] text-ink font-medium mt-auto">
              Bound: {metrics.theory.dense.bound}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Pseudocode Monospace Block (PRD §8.2 & §8.3) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          Formal Pseudocode (PRD §8.2, §8.3)
        </span>
        <div
          tabIndex={0}
          role="region"
          aria-label="Formal algorithm pseudocode"
          className="p-4 rounded-card bg-canvas border border-border overflow-x-auto shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <pre className="font-mono text-[11px] text-ink leading-relaxed">
            {`// Algorithm C: Budget-Constrained RCSPP Label-Setting (PRD §8.3)
RCSPP(G, Origin, Dest, Budget, t0):
  LB_t = BACKWARD_DIJKSTRA(G, Dest, weight=min_time)
  LB_c = BACKWARD_DIJKSTRA(G, Dest, weight=min_fare)
  if LB_c[Origin] > Budget:
    return INFEASIBLE_WITH_MIN_COST(LB_c[Origin])

  incumbent = +∞; best = null
  labels[(Origin, NONE)] = {(t0, 0, root)}
  heap.push((t0, 0, Origin, NONE, root))

  while heap not empty:
    (t, c, v, l, λ) = heap.pop()
    if λ is removed_by_dominance: continue
    if v == Dest:
      if t < incumbent: incumbent = t; best = λ
      continue

    for edge in G.out((v, l)):
      if edge.line == l: continue                       // Rule C (Macro-ride)
      t' = t_arrive(edge, t); c' = c + edge.fare

      if c' + LB_c[edge.to] > Budget:        continue   // Rule P1: Budget Prune
      if t' + LB_t[edge.to] >= incumbent:    continue   // Rule P2: Time Bound Prune
      if DOMINATED(labels[(edge.to, edge.line)], t', c'): continue // Rule P3: Dominance

      REMOVE_DOMINATED_BY(labels[(edge.to, edge.line)], t', c')
      λ' = (t', c', (edge.to, edge.line), parent=λ)
      labels[(edge.to, edge.line)].add(λ')
      heap.push(λ')

  if best == null: return INFEASIBLE
  return RECONSTRUCT_PATH(best)`}
          </pre>
        </div>
      </div>
    </div>
  );
};
