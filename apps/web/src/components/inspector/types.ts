import type { ProfilerMetrics } from '@pocketroute/shared';

export type InspectorTabKey =
  | 'overview'
  | 'dp-table'
  | 'pruning'
  | 'relaxations'
  | 'chart'
  | 'timing';

export interface InspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  metrics?: ProfilerMetrics | Record<string, unknown> | null;
  budgetINR?: number;
}

export const DEFAULT_SAMPLE_METRICS: ProfilerMetrics = {
  pq: { pushes: 412, pops: 289 },
  relaxations: 846,
  labels: { created: 312, dominanceRemoved: 58, maxFrontierSize: 6 },
  pruned: { budget: 148, timeBound: 94, dominance: 112 },
  dp: { statesExplored: 342, statesTotal: 10792 },
  timing: { elapsedMs: 14.8, runs: 5, medianMs: 14.2 },
  graph: { V: 142, E: 384, L: 12, B: 75 },
  theory: {
    routeA: { bound: 'O(E*L*log(V*L))', ops: 49766 },
    routeB: { bound: 'O(E*L*log(V*L))', ops: 49766 },
    rcspp: { bound: 'O(E*L*B*log(V*L*B))', ops: 6228300 },
    dense: { bound: 'Theta(V*L*(B+1))', ops: 129504 },
  },
};
