/**
 * Benchmark script comparing all four routing algorithms on the default network.
 * PRD Section 15.4, 17.5.
 *
 * Runs 5 diverse queries 5 times each:
 * 1. Algorithm A: Dijkstra (time)
 * 2. Algorithm B: Dijkstra (cost)
 * 3. Algorithm C: RCSPP (budget-constrained)
 * 4. Algorithm D: Dense DP (cost-indexed dynamic programming)
 */
import { performance } from 'node:perf_hooks';
import {
  buildQueryGraph,
  buildStaticGraph,
  denseDP,
  dijkstra,
  getDefaultNetwork,
  Profiler,
  rcspp,
  type RouteResult,
} from '@pocketroute/engine';

interface BenchmarkQuery {
  id: string;
  name: string;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  budgetINR: number;
  departureMinutes: number; // e.g. 17:30 = 1050
}

const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  {
    id: 'Q1',
    name: 'Swargate to Shivajinagar (Canonical PRD Example)',
    origin: { lat: 18.5015, lng: 73.8542, label: 'Swargate' },
    destination: { lat: 18.5303, lng: 73.8488, label: 'Shivajinagar' },
    budgetINR: 75,
    departureMinutes: 1050, // 17:30
  },
  {
    id: 'Q2',
    name: 'PCMC Bhavan to Pune Station (North-South Corridor)',
    origin: { lat: 18.6298, lng: 73.8031, label: 'PCMC Bhavan' },
    destination: { lat: 18.5284, lng: 73.8742, label: 'Pune Station' },
    budgetINR: 40,
    departureMinutes: 540, // 09:00
  },
  {
    id: 'Q3',
    name: 'Vanaz to Ramwadi (East-West Aqua Line)',
    origin: { lat: 18.5071, lng: 73.8053, label: 'Vanaz' },
    destination: { lat: 18.5524, lng: 73.9142, label: 'Ramwadi' },
    budgetINR: 35,
    departureMinutes: 660, // 11:00
  },
  {
    id: 'Q4',
    name: 'Katraj to Pune Station (Bus Corridor)',
    origin: { lat: 18.4529, lng: 73.8553, label: 'Katraj' },
    destination: { lat: 18.5284, lng: 73.8742, label: 'Pune Station' },
    budgetINR: 30,
    departureMinutes: 600, // 10:00
  },
  {
    id: 'Q5',
    name: 'Hadapsar to Shivajinagar (Cross-town Corridor)',
    origin: { lat: 18.5028, lng: 73.9284, label: 'Hadapsar Gadital' },
    destination: { lat: 18.5303, lng: 73.8488, label: 'Shivajinagar' },
    budgetINR: 50,
    departureMinutes: 1020, // 17:00
  },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function runBenchmark(): Promise<void> {
  console.log(
    '================================================================================',
  );
  console.log('PocketRoute Algorithm Benchmark (PRD §15.4, §17.5)');
  console.log('Loading default Pune network...');
  console.log(
    '================================================================================\n',
  );

  const network = getDefaultNetwork();
  const staticResult = buildStaticGraph(network);

  console.log(
    `Default network loaded: ${staticResult.graph.nodes.size} nodes, ${staticResult.graph.edgeCount} macro edges.\n`,
  );

  interface BenchResultRow {
    queryId: string;
    algorithm: string;
    feasible: boolean;
    durationMin: number;
    fareINR: number;
    ops: number;
    medianMs: number;
  }

  const results: BenchResultRow[] = [];
  const RUN_COUNT = 5;

  for (const q of BENCHMARK_QUERIES) {
    console.log(
      `Running Query [${q.id}]: ${q.name} (Budget: ₹${q.budgetINR}, Dep: ${Math.floor(q.departureMinutes / 60)}:${(q.departureMinutes % 60).toString().padStart(2, '0')})`,
    );

    const qGraph = buildQueryGraph(staticResult, q.origin, q.destination, {
      maxWalkM: 1200,
      includeAuto: true,
      includeCab: true,
    });

    const algos: {
      name: string;
      run: (profiler: Profiler) => ReturnType<typeof dijkstra>;
    }[] = [
      {
        name: 'Route A (Dijkstra Time)',
        run: (p) => dijkstra(qGraph, 'O', 'D', 'TIME', p, q.departureMinutes),
      },
      {
        name: 'Route B (Dijkstra Cost)',
        run: (p) => dijkstra(qGraph, 'O', 'D', 'COST', p, q.departureMinutes),
      },
      {
        name: 'Algorithm C (RCSPP)',
        run: (p) => rcspp(qGraph, 'O', 'D', q.budgetINR, p, q.departureMinutes),
      },
      {
        name: 'Algorithm D (Dense DP)',
        run: (p) =>
          denseDP(qGraph, 'O', 'D', q.budgetINR, p, q.departureMinutes),
      },
    ];

    for (const algo of algos) {
      const times: number[] = [];
      let lastResult: ReturnType<typeof dijkstra> | null = null;
      let lastProfiler = new Profiler();

      for (let run = 0; run < RUN_COUNT; run++) {
        const profiler = new Profiler();
        const start = performance.now();
        lastResult = algo.run(profiler);
        const elapsed = performance.now() - start;
        times.push(elapsed);
        lastProfiler = profiler;
      }

      const medMs = median(times);
      const ops =
        lastProfiler.pushes + lastProfiler.pops + lastProfiler.relaxations;

      const feasible = lastResult?.feasible ?? false;
      const res = feasible ? (lastResult as RouteResult) : null;

      results.push({
        queryId: q.id,
        algorithm: algo.name,
        feasible,
        durationMin: res ? Math.round(res.durationMin) : -1,
        fareINR: res ? res.totalFareINR : -1,
        ops,
        medianMs: Number(medMs.toFixed(2)),
      });
    }
    console.log(`  ✓ Completed all 4 algorithms for ${q.id}.\n`);
  }

  // Print results table
  console.log(
    '================================================================================',
  );
  console.log('BENCHMARK RESULTS TABLE');
  console.log(
    '================================================================================',
  );
  console.log(
    '| Query | Algorithm               | Feasible | Time (min) | Fare (₹) | Operations | Median (ms) |',
  );
  console.log(
    '| :---: | :---------------------- | :------: | :--------: | :------: | :--------: | :---------: |',
  );

  for (const r of results) {
    const qStr = r.queryId.padEnd(5);
    const algStr = r.algorithm.padEnd(23);
    const feasStr = (r.feasible ? 'Yes' : 'No').padEnd(8);
    const timeStr = (
      r.durationMin >= 0 ? `${r.durationMin} min` : 'N/A'
    ).padEnd(10);
    const fareStr = (r.fareINR >= 0 ? `₹${r.fareINR}` : 'N/A').padEnd(8);
    const opsStr = r.ops.toLocaleString().padStart(10);
    const msStr = `${r.medianMs.toFixed(2)} ms`.padStart(11);

    console.log(
      `| ${qStr} | ${algStr} | ${feasStr} | ${timeStr} | ${fareStr} | ${opsStr} | ${msStr} |`,
    );
  }

  console.log(
    '================================================================================\n',
  );
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
