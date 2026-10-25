Prompt 1: Monorepo scaffold and tooling
text
You are building PathFinder / PocketRoute. The file PRD.md in the project root is the single source of truth. Read sections 0, 11, 12 and 13 before writing any code. Do not deviate from the repository structure in Section 12.

Task: Create the monorepo scaffold.

1. Initialize a pnpm workspace with pnpm-workspace.yaml covering packages/*, apps/*.
2. Create tsconfig.base.json with "strict": true, "noUncheckedIndexedAccess": true, "target": "ES2022", "moduleResolution": "Bundler", "isolatedModules": true.
3. Create empty package shells:
   - packages/shared (name @pocketroute/shared)
   - packages/engine (name @pocketroute/engine, depends on shared)
   - apps/api (name @pocketroute/api, depends on engine and shared)
   - apps/web (name @pocketroute/web, depends on shared)
4. Set up ESLint with typescript-eslint and Prettier. Add root scripts: "lint", "typecheck", "test", "build", "format".
5. Add Vitest at the root with a passing placeholder test in packages/engine.
6. Create .gitignore, .editorconfig, .nvmrc (Node 20), and a README.md stub with setup instructions.
7. Create directories data/pune, data/geometry/metro, data/geometry/bus, scripts, e2e with .gitkeep.
8. Create .github/workflows/ci.yml that runs install, lint, typecheck, test, build on push and pull request.

Verification (must all pass before you continue):
- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build

Report back the file tree and the output of the five commands. Do not implement any transit logic yet.
Prompt 2: Shared types, schemas, and constants
text
Read PRD.md Sections 6, 8.1, 9 and 14.2 before starting.

Task: Implement packages/shared.

1. Define Zod schemas and exported TypeScript types for:
   - Mode enum: WALK, METRO, BUS, AUTO, CAB.
   - LineId: string union including METRO_PURPLE, METRO_AQUA, WALK, AUTO, CAB, and BUS_<routeNo> (template literal type).
   - LatLng with range checks for the Pune bounding box (lat 18.40 to 18.70, lng 73.70 to 74.00).
   - PlanRequest exactly matching Section 9.1, including budgetINR as an integer from 10 to 300, departureTime as "HH:mm" or "now", options with defaults.
   - Leg, Route, PlanResponse, ProblemDetail matching Section 9.1.
   - ProfilerMetrics matching Section 8.7.
2. Export a constants module with:
   - MIN_BUDGET = 10, MAX_BUDGET = 300, WALK_SPEED_M_PER_MIN = 80, MAX_WALK_LEG_M = 1200, MIN_TRANSFER_MIN = 1, METRO_BOARDING_PENALTY_MIN = 3, AUTO_PICKUP_MIN = 2.5, CAB_PICKUP_MIN = 4.5, PEAK_WINDOWS, NIGHT_WINDOW, and all speeds from Section 6.1.
3. Add unit tests with Vitest that confirm schema rejects budget 9, 301, and 74.5, and accepts 75 and "now".

Verification:
- pnpm typecheck
- pnpm test --filter @pocketroute/shared
- pnpm lint

Do not implement fare or routing logic. Report back the exported names.
Prompt 3: Pricing engine
text
Read PRD.md Sections 6.2 to 6.5 and 17.1 before starting.

Task: Implement the pricing module in packages/engine/src/pricing.

1. metroFareINR(distanceKm: number): number implementing the metro slab table with half-open intervals (lo, hi]. Distance 0 returns 10.
2. busFareINR(distanceKm: number): number implementing the PMPML slab table.
3. autoFareINR(distanceKm: number, localHourIST: number): number implementing Section 6.4 exactly. Round half up after computing the base. Apply the night surcharge (hour in [0,5)) as a multiplier, then round again.
4. cabFareINR(distanceKm: number, durationMin: number, isRushHour: boolean): number implementing Section 6.5 exactly.
5. walkFareINR(): 0.
6. Put all fare numbers in data/pune/fares.json with effectiveFrom "2026-10-01" and load them through a typed loader. The functions above must read from the loaded table, not from hard-coded literals. Add a schema check for the JSON.
7. roundHalfUp must be exported and tested separately, including 2.5 to 3, and 2.4999 to 2.

Tests: write boundary tests from PRD Section 17.1 (2.0, 2.01, 4.0, 18.0, 18.01 for metro; the same for bus; auto at 0, 1.5, 1.6, 10 km; night and non-night).

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint. Report the number of tests passing.
Prompt 4: Timing and headway engine
text
Read PRD.md Sections 6.6 to 6.8, 7.6 and 17.1 before starting.

Task: Implement packages/engine/src/timing.

1. Represent times as minutes since midnight IST (number, may exceed 1440 for next-day wraparound within the search horizon). Provide helpers: parseHHmm, formatHHmm (12-hour format with AM/PM, e.g., "5:30 PM"), isPeak(t), isNight(t), rushWindow(t) returning peak/mid/off-peak/night.
2. Implement nextDeparture(t: number, firstDeparture: number, headway: number, lastDeparture?: number): number | null. Returns the first grid departure at or after t, or null if past lastDeparture.
3. Metro: headway = 6 in peak, 10 otherwise. Operating window 06:00 to 22:00. Implement metroNextTrain(t, lineId).
4. Bus: implement busHeadwayAt(t, route) using the route's peakHeadway and offPeakHeadway from data, and busSpeedAt(t) per Section 6.7.
5. Walk time: walkMinutes(distanceM) = distanceM / 80.
6. Auto and cab pickup waits as constants from shared.
7. Ensure nextDeparture is FIFO-monotone: write a property test (fast-check) that for random t1 <= t2, nextDeparture(t1) <= nextDeparture(t2).

Tests: 05:59 returns null for metro, 06:00 returns first departure, exact grid hit returns same time, peak boundary at 11:00, FIFO property.

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint.
Prompt 5: Pune network data pack and validation
text
Read PRD.md Sections 5, 6.8, 10.1, 10.2 and 18 before starting.

Task: Create the data pack and its validator.

1. Create data/pune/metro.json with two lines (METRO_PURPLE: PCMC to Swargate; METRO_AQUA: Vanaz to Ramwadi). Each station has id, name, lat, lng, and an optional interchangeWith array. Use the official station list where you can access it. For any station you cannot verify, set "verified": false and note it in a "notes" field. Do not invent coordinates. If you cannot verify coordinates, stop and report which ones are missing.
2. Create data/pune/bus_routes.json with 8 to 12 corridors. Each route has routeNo, label, firstDeparture (minutes from midnight), peakHeadway, offPeakHeadway, verified flag, and an ordered stops array with id, name, lat, lng, and segmentDistanceKm to the next stop. Include Bus 2, Bus 24, Bus 103, Bus 149, Bus 204, and the Rainbow BRT corridor as examples, and mark each with verified: false until checked against PMPML sources.
3. Create data/pune/places.json with at least 100 landmarks in Pune (name, aliases, lat, lng, category) and verify each coordinate is inside the Pune bounding box.
4. Create data/pune/params.json for speeds, windows, penalties, and the MIN_TRANSFER_MIN assumption (Section 6.1 note).
5. Write scripts/validate-data.ts that checks: schema validity, coordinates inside bounding box, metro station counts are positive, bus stops are ordered, segment distances are positive, and every interchange references an existing station. Exit non-zero on error and print a warnings list for verified: false entries.
6. Add "validate-data" to the root package.json.

Verification: pnpm validate-data exits 0. Report the warnings list. Report which data points you could not verify.
Prompt 6: Geometry pipeline
text
Read PRD.md Sections 5, 10.1 to 10.3 and 13 before starting.

Task: Build the offline geometry pipeline and the runtime geometry service.

1. scripts/build-geometry.ts:
   - Bus: for each corridor, call OSRM /route/v1/car/ with consecutive stops (use OSRM_BASE_URL env). Save to data/geometry/bus/<routeNo>.geojson. Record total length in meters.
   - Metro: read data/geometry/metro source GeoJSON (placeholder files if OSM is unavailable). Stitch ways in order and simplify with Douglas-Peucker at 2 m tolerance. If stitching fails, write a Catmull-Rom spline through station coordinates and set "geometryQuality": "schematic" in properties.
   - Fail with a clear message if OSRM_BASE_URL is unset and --offline is not passed. With --offline, use the Bezier fallback from Section 10.3 for buses and mark them estimated.
2. packages/engine/src/geometry: implement
   - sliceLine(line: GeoJSON LineString, from: LatLng, to: LatLng): LineString using nearest-point projection.
   - bezierEstimate(from, to): LineString with a 15% perpendicular control-point offset.
   - haversineKm and roadEstimateKm(from, to) = haversine * 1.25.
3. Unit tests: sliceLine returns a sub-line whose endpoints are the projections of from and to; bezierEstimate is not a straight line (its midpoint is offset from the chord).

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, and run pnpm build-geometry --offline. Report the list of geometry files produced and their quality flags.
Prompt 7: Graph builder
text
Read PRD.md Sections 7.1 to 7.7 and 8.2 before starting.

Task: Implement packages/engine/src/graph.

1. Types: StateId = string (encode as `${nodeId}|${lineId}`), Edge { from: StateId, to: StateId, line: LineId, mode: Mode, fareINR: number, minTimeMin: number, timeAt(t: number): number, meta: { distanceKm, stops, geometryRef, geometryQuality } }.
2. buildStaticGraph(network): builds macro-ride edges for each metro line and each bus corridor (every pair i < k). Fare comes from pricing.ts, based on road distance of the pair. timeAt(t) = nextDeparture(t + METRO_BOARDING_PENALTY_MIN) + rideTime, per Section 7.3, and returns Infinity if no departure exists.
3. buildQueryGraph(static, origin, destination, options): adds origin and destination nodes, walk access edges to stops within MAX_WALK_LEG_M, auto and cab feeder edges (k=8, within 4 km), transfer walk edges between nearby stops, and direct O to D edges. Enforce the candidate-pruning rule in Section 7.7.
4. Wrap the sequence so that every edge has a non-negative fare. Assert it.
5. Add a function reverseGraph(graph) used by backward Dijkstra later.
6. Tests:
   - A 4-stop metro ride produces a single macro edge with the slab fare of the full distance.
   - No walk leg exceeds MAX_WALK_LEG_M unless fallback mode is set.
   - timeAt is FIFO-monotone on sampled t values.
   - Transfer edges include MIN_TRANSFER_MIN.

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint. Report edge counts for the default network. Do not implement search yet.
Prompt 8: Algorithms A and B (multi-criteria Dijkstra)
text
Read PRD.md Sections 8.1, 8.2, 8.5 (Lemmas 1 to 3) and 8.6 before starting.

Task: Implement packages/engine/src/algorithms/dijkstra.ts.

1. Binary min-heap in packages/engine/src/structures/heap.ts with a generic comparator. Include tests.
2. dijkstra(graph, origin, dest, key: "TIME" | "COST", profiler): RouteResult | Infeasible.
   - Follow the pseudocode in Section 8.2 exactly.
   - Skip edges where edge.line === state.line (Rule C).
   - For key TIME, use arrival time as priority. For key COST, use (cost, time) lexicographic priority.
   - Record pushes, pops, relaxations on the profiler object passed in.
3. Export a Profiler class with counters and a snapshot() method matching the schema in Section 8.7.
4. Path reconstruction returns legs in order, each with departAt, arriveAt, fare, line, mode.

Tests:
- A tiny hand-built graph where the fastest route is more expensive, and the cheapest route is slower. Verify both routes.
- Rule C: no output path has consecutive same-line legs.
- Random small graphs: Dijkstra COST result has cost <= any path found by brute-force enumeration (small graphs only, enumerate with DFS limited to 8 nodes).

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint.
Prompt 9: Algorithm C (RCSPP) with Pareto pruning and branch and bound
text
Read PRD.md Sections 8.3, 8.5 (Lemmas 4 and 5, Theorems 1 and 2), and 8.8 before starting. Implement the pseudocode exactly.

Task: Implement packages/engine/src/algorithms/rcspp.ts.

1. backwardDijkstra(graph, dest, weight: "TIME" | "FARE"): Map<StateId, number>. Use reverseGraph from Prompt 7. Compute LB_t and LB_c.
2. A Pareto frontier structure per state with:
   - add(label) that inserts with dominance checks and returns whether the label was accepted.
   - removeDominatedBy(label).
   - dominated(t, c): boolean.
   - Invariant: frontier sorted by cost ascending has strictly decreasing time. Assert this in debug mode.
3. rcspp(graph, origin, dest, budget, profiler): RouteResult | Infeasible.
   - Implement the three pruning rules P1 (budget), P2 (time bound vs incumbent), P3 (dominance). Count each in profiler.pruned.
   - Heap orders labels by (time, cost).
   - Stale-label detection via a removed flag on labels.
   - Return Infeasible with minimumRequiredFareINR = LB_c[origin] when no feasible route is found.
4. Record maxFrontierSize per state in profiler.labels.

Tests:
- Hand-built graph where budget 0 is infeasible, budget 10 selects the cheap slow route, budget 100 selects the fast expensive route.
- Monotonicity: for budgets 10 to 300 on a fixed fixture, Smart time is non-increasing.
- Theorem 2 checks: if Route A cost <= B then Smart time equals Route A time; Smart cost <= B; Smart time >= Route A time.
- Frontier invariant holds after random insertions (fast-check).

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint. Report the test names that cover each theorem.
Prompt 10: Algorithm D (dense DP) and cross-validation
text
Read PRD.md Sections 8.4, 8.5 and 8.6, and 17.2 before starting.

Task: Implement packages/engine/src/algorithms/dense-dp.ts and the cross-check suite.

1. denseDP(graph, origin, dest, budget, profiler): RouteResult | Infeasible following Section 8.4. Use a typed array (Float64Array) of size states * (budget + 1) for dp. Track statesExplored and statesTotal in profiler.dp.
2. Path reconstruction via a parent array keyed by (state, cost).
3. Property test (fast-check, seeded): generate 500 random small graphs (up to 12 states, random integer fares 0 to 25, random headways, random budgets 10 to 100). Assert that rcspp and denseDP return the same arrival time, or both infeasible.
4. Benchmark script scripts/bench.ts: runs all four algorithms on the default network for 5 queries, prints a table of ops and median ms.

Verification: pnpm test --filter @pocketroute/engine, pnpm bench. Report the cross-check pass count and the benchmark table.
Prompt 11: Profiler, theoretical bounds, and the query orchestrator
text
Read PRD.md Sections 8.6, 8.7 and 9.1 before starting.

Task: Implement the orchestrator and profiler reporting.

1. packages/engine/src/plan.ts exports planRoutes(network, request, now): PlanResult that:
   - builds the query graph,
   - runs dijkstra TIME (Route A), dijkstra COST (Route B), rcspp (Smart), and optionally denseDP when a debug flag is set,
   - measures elapsedMs with performance.now() around each solver, runs 5 times for queries whose first run is under 50 ms, and reports the median,
   - computes comparison fields (fareSavedVsFastestINR, extraMinVsFastest) and the infeasible block when relevant.
2. theoreticalBounds(graphStats, budget): returns the bound strings and numeric ops estimates from Section 8.6 for each algorithm.
3. Serialize the full metrics object matching Section 8.7.
4. Unit test planRoutes on a fixture network with known answers from Section 17.2.

Verification: pnpm test --filter @pocketroute/engine, pnpm typecheck, pnpm lint. Report one sample PlanResult as JSON for the default example (Swargate to Shivajinagar, 17:30, budget 75), with metrics included.
Prompt 12: API server
text
Read PRD.md Sections 9, 12.1 and 16 before starting.

Task: Build apps/api with Fastify.

1. Load the Pune data pack once at startup, validate it with the same schemas from packages/shared, and fail fast with a readable error if invalid.
2. Routes:
   - POST /api/v1/route/plan (Zod validation, 8 KB body limit, optional ?includeMetrics=true).
   - GET /api/v1/places/search?q=&limit= (local seed first, Nominatim fallback with 24 h in-memory cache, 2 s timeout).
   - GET /api/v1/network (ETag).
   - GET /api/v1/health.
3. Middleware: Helmet, CORS from CORS_ORIGIN, rate limit (RATE_LIMIT_PER_MIN, default 30), pino logs with requestId, problem+json error handler for validation and internal errors.
4. Department time: convert departureTime and date to a minutes-since-midnight IST value using Intl with timeZone "Asia/Kolkata". "now" uses the current IST time.
5. Dockerfile: multi-stage, Node 20 Alpine, non-root user, HEALTHCHECK on /api/v1/health.

Tests (Vitest + fastify.inject):
- Valid plan request returns 200 with three routes.
- Budget 9, 301, 74.5 each return 400 problem+json.
- Coordinates outside Pune return 400.
- Rate limit returns 429 after the limit.
- includeMetrics=true includes the metrics block.

Verification: pnpm test --filter @pocketroute/api, pnpm typecheck, pnpm lint, docker build -f apps/api/Dockerfile . Then run the server and curl the example request. Report the response status and first 30 lines of JSON.
Prompt 13: Frontend foundation and design system
text
Read PRD.md Sections 14.1 to 14.5 and 14.8 before starting.

Task: Set up apps/web with the design system.

1. Vite + React 18 + TypeScript + Tailwind CSS v3 + Zustand + Framer Motion. Add @fontsource for Plus Jakarta Sans, Inter, and JetBrains Mono (self-hosted).
2. Define CSS variables for every token in Section 14.2, with a dark mode set under prefers-color-scheme. Map them into the Tailwind theme (colors, radius, boxShadow e1/e2/e3, fontFamily).
3. Build the reusable primitives in src/components/ui: PillButton (primary and secondary), ModeChip, Surface (glass panel with backdrop-filter and fallback to solid when unsupported), Card, Input, Slider (budget), IconButton. Each has focus-visible styles and aria attributes.
4. Create a dev-only /styleguide route showing every primitive in every state. Use it as the visual checklist.
5. Add the API client in src/lib/api.ts reading VITE_API_BASE_URL.

Verification: pnpm --filter @pocketroute/web build, pnpm lint, pnpm typecheck. Run pnpm --filter @pocketroute/web dev and report the URL of the styleguide page. Confirm in the report that contrast was checked for ink on surface, and for primary button text.
Prompt 14: Map layer
text
Read PRD.md Sections 10.4, 14.7 and 14.6 before starting.

Task: Implement the map as an interactive vector layer.

1. Install maplibre-gl (pinned). Create src/map/MapView.tsx that:
   - full viewport (100vw x 100vh), style from VITE_MAP_STYLE_URL, attribution control visible.
   - lazy-loads the maplibre chunk via React.lazy with a skeleton fallback.
   - exposes flyToBounds(bounds), flyToPoint(point), and setRoute(routeSet) via a ref.
2. Layers in the order given in Section 10.4 (walk, auto, cab, bus, metro, markers, selected-leg highlight), with stroke widths and colors from Section 14.7. Walk uses a dashed pattern with animated dash offset at 30 fps; disable the animation under prefers-reduced-motion.
3. Custom HTML pill markers for origin, destination, and stops, styled with design tokens.
4. Estimated geometry legs are rendered dashed with a small "estimated path" label.
5. Use requestAnimationFrame for the walk animation and clean it up on unmount.

Verification: pnpm --filter @pocketroute/web build, pnpm typecheck, pnpm lint. Use the dev server with a fixture route set in src/fixtures/route.ts (one walk leg, one metro leg, one bus leg, one estimated leg). Report that all four layers render and that the console shows no errors.
Prompt 15: Dock (search, time, budget) and state
text
Read PRD.md Sections 15.1, 14.5 (budget slider and autocomplete) and 9.2 before starting.

Task: Build the floating search and budget dock.

1. Zustand store in src/store/plan.ts with origin, destination, departureTime ("now" or HH:mm), budgetINR (default 75), status (idle, loading, ready, error), result, selectedRouteKey ("smart" | "fastest" | "cheapest"). Persist only the recent-places frequency map to localStorage under "pr.recent" with try/catch.
2. Dock component (responsive: floating card at desktop, top card at mobile):
   - Start and End autocomplete (debounced 320 ms, calls /places/search, shows top 3 recent picks with a star).
   - Swap button rotating 180 degrees.
   - Departure time picker defaulting to "Now".
   - Budget slider from 10 to 300 with live mono value and three preset pills (30 Broke Student, 60 Smart Commute, 120 Fast Mix).
   - Primary "Find Optimal Route" button. Shows "Finding routes…" while loading.
3. Validation: origin and destination must differ, budget is integer in range. Inline errors.
4. On submit, POST /route/plan, and set the store result. Handle 400 and 429 with user-friendly messages from problem+json.

Tests: Vitest + React Testing Library for validation, preset selection updating the slider, and the submit path calling the API with a mocked fetch.

Verification: pnpm test --filter @pocketroute/web, pnpm lint, pnpm typecheck, pnpm build. Report test results.
Prompt 16: Results, comparison cards, and timeline
text
Read PRD.md Sections 14.5 (comparison card, timeline leg), 15.2 and 15.3 before starting.

Task: Build the results experience.

1. ComparisonCards: three cards (Smart Budget Winner, Fastest Overall, Cheapest Overall). Smart is first and visually highlighted. Each card shows badge, total fare, arrival time, duration. Smart card shows the savings chip "Saves ₹X vs Fastest" when X > 0, or "Fastest already fits your budget" when Route A cost ≤ budget.
2. Infeasible state: warning card with the minimum required budget and a one-tap "Set budget to ₹X" action that updates the store and re-submits.
3. Timeline: vertical ordered list. Each leg shows departAt in mono, mode icon, line label (for example "Purple Line" or "Bus 24"), stop count, wait badge ("Wait 4 min, scheduled"), fare badge, and instruction text. Selecting a leg flies the map to its bounds.
4. Keyboard and screen reader support per Section 14.8.
5. Mobile: results in a bottom sheet with snap points peek, half, full (Framer Motion spring). Desktop: right panel.
6. Changing the selected card cross-fades the map layers (200 ms) and updates the timeline.

Tests: RTL tests for the savings chip logic (both branches), infeasible state, and timeline rendering of a fixture route with exact times.

Verification: pnpm test --filter @pocketroute/web, pnpm lint, pnpm typecheck, pnpm build. Report test names.
Prompt 17: DAA Inspector drawer
text
Read PRD.md Sections 15.4, 8.6, 8.7 and 14.3 before starting.

Task: Build the DAA Algorithm and Complexity Inspector.

1. Drawer component: right side on desktop (560 px), full-height bottom sheet on mobile. Opened from a button in the results header. Focus-trapped, Escape closes, returns focus to the trigger.
2. Tabs:
   - Overview: algorithm names, one-paragraph description, pseudocode from Section 8.2 and 8.3 in a monospace block, V, E, L, B for the current query.
   - DP table: if V * (B + 1) ≤ 20,000, render the dense dp table with the cell highlights from Section 15.4. Otherwise render the sparse Pareto frontier per state. Pruned cells are struck through.
   - Pruning: counters for budget, time bound, dominance, and a stacked bar.
   - Relaxations: table of pushes, pops, relaxations, labels created, max frontier size, with measured vs. theoretical bound and ratio.
   - Chart: Recharts bar chart comparing Dijkstra TIME, Dijkstra COST, RCSPP, and Dense DP on operations and elapsed ms. Accessible table fallback below the chart.
   - Timing: median ms and runs. Button "Re-run 5x" calls the API with includeMetrics=true five times, updates median.
3. The DP table uses tabular numerics and horizontal scrolling inside its own container.

Tests: RTL tests for focus trap, Escape, and tab switching; a snapshot test of the Overview tab; a test that the table falls back to sparse mode when the size threshold is exceeded.

Verification: pnpm test --filter @pocketroute/web, pnpm lint, pnpm typecheck, pnpm build. Report test names and the bundle size of the web app.
Prompt 18: Responsive polish, accessibility, and performance pass
text
Read PRD.md Sections 14.6, 14.8, 16 and 17.4 before starting.

Task: Polish and harden the frontend.

1. Verify and fix responsive behavior at 390 x 844 (mobile), 768 x 1024 (tablet), and 1440 x 900 (desktop). Respect iOS safe-area insets.
2. Accessibility audit: run axe-core in Playwright on the main flow and the Inspector. Fix all serious and critical violations. Verify focus order, label associations, and reduced-motion behavior.
3. Performance: lazy-load the Inspector and MapLibre. Ensure the initial route shell is ≤ 300 KB gzip. Report the bundle analyzer output.
4. Add error boundaries around the map, results, and Inspector. A failure in one panel must not blank the page.
5. Add empty and loading skeletons for the map, results, and Inspector.
6. Add a "Clear recent places" control in a small settings popover.

Verification: pnpm build, pnpm lint, pnpm typecheck, pnpm test. Report the gzip bundle sizes and the axe results summary.
Prompt 19: End-to-end tests, containers, and deployment
text
Read PRD.md Sections 13, 17.4, 17.5 and 12.1 before starting.

Task: Finish with E2E tests, docker-compose, and deploy documentation.

1. Playwright config in e2e/. Write the five specs from Section 17.4. Use the API in test mode with the fixture data pack.
2. docker-compose.yml with services api (port 8080, env from .env.example), web (nginx serving apps/web/dist and proxying /api to api), and optional osrm (commented out with instructions).
3. Dockerfile for web: multi-stage build, nginx config with gzip, security headers (CSP allowing self, OpenFreeMap style host, and fonts self-hosted), and SPA fallback.
4. .env.example with every variable from Section 12.1 and a comment for each.
5. Update CI to run E2E and build Docker images on main.
6. README.md: setup, run locally, run tests, run benchmarks, validate data, deploy steps, data verification checklist, and attribution notes (OSM, OpenFreeMap, OSRM, Nominatim).

Verification:
- pnpm test:e2e passes.
- docker compose up --build brings up both services. Report the output of curl http://localhost:8080/api/v1/health and that the web app loads at the nginx port.
- pnpm lint, pnpm typecheck, pnpm test, pnpm build all pass.

Final report: list every verification command from Prompts 1 to 19 and its result. List ever