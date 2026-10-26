/**
 * Profiler for graph search algorithms.
 * PRD Section 8.7.
 */
import type { ProfilerMetrics } from '@pocketroute/shared';

export class Profiler {
  public pushes = 0;
  public pops = 0;
  public relaxations = 0;

  public labelsCreated = 0;
  public dominanceRemoved = 0;
  public maxFrontierSize = 0;

  public prunedBudget = 0;
  public prunedTimeBound = 0;
  public prunedDominance = 0;

  public statesExplored = 0;
  public statesTotal = 0;

  public elapsedMs = 0;
  public runs = 1;
  public medianMs = 0;

  public V = 0;
  public E = 0;
  public L = 0;
  public B = 0;

  push(): void {
    this.pushes++;
  }

  pop(): void {
    this.pops++;
  }

  relax(): void {
    this.relaxations++;
  }

  createLabel(): void {
    this.labelsCreated++;
  }

  removeDominance(count = 1): void {
    this.dominanceRemoved += count;
  }

  updateFrontierSize(size: number): void {
    if (size > this.maxFrontierSize) {
      this.maxFrontierSize = size;
    }
  }

  pruneByBudget(): void {
    this.prunedBudget++;
  }

  pruneByTimeBound(): void {
    this.prunedTimeBound++;
  }

  pruneByDominance(): void {
    this.prunedDominance++;
  }

  setGraph(V: number, E: number, L: number, B: number): void {
    this.V = V;
    this.E = E;
    this.L = L;
    this.B = B;
    this.statesTotal = V * L;
  }

  exploreState(): void {
    this.statesExplored++;
  }

  setStatesTotal(total: number): void {
    this.statesTotal = total;
  }

  setTiming(elapsedMs: number, runs = 1, medianMs?: number): void {
    this.elapsedMs = elapsedMs;
    this.runs = Math.max(1, runs);
    this.medianMs = medianMs ?? elapsedMs;
  }

  reset(): void {
    this.pushes = 0;
    this.pops = 0;
    this.relaxations = 0;
    this.labelsCreated = 0;
    this.dominanceRemoved = 0;
    this.maxFrontierSize = 0;
    this.prunedBudget = 0;
    this.prunedTimeBound = 0;
    this.prunedDominance = 0;
    this.statesExplored = 0;
    this.statesTotal = 0;
    this.elapsedMs = 0;
    this.runs = 1;
    this.medianMs = 0;
    this.V = 0;
    this.E = 0;
    this.L = 0;
    this.B = 0;
  }

  snapshot(): ProfilerMetrics {
    const V = this.V;
    const E = this.E;
    const L = Math.max(1, this.L);
    const B = Math.max(1, this.B);
    const T = 3;

    const VL = Math.max(2, V * L);
    const VLTB = Math.max(2, V * L * T * B);

    const opsA = Math.round(E * L * Math.log2(VL));
    const opsB = Math.round(E * L * Math.log2(VL));
    const opsRcspp = Math.round(E * L * T * Math.log2(VLTB));
    const opsDense = Math.round(V * L * T * (B + 1));

    return {
      pq: {
        pushes: this.pushes,
        pops: this.pops,
      },
      relaxations: this.relaxations,
      labels: {
        created: this.labelsCreated,
        dominanceRemoved: this.dominanceRemoved,
        maxFrontierSize: this.maxFrontierSize,
      },
      pruned: {
        budget: this.prunedBudget,
        timeBound: this.prunedTimeBound,
        dominance: this.prunedDominance,
      },
      dp: {
        statesExplored: this.statesExplored,
        statesTotal: this.statesTotal || V * L,
      },
      timing: {
        elapsedMs: this.elapsedMs,
        runs: this.runs,
        medianMs: this.medianMs,
      },
      graph: {
        V,
        E,
        L,
        B,
        T,
      },
      theory: {
        routeA: {
          bound: 'O(E*L*log(V*L))',
          ops: opsA,
        },
        routeB: {
          bound: 'O(E*L*log(V*L))',
          ops: opsB,
        },
        rcspp: {
          bound: 'O(E*L*T*log(V*L*T*B))',
          ops: opsRcspp,
        },
        dense: {
          bound: 'Theta(V*L*T*(B+1))',
          ops: opsDense,
        },
      },
    };
  }
}
