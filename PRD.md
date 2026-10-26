# PathFinder: Smart Route Planning and Optimization (PocketRoute Edition)

**Document:** PRD.md
**Version:** 1.0.0
**Status:** Source of truth for the build. If code and this document disagree, fix this document first, then the code.
**Scope:** Pune, India (PMPML bus, Pune Metro Purple and Aqua lines, auto-rickshaw, app cab, walking)
**Course:** Design and Analysis of Algorithms (DAA)

---

## 0. Document Control

| Field | Value |
|---|---|
| Owner | Project team |
| Target platform | Mobile-first responsive web app, desktop supported |
| Primary language | TypeScript (strict mode) across frontend, backend, and algorithm engine |
| Locale | en-IN, currency INR (₹), timezone Asia/Kolkata (IST) |

### Changelog
- 1.0.0: Initial production PRD covering transit model, graph model, three DAA algorithms, profiler, API, design system, and deployment.

---

## 1. Problem and Vision

Standard map applications optimize for either time or a single transit mode. They do not answer the question a student or commuter actually asks:

> "I need to travel from A to B starting at 5:30 PM with ₹75 in my pocket. What is the fastest combination of walking, PMPML bus, Pune Metro, auto, and cab that costs no more than ₹75? Which bus or metro line do I board, and when does it arrive?"

PocketRoute answers this question. It computes a budget-constrained route, compares it against the unconstrained fastest and cheapest routes, and explains the algorithmic work behind each answer.

### Vision statement
A pocket-sized route planner that treats money as a first-class constraint and makes the algorithm inspectable.

---

## 2. Goals and Non-Goals

### Goals
- **G1.** Return a budget-feasible route that minimizes arrival time subject to total fare ≤ budget (the RCSPP solution).
- **G2.** Return the unconstrained Fastest route and the unconstrained Cheapest route as references.
- **G3.** Produce a step-by-step itinerary with clock timestamps, line numbers, stop counts, waits, and per-leg fares.
- **G4.** Draw road-following and rail-following geometry on a smooth vector map.
- **G5.** Expose live algorithm metrics (operation counts, pruning counts, timing, complexity comparison) for an academic audience.
- **G6.** Ship a deployable system with tests, CI, containers, and documented configuration.

### Non-Goals (MVP)
- Live GPS tracking or real-time vehicle positions (schedule-based estimates only).
- Ticket purchase, payments, or booking.
- Multi-city support beyond Pune.
- Offline mode.
- User accounts. No personal data is stored server-side.

---

## 3. Users and Core Journeys

### Personas
- **P1: Budget student ("Riya").** Has ₹75 for the day. Wants the fastest trip that fits the budget.
- **P2: Daily commuter ("Arjun").** Wants a fare-versus-time tradeoff in one glance, and step-by-step boarding instructions.
- **P3: Professor / reviewer.** Wants to see the DAA internals: state tables, pruning, complexity.

### Journeys
- **J1 Plan.** User enters origin, destination, departure time, and budget. Taps "Find Optimal Route." Sees three comparison cards and the Smart route on the map.
- **J2 Follow.** User expands the vertical timeline, reads each leg, and sees the map fly to each leg.
- **J3 Inspect.** User opens the DAA Inspector drawer and reads the DP table, pruning counters, relaxation metrics, and the Dijkstra vs. constrained solver chart.

---

## 4. MVP Scope

| Area | In scope (MVP) | Out of scope |
|---|---|---|
| Geography | Pune city core and inner suburbs | Pimpri-Chinchwad outskirts beyond metro terminals, Pune district |
| Metro | Purple Line (PCMC to Swargate), Aqua Line (Vanaz to Ramwadi) | Under-construction extensions not open to public |
| Bus | 8 to 12 curated PMPML corridors with route numbers, including Rainbow BRT corridor | Full PMPML network (about 400+ routes) |
| Auto | Metered fare model, feeder and direct | Shared-auto pooling |
| Cab | Mini/UberGo/Ola-style fare model | Actual surge data from providers |
| Walk | Access, egress, and transfer | Indoor navigation |

---

## 5. Data Policy

Every dataset is versioned and carries `effectiveFrom` and `source` metadata. Nothing is hard-coded in algorithm code.

| Dataset | File | Source | Verification rule |
|---|---|---|---|
| Metro lines and stations | `data/pune/metro.json` | Pune Metro official station list, cross-checked with OpenStreetMap (OSM) | Station count per line checked by validation script. Interchange stations must be declared explicitly. |
| Metro track geometry | `data/geometry/metro/*.geojson` | OSM `railway` ways, stitched, via Overpass | Stitched length within 5% of station-to-station distance sum |
| Bus corridors | `data/pune/bus_routes.json` | PMPML published route list | Route numbers checked against PMPML site at build time. Unverified routes flagged `"verified": false`. |
| Bus geometry | `data/geometry/bus/*.geojson` | OSRM car profile through ordered corridor stops | Each geometry length within 25% of sum of consecutive stop-to-stop road distance |
| Fare tables | `data/pune/fares.json` | Brief-specified slabs | Schema validation; `effectiveFrom` required |
| Speeds, windows, penalties | `data/pune/params.json` | This PRD, Section 6 | Schema validation |
| Places (autocomplete seed) | `data/pune/places.json` | Curated list of about 150 landmarks, plus Nominatim fallback | Each entry has lat/lng inside the Pune bounding box |
| Map style | Remote (OpenFreeMap) | OpenFreeMap vector style | Attribution rendered. Style URL is an env var. |

**Rule:** The system must never silently invent a route geometry. If geometry is unavailable, the leg is drawn as a dashed line with an "estimated path" label and the API flags it with `geometryQuality: "estimated"`.

---

## 6. Transit Model

### 6.1 Mode summary

| Mode | Code | Fare | Speed | Wait model | Boarding penalty | Max leg constraint |
|---|---|---|---|---|---|---|
| Walking | `WALK` | ₹0 | 80 m/min (4.8 km/h) | none | none | 1.2 km per leg (fallback to 2.0 km if no transit candidates exist; flagged) |
| Pune Metro | `METRO` | Slab on distance (6.2) | 34 km/h | Headway: 6 min peak, 10 min off-peak | +3 min at boarding station | Operating hours 06:00 to 22:00 |
| PMPML Bus | `BUS` | Slab on distance (6.3) | 18 km/h peak, 20 km/h mid, 22 km/h off-peak | Headway per corridor, 8 to 15 min | none | Scheduled from first departure 06:00 |
| Auto-rickshaw | `AUTO` | Meter formula (6.4) | 24 to 28 km/h (use 26) | 2.5 min pickup | none | Door-to-door, or feeder within 4 km |
| App cab | `CAB` | Surge formula (6.5) | 26 to 32 km/h (use 29) | 4.5 min pickup | none | Door-to-door, or feeder within 4 km |

**Added assumption (not in brief):** `MIN_TRANSFER_MIN = 1`. When switching vehicles at a stop, the traveler needs at least 1 minute. This is configurable in `params.json`.

### 6.2 Metro fare slabs (distance = continuous ride distance on one line)

| Distance d (km) | Fare (₹) |
|---|---|
| d ≤ 2 | 10 |
| 2 < d ≤ 4 | 15 |
| 4 < d ≤ 8 | 20 |
| 8 < d ≤ 12 | 25 |
| 12 < d ≤ 18 | 30 |
| d > 18 | 35 |

### 6.3 PMPML bus fare slabs (distance = continuous ride distance on one bus route)

| Distance d (km) | Fare (₹) |
|---|---|
| d ≤ 3 | 5 |
| 3 < d ≤ 6 | 10 |
| 6 < d ≤ 10 | 15 |
| 10 < d ≤ 15 | 20 |
| 15 < d ≤ 22 | 25 |
| d > 22 | 30 |

### 6.4 Auto-rickshaw fare

Let d be the metered road distance in km.

```
base    = 25 + 17 * max(0, d - 1.5)
fare    = round_half_up(base)
if local_hour in [0, 5):   fare = round_half_up(fare * 1.25)   // night surcharge
```

Night surcharge window is 00:00 to 05:00 (exclusive end). Rounding happens after the night multiplier.

### 6.5 Cab fare

```
raw     = (45 + 14 * d + 1.5 * m) * S
fare    = round_half_up(raw)
S       = 1.3 if local time is in a rush window (6.7), else 1.0
```

Here m is the estimated ride duration in minutes.

### 6.6 Walking

- Speed 80 m/min. Walk time (min) = distance_m / 80.
- Road distance for access and transfer legs comes from the OSRM foot profile. Fallback when OSRM is unavailable: haversine × 1.25, flagged `geometryQuality: "estimated"`.

### 6.7 Time-of-day windows

| Name | Window (IST) | Metro headway | Bus speed | Cab surge |
|---|---|---|---|---|
| Peak | 08:00 to 11:00 and 17:00 to 20:30 | 6 min | 18 km/h | 1.3x |
| Off-peak | all other operating times | 10 min | 22 km/h | 1.0x |
| Mid (bus only) | 11:00 to 17:00 | n/a | 20 km/h | 1.0x |
| Night | 00:00 to 05:00 | metro closed | 22 km/h | 1.0x, auto night surcharge applies |

### 6.8 Scheduling model

All schedules are deterministic timetables, not live data.
- Metro: trains depart from the first terminal at 06:00 and follow the headway in the active window. Departure times are computed as the next value on the grid at or after the requested time.
- Bus: each corridor has `firstDeparture`, `peakHeadway`, `offPeakHeadway`, and a `stops` list with segment-level road distances.
- Wait time at a stop = next_departure − arrival_time. The UI labels this as "scheduled."

---

## 7. Graph Model

### 7.1 Node types
- **O:** origin (user-selected point).
- **D:** destination.
- **S_metro:** metro station, one per station per line.
- **S_bus:** bus stop, one per stop per corridor.

### 7.2 Line-expanded state space

A plain stop graph cannot charge fares correctly, because whether a new fare is due depends on the vehicle you arrive on. The planner therefore searches a **state graph**:

- **State** = (node v, last line l), where l ∈ {NONE, WALK, AUTO, CAB, METRO_PURPLE, METRO_AQUA, BUS_<route>, ...}. Let |L| be the number of line identifiers. The state count is |S| = |V| × |L|.
- **Edge** = (state (v, l) → state (w, m), fare f ≥ 0, time function τ(t)).

### 7.3 Macro-rides (continuous-line coalescing)

For each line with ordered stops s_0, s_1, ..., s_n, we create a macro-ride edge for every pair (i, k) with i < k. This edge represents "stay on this vehicle from s_i to s_k."

- Fare = slab(road_distance(s_i, s_k)) for metro or bus.
- Time = wait_until_departure + ride_time(s_i, s_k).

Because a macro-ride covers all consecutive stops, a traveler who stays on the same vehicle across any number of stops is charged once.

### 7.4 Coalescing rule (hard constraint)

**Rule C:** In any path, two consecutive edges may not share the same line identifier l. A split ride is never allowed, because the merged macro-ride always exists as a single edge and is the only valid representation of staying on the vehicle.

This rule is enforced in the search by skipping an edge when its line equals the current state's line. It is the reason the cost of a route is additive across edges (Section 8.5, Lemma 2).

### 7.5 Access and transfer edges

- **O → stop:** walk edges to every stop within 1.2 km (metro, bus). Auto and cab feeder edges to stops within 4 km (k-nearest, k = 8).
- **stop → D:** symmetric.
- **stop → stop (transfer):** walk within 1.2 km. Auto and cab transfers within 4 km, k = 8.
- **O → D:** direct walk (if ≤ 1.2 km), direct auto, direct cab.

### 7.6 Time semantics and FIFO

- Arrival time at a state is a non-decreasing function of departure time (FIFO property). It holds because waiting is allowed and schedules are deterministic. This property is required for label-setting correctness (Section 8.5, Lemma 3).
- A transfer at a stop adds `MIN_TRANSFER_MIN` and the boarding penalty if the target is metro.

### 7.7 Candidate pruning for performance

- Stops considered per query: at most 60 nearest to origin and 60 nearest to destination, plus any stop within 1.2 km of either.
- Graph is built per request from cached static edges plus origin and destination access edges. Static macro-rides are built once at process start.

---

## 8. Algorithms

### 8.1 Shared definitions
- A **label** λ = (state, t, c, parent) records arrival time t (minutes since midnight IST, allowing values past 24:00), accumulated fare c (integer ₹), and a backpointer for reconstruction.
- **Budget** B is an integer in [10, 300].
- **Smart route** = argmin t over all O-to-D paths with c ≤ B.

### 8.2 Algorithm A and B: Multi-criteria Dijkstra (Unit IV, greedy)

Two runs over the same state graph:
- **Route A (Fastest):** priority = arrival time t. Greedy choice: always settle the state with the smallest t.
- **Route B (Cheapest):** priority = (c, t) lexicographic. Greedy choice: always settle the state with the smallest c, breaking ties by t.

Both use a binary heap. Correct because all edge weights are non-negative and, for Route A, FIFO holds.

```
DIJKSTRA(G, O, D, key):            // key ∈ {TIME, COST}
  dist[(O, NONE)] = (t0, 0)
  heap.push((key(dist), (O, NONE)))
  while heap not empty:
    (k, s) = heap.pop()           ; pops++
    if k > key(dist[s]): continue
    if s.v == D: return reconstruct(s)
    for e in G.out(s):
      if e.line == s.line: continue        // Rule C
      relaxations++
      cand = (t_arrive(e, dist[s].t), dist[s].c + e.fare)
      if cand better than dist[e.target] by key:
        dist[e.target] = cand; heap.push(...); pushes++
  return INFEASIBLE
```

Note: Route B ignores time-dependent waits in its objective. Ties are broken by earliest arrival so the output is deterministic.

### 8.3 Algorithm C: Budget-constrained RCSPP solver (Unit III DP + Unit IV Branch and Bound)

**Problem.** Minimize arrival time at D subject to total fare ≤ B.

**Technique.** Label-setting search over Pareto fronts per state, with two admissible lower bounds used as branch-and-bound pruning rules.

**Lower bounds (backward Dijkstra from D on the static state graph):**
- LB_t(v): minimum possible remaining travel time from v to D, ignoring waits, boarding penalties, and fares.
- LB_c(v): minimum possible remaining fare from v to D, ignoring time.

**Dominance.** At state s = (v, l), label p = (t_p, c_p) dominates q = (t_q, c_q) iff t_p ≤ t_q and c_p ≤ c_q. Only non-dominated labels are kept. Because costs are integers in [0, B], the non-dominated frontier at any state has pairwise distinct costs and strictly decreasing times as cost increases, so it contains at most B + 1 labels (Lemma 4).

**Pruning rules (checked in this order when generating a child label):**
1. **Budget bound (P1):** c' + LB_c(w) > B → prune. Counted as `prunedBudget`.
2. **Time bound (P2):** t' + LB_t(w) ≥ incumbent → prune. Counted as `prunedBound`. The incumbent is the best feasible arrival at D found so far, initially ∞.
3. **Dominance (P3):** an existing non-dominated label at (w, m) dominates (t', c') → prune. Counted as `prunedDominance`. Existing labels dominated by the new one are removed.

```
RCSPP(G, O, D, B, t0):
  LB_t = BACKWARD_DIJKSTRA(G, D, weight=min_time)
  LB_c = BACKWARD_DIJKSTRA(G, D, weight=min_fare)
  if LB_c[O] > B: return INFEASIBLE_WITH_MIN_COST(LB_c[O])
  incumbent = ∞; best = null
  labels[(O, NONE)] = {(t0, 0, root)}
  heap.push((t0, 0, O, NONE, root))
  while heap not empty:
    (t, c, v, l, λ) = heap.pop(); pops++
    if λ is removed-by-dominance: continue
    if v == D:
      if t < incumbent: incumbent = t; best = λ
      continue
    for e in G.out((v, l)):
      if e.line == l: continue                              // Rule C
      relaxations++
      t' = t_arrive(e, t); c' = c + e.fare
      if c' + LB_c[e.w] > B:          prunedBudget++;    continue   // P1
      if t' + LB_t[e.w] >= incumbent: prunedBound++;     continue   // P2
      if DOMINATED(labels[(e.w, e.m)], t', c'):          prunedDominance++; continue  // P3
      REMOVE_DOMINATED_BY(labels[(e.w, e.m)], t', c')
      λ' = (t', c', (e.w, e.m), parent=λ)
      labels[(e.w, e.m)].add(λ'); heap.push(λ'); pushes++; created++
  if best == null: return INFEASIBLE_WITH_MIN_COST(LB_c[O])
  return reconstruct(best)
```

**Heap order.** Labels are popped in order of t (ties by c). With FIFO and non-negative waits, this order guarantees that the first label popped at D is the earliest feasible arrival, so the incumbent is final when the heap drains.

**Interpretation of the DP.** The labels per state are the sparse, non-dominated rows of the Unit III DP table dp[v][l][c] = minimum arrival time at (v, l) with fare exactly c. The dense version is Algorithm D.

### 8.4 Algorithm D: Dense cost-indexed DP (Unit III reference)

Used for cross-validation in tests and to render the DP table for small graphs in the Inspector.

```
DENSE_DP(G, O, D, B, t0):
  dp[(v,l)][c] = +∞ for all states and c ∈ [0, B]
  dp[(O,NONE)][0] = t0
  heap keyed by time over (v, l, c)
  while heap not empty:
    (t, v, l, c) = pop
    if t > dp[(v,l)][c]: continue
    for e in G.out((v,l)):
      if e.line == l: continue
      c' = c + e.fare
      if c' > B: continue
      t' = t_arrive(e, t)
      if t' < dp[(e.w,e.m)][c']:
        dp[(e.w,e.m)][c'] = t'; push
  return min over c ∈ [0, B] of dp[(D, l)][c], for all l
```

Fares are integers, so the cost index is exact. Algorithm C and Algorithm D must return the same optimal arrival time (property test, Section 17).

### 8.5 Correctness

**Lemma 1 (Rule C is safe).** A macro-ride from s_i to s_k has fare slab(d_ik) and time τ_ik. Any split path s_i → s_j → s_k on the same line is either disallowed by Rule C or dominated by the macro-ride, because the macro-ride covers the same distance without the boarding wait. The macro-ride is always present, so no feasible merged trip is lost.

**Lemma 2 (Additivity).** Under Rule C and macro-rides, the fare of a path equals the sum of its edge fares. Each edge corresponds to a maximal same-vehicle segment, so no fare is double-counted and none is skipped.

**Lemma 3 (FIFO and earliest-arrival optimality).** Departure from a state is at the next scheduled time at or after arrival. This makes arrival a non-decreasing function of arrival time at the stop. Therefore, if two labels reach the same state, the earlier one can always replicate any continuation of the later one no later. Dominance on time is safe.

**Lemma 4 (Pareto bound).** For a fixed state, non-dominated labels satisfy c_1 < c_2 < ... and t_1 > t_2 > ... Costs are integers in [0, B], so the frontier has at most B + 1 entries.

**Lemma 5 (Pruning is admissible).** LB_c and LB_t are computed on a relaxation of the true cost and time, so they are lower bounds. Rule P1 removes only states that cannot satisfy the budget. Rule P2 removes only states that cannot beat the incumbent. Rule P3 removes only states dominated by a label with the same line state that is no worse on either criterion and for which the same continuations are available.

**Theorem 1.** Algorithm C returns a feasible path of minimum arrival time among all paths with total fare ≤ B, or reports infeasibility with the minimum achievable fare.
*Sketch:* Lemmas 1 to 5 show that no optimal path is pruned. Termination follows because labels per state are bounded by B + 1 and time is bounded by the scheduling horizon.

**Theorem 2 (Consistency).**
- If Route A cost ≤ B, then Smart = Route A (same arrival time).
- Smart time ≥ Route A time.
- Smart cost ≥ Route B cost.
- Smart cost ≤ B, if a feasible route exists.
- Increasing B never increases Smart time.

### 8.6 Complexity

Let V be the number of nodes, E the number of edges, L the number of line identifiers (a small constant, about 10 to 40 here), and B the budget. Let S = V × L be the number of states and E_S = E × L the number of state-level edges.

| Algorithm | Theoretical (worst case) | Lower bound Ω | Dense table size Θ | Space |
|---|---|---|---|---|
| A: Dijkstra (time) | O(E_S log S) = O(E·L·log(V·L)) | Ω(S) if all states reachable | n/a | O(S) |
| B: Dijkstra (cost) | O(E_S log S) | Ω(S) | n/a | O(S) |
| C: RCSPP label-setting | O(E_S · B · log(S·B)) | Ω(S) | n/a | O(S · B) |
| D: Dense DP | O(E_S · B · log(S·B)) | Ω(S · B) | Θ(S · (B+1)) | Θ(S · (B+1)) |
| Backward LB Dijkstras | O(E_S log S) each | Ω(S) | n/a | O(S) |

**Hardness note.** RCSPP is NP-hard in general (it generalizes the 0/1 knapsack structure on the cost dimension). Its pseudo-polynomial dependence on B (Lemma 4) makes it tractable here because B ≤ 300 and fares are integers.

**Empirical comparison.** The Inspector shows, for each query, the measured count of pops, pushes, relaxations, labels created, pruned by each rule, and elapsed milliseconds, beside the theoretical bound evaluated at the query's V, E, L, B. The ratio of measured to bound is shown.

### 8.7 Profiler metrics (schema)

```json
{
  "pq": { "pushes": 0, "pops": 0 },
  "relaxations": 0,
  "labels": { "created": 0, "dominanceRemoved": 0, "maxFrontierSize": 0 },
  "pruned": { "budget": 0, "timeBound": 0, "dominance": 0 },
  "dp": { "statesExplored": 0, "statesTotal": 0 },
  "timing": { "elapsedMs": 0.0, "runs": 5, "medianMs": 0.0 },
  "graph": { "V": 0, "E": 0, "L": 0, "B": 0 },
  "theory": {
    "routeA": { "bound": "O(E*L*log(V*L))", "ops": 0 },
    "routeB": { "bound": "O(E*L*log(V*L))", "ops": 0 },
    "rcspp":  { "bound": "O(E*L*B*log(V*L*B))", "ops": 0 },
    "dense":  { "bound": "Theta(V*L*(B+1))", "ops": 0 }
  }
}
```

`elapsedMs` is measured with `performance.now()` around the solver only. The median of 5 runs is reported for queries under 50 ms and a single run otherwise.

### 8.8 Infeasibility

If no route fits the budget, the response has `smart: null` and `infeasible: { minimumRequiredFareINR, message }`. The message reads: "Minimum possible fare is ₹X. Increase your budget to at least ₹X to get a Smart route." This is `LB_c[O]` when that bound is achievable, or the Route B cost otherwise.

---

## 9. API Contract

Base path: `/api/v1`. JSON only. Errors follow RFC 7807 (`application/problem+json`).

### 9.1 `POST /route/plan`

Request:
```json
{
  "origin":      { "lat": 18.5204, "lng": 73.8567, "label": "Swargate" },
  "destination": { "lat": 18.5314, "lng": 73.8446, "label": "Shivajinagar" },
  "departureTime": "17:30",
  "date": "2026-10-25",
  "budgetINR": 75,
  "options": { "maxWalkM": 1200, "includeAuto": true, "includeCab": true }
}
```

Validation: `budgetINR` integer 10 to 300. `departureTime` HH:mm (IST) or "now". `date` optional, defaults to today in IST. Coordinates must lie in the Pune bounding box (lat 18.40 to 18.70, lng 73.70 to 74.00).

Response (abridged):
```json
{
  "requestId": "uuid",
  "budgetINR": 75,
  "routes": {
    "smart":    { "feasible": true, "totalFareINR": 70, "arrivalTime": "17:58", "durationMin": 28, "legs": [] },
    "fastest":  { "feasible": true, "totalFareINR": 110, "arrivalTime": "17:51", "durationMin": 21, "legs": [] },
    "cheapest": { "feasible": true, "totalFareINR": 30,  "arrivalTime": "18:20", "durationMin": 50, "legs": [] }
  },
  "comparison": { "fareSavedVsFastestINR": 40, "extraMinVsFastest": 7 },
  "infeasible": null,
  "metrics": { }
}
```

Each leg:
```json
{
  "mode": "METRO",
  "lineId": "METRO_PURPLE",
  "lineLabel": "Purple Line",
  "from": { "name": "Swargate", "lat": 18.50, "lng": 73.86 },
  "to":   { "name": "Civil Court", "lat": 18.52, "lng": 73.85 },
  "departAt": "17:36",
  "arriveAt": "17:44",
  "durationMin": 8,
  "distanceKm": 2.4,
  "stopCount": 3,
  "waitMin": 1,
  "fareINR": 15,
  "geometry": { "type": "LineString", "coordinates": [] },
  "geometryQuality": "exact",
  "instruction": "Board Purple Line toward PCMC at Swargate."
}
```

Query parameter `?includeMetrics=true` returns the full metrics block. It is off by default.

### 9.2 `GET /places/search?q=&limit=`
Returns up to 8 results from the local seed, with Nominatim fallback when the local match is weak. Responses are cached for 24 hours.

### 9.3 `GET /network`
Returns line and corridor geometry plus station markers for the map, cached with ETag.

### 9.4 `GET /health`
Returns 200 with `{ status, version, dataVersion, uptimeSec }`.

### 9.5 Non-functional API rules
- Rate limit: 30 requests per minute per IP on `/route/plan`.
- Request body max 8 KB.
- All routes validated with Zod schemas shared from `packages/shared`.
- Security headers via Helmet. CORS restricted to `CORS_ORIGIN`.
- Structured JSON logs with `requestId`.

---

## 10. Geometry and Map Rendering

### 10.1 Road geometry
- **Walk, auto, cab:** OSRM HTTP API using the `foot` profile for walk legs and the `car` profile for auto and cab. Geometry is returned as GeoJSON LineString (`overview=full`, `geometries=geojson`).
- **Bus:** corridor geometry precomputed offline (`scripts/build-geometry.ts`) by routing consecutive stops through OSRM and concatenating. Stored in `data/geometry/bus/`. At runtime, a bus leg slices the cached polyline between the boarding and alighting stop by nearest-point projection.
- **OSRM deployment:** self-hosted container built from a Maharashtra OSM extract (Geofabrik). The public OSRM demo server must not be used in production.

### 10.2 Rail geometry
- Metro track polylines are extracted from OSM `railway=light_rail|subway` ways, stitched in order, and simplified with Douglas-Peucker at 2 m tolerance.
- Fallback when stitching fails: Catmull-Rom spline through the station coordinates, flagged `geometryQuality: "schematic"`. Straight segments are never drawn for rail.

### 10.3 Estimated geometry
If OSRM is unavailable, walk and road legs use a quadratic Bézier with a perpendicular control point offset of 15% of segment length, drawn dashed, and flagged `geometryQuality: "estimated"`.

### 10.4 Map engine
- MapLibre GL JS (v4 or later, pinned).
- Base style: OpenFreeMap vector style (URL in `VITE_MAP_STYLE_URL`). Attribution shown on the map control.
- Layer order (bottom to top): base map, walk, auto, cab, bus, metro, markers, selected-leg highlight.
- Animations: `flyTo` to the selected leg's bounding box over 900 ms (`prefers-reduced-motion` disables it). Walk legs use an animated dash offset at 30 fps.
- Custom HTML markers: pill-shaped, mode-colored, with the stop name and time. Origin and destination use distinct pills.

---

## 11. Architecture and Tech Stack

```
Browser (React + Vite + TypeScript)
   │  fetch /api/v1
   ▼
API server (Fastify + TypeScript)  ──►  OSRM (container, optional)
   │                                    ──►  Nominatim (fallback geocoding)
   ▼
Engine package (pure TypeScript)
   ├─ pricing (fare formulas)
   ├─ timing (headways, waits, FIFO departures)
   ├─ graph builder (state graph, macro-rides, access edges)
   ├─ algorithms (A, B, C, D)
   └─ profiler (metrics, complexity)
   ▲
Static data (data/pune/*.json, data/geometry/*)
```

### 11.1 Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript 5 strict | One language across tiers, shared types |
| Monorepo | pnpm workspaces | Fast, strict dependency graph |
| Frontend | React 18, Vite, Tailwind CSS v3, Zustand, Framer Motion | Fast dev loop, small state surface, motion budget |
| Map | MapLibre GL JS, OpenFreeMap style | No billing, vector, smooth animation |
| Charts | Recharts | Simple, accessible charts for Inspector |
| Fonts | Self-hosted via `@fontsource` | No runtime CDN dependency |
| Backend | Fastify 4, Zod, pino | Fast, typed, structured logs |
| Tests | Vitest, fast-check (property tests), Playwright (E2E), @axe-core/playwright | Covers unit, property, user flows, and WCAG 2.2 AA accessibility audit |
| Lint/format | ESLint (typescript-eslint), Prettier | Consistency |
| Containers | Docker multi-stage, docker-compose | Reproducible deploy |
| CI | GitHub Actions | Lint, typecheck, test, build |

### 11.2 Why algorithms live in a pure package
The engine has no I/O. It is testable in isolation, can be benchmarked directly, and can be called from the API or from scripts.

---

## 12. Repository Structure and Configuration

```
pocketroute/
├─ PRD.md
├─ README.md
├─ package.json                    (pnpm workspace root)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ docker-compose.yml
├─ .github/workflows/ci.yml
├─ packages/
│  ├─ shared/                      (Zod schemas, types, constants)
│  └─ engine/                      (pricing, timing, graph, algorithms, profiler)
├─ apps/
│  ├─ api/                         (Fastify server)
│  └─ web/                         (React app)
├─ data/
│  ├─ pune/                        (metro.json, bus_routes.json, fares.json, params.json, places.json)
│  └─ geometry/                    (metro/, bus/)
├─ scripts/
│  ├─ validate-data.ts
│  ├─ build-geometry.ts
│  └─ bench.ts
└─ e2e/                            (Playwright specs)
```

### 12.1 Environment variables

| Variable | Used by | Example | Purpose |
|---|---|---|---|
| `PORT` | api | `8080` | HTTP port |
| `CORS_ORIGIN` | api | `https://pocketroute.example` | Allowed origin |
| `OSRM_BASE_URL` | api | `http://osrm:5000` | Road routing (optional) |
| `NOMINATIM_URL` | api | `https://nominatim.openstreetmap.org` | Geocoding fallback |
| `RATE_LIMIT_PER_MIN` | api | `30` | Rate limit |
| `LOG_LEVEL` | api | `info` | Log verbosity |
| `DATA_VERSION` | api | `2026.10.1` | Reported by `/health` |
| `VITE_API_BASE_URL` | web | `/api/v1` | API base |
| `VITE_MAP_STYLE_URL` | web | OpenFreeMap style URL | Map style |

---

## 13. Deployment

- **Web:** static build (`apps/web/dist`) served by Nginx container or static host (Vercel/Netlify). `VITE_*` values are injected at build time.
- **API:** Node 20 Alpine multi-stage image, non-root user, health check on `/health`.
- **OSRM (optional):** separate container, pre-processed Maharashtra extract, mounted read-only.
- **docker-compose:** services `api`, `web`, and optional `osrm`. The web container proxies `/api` to `api`.
- **Release gate:** CI must pass lint, typecheck, unit, property, API integration, and E2E tests before the image is tagged.
- **Rollback:** previous image tag is retained. Data version is pinned per release.

---

## 14. UI/UX Design System

### 14.1 Design principles
1. **Money and time, side by side.** Every result shows both, never one without the other.
2. **Glass over map.** Panels float over the map with a soft blur, so the route stays visible.
3. **Schedules are honest.** Labels say "scheduled" and "estimated" wherever the data is not live.
4. **Algorithms are visible.** The Inspector is a first-class feature, not a debug screen.
5. **Thumb first.** Designed at 390 px width first. Desktop is an enhancement.

### 14.2 Color tokens

| Token | Light value | Use | Contrast on surface |
|---|---|---|---|
| `--canvas` | `#EEF2F7` | App background behind map | n/a |
| `--surface` | `rgba(255,255,255,0.84)` with `backdrop-filter: blur(16px) saturate(140%)` | Panels | n/a |
| `--surface-solid` | `#FFFFFF` | Cards, inputs | n/a |
| `--ink` | `#0F172A` | Primary text | 17.9:1 |
| `--ink-muted` | `#475569` | Secondary text | 7.6:1 |
| `--border` | `rgba(15,23,42,0.10)` | Dividers and outlines | n/a |
| `--primary` | `#0F172A` (CTA fill) with `#FFFFFF` text | Primary button | 17.9:1 |
| `--focus` | `#2563EB` 2 px ring, 2 px offset | Focus ring | n/a |
| `--success` | `#047857` | Smart winner accent | 5.4:1 |
| `--warning` | `#B45309` | Infeasible and caution | 5.0:1 |
| `--metro-purple` | `#7C3AED` | Purple Line stroke and chip | stroke only |
| `--metro-aqua` | `#0891B2` | Aqua Line stroke and chip | stroke only |
| `--bus` | `#059669` | PMPML stroke and chip | stroke only |
| `--auto` | `#D97706` | Auto stroke and chip | stroke only |
| `--cab` | `#4F46E5` | Cab stroke and chip | stroke only |
| `--walk` | `#0284C7` | Walk dotted stroke | stroke only |

Mode colors are for strokes, icons, and chips. Text sitting on mode colors uses `--ink` or white with a contrast check in CI.

Dark mode: a parallel token set under `prefers-color-scheme: dark`. Surface becomes `rgba(15,23,42,0.80)`. Mode colors lighten by 10% to keep contrast on dark map styles.

### 14.3 Typography
- Display and headings: Plus Jakarta Sans, weights 600 and 700.
- Body and UI: Inter, weights 400 and 500.
- Numerics (times, fares, metrics, DP table): JetBrains Mono, weight 500, `font-variant-numeric: tabular-nums`.
- Scale: 12, 14, 16, 20, 24, 32 px. Line height 1.45 for body, 1.2 for headings.

### 14.4 Spacing, shape, elevation, motion
- Spacing: 4 px base grid (4, 8, 12, 16, 24, 32, 48).
- Radius: inputs and small buttons 12 px; cards and panels 16 px; pill toggles and chips 999 px.
- Elevation: `e1 = 0 1px 2px rgba(15,23,42,.06)`, `e2 = 0 8px 24px -8px rgba(15,23,42,.18)`, `e3 = 0 20px 48px -12px rgba(15,23,42,.28)`.
- Motion: enter 180 ms ease-out, press scale 0.98 over 120 ms, map `flyTo` 900 ms, sheet snap 260 ms spring (stiffness 320, damping 34). All disabled under `prefers-reduced-motion`.

### 14.5 Components
- **Pill button (primary):** 48 px tall, 16 px radius, ink fill, white label, `e2`. Loading state shows a spinner and "Finding routes…".
- **Pill chip (mode):** 28 px tall, mode color background at 12% alpha, mode color icon, ink label.
- **Budget slider:** range ₹10 to ₹300, step ₹1, 8 px track, thumb 24 px with `e2`. Live value in mono numerics above thumb. Preset pills: ₹30 "Broke Student," ₹60 "Smart Commute," ₹120 "Fast Mix." Selecting a preset animates the thumb.
- **Autocomplete:** 16 px radius input, 320 ms debounce, dropdown with recent-frequency boost (top 3 local picks shown with a star).
- **Comparison card:** 16 px radius, 160 px min width on desktop, horizontal scroll on mobile. Shows badge (Smart Budget Winner, Fastest Overall, Cheapest Overall), total fare, arrival time, duration. The Smart card has a success accent border and a savings chip ("Saves ₹40 vs Fastest").
- **Timeline leg:** vertical rail 2 px, node circles 12 px, mode icon 24 px, time in mono, instruction text, fare badge pill, and wait badge ("Wait 4 min, scheduled").
- **Inspector drawer:** see Section 15.4.

### 14.6 Layout and responsive behavior

| Breakpoint | Layout |
|---|---|
| < 640 px (mobile) | Full-screen map. Dock as top card (collapsible). Results in a bottom sheet with three snap points: peek (96 px), half (50 vh), full (92 vh). Inspector as full-height bottom sheet. |
| 640 to 1023 px | Dock as floating left card (360 px). Results below dock, scrollable. Inspector as right drawer (480 px). |
| ≥ 1024 px | Dock 380 px left, results panel 420 px right, map center. Inspector as right drawer 560 px, overlaying results. |

Safe-area insets respected on iOS (`env(safe-area-inset-*)`).

### 14.7 Map styling
- Base style: OpenFreeMap light style.
- Route stroke widths: metro 6 px, bus 5 px, auto and cab 4 px, walk 3 px dotted. Selected leg +2 px with a white casing.
- Casing: 1 px white outline on all route lines for contrast over the basemap.
- Origin pill: ink background, white text. Destination pill: mode-neutral slate.
- Stop markers: 8 px circles, white fill, mode-color stroke, visible above zoom 14.

### 14.8 Accessibility
- WCAG 2.2 AA for all text and controls.
- Keyboard: every control reachable. Map has a keyboard-accessible "Next leg" and "Previous leg" control.
- Screen readers: timeline is an ordered list. Each leg reads as "Board Purple Line at 5:36 PM from Swargate, arrive Civil Court 5:44 PM, fare ₹15."
- Focus ring `--focus`, never removed.
- Touch targets at least 44 by 44 px.
- Color is never the only signal: mode icons and labels accompany all colors.

---

## 15. Screens and Interaction Specs

### 15.1 Dock (Search and Budget)
- Fields in order: Start, End (autocomplete), Departure time (defaults to "Now" in IST), Budget slider with presets, primary CTA.
- Validation: Start and End must be different. Budget integer 10 to 300. Errors shown inline under the field.
- Swap button between Start and End (rotates 180 degrees).
- "Use my location" is optional and requires explicit permission; it does not persist.

### 15.2 Results
- Top: three comparison cards. Smart first and highlighted.
- If Smart is infeasible: a warning card with the minimum required budget and a one-tap "Set budget to ₹X" action.
- Below: timeline for the selected route. Switching cards updates the timeline and map.
- Summary line: "Leave 5:30 PM, arrive 5:58 PM, ₹70 total, 1 transfer."

### 15.3 Map interactions
- Tapping a timeline leg flies the map to that leg.
- Tapping a stop marker shows its name and next scheduled departure.
- The route layers reflow when the selected card changes, with a 200 ms cross-fade.

### 15.4 DAA Algorithm and Complexity Inspector
Tabs:
1. **Overview:** the three algorithms, their pseudocode, and the complexity class. A small table shows V, E, L, B for the current query.
2. **DP table:** for small graphs (V × B ≤ 20,000 cells), the dense table dp[state][c] in a scrollable grid with mono numerics. Cells that were pruned are struck through. Cells on the Smart path are highlighted. For larger graphs, the table is replaced by the sparse Pareto frontier per state.
3. **Pruning:** counters for pruned-by-budget, pruned-by-bound, pruned-by-dominance, with a stacked bar.
4. **Relaxations:** table of pushes, pops, relaxations, labels created, max frontier size, measured against the theoretical bound with a ratio.
5. **Chart:** Recharts bar chart comparing Dijkstra (time), Dijkstra (cost), RCSPP, and Dense DP on operations count and elapsed ms, plus a line for the theoretical bound scaled to the same units.
6. **Timing:** median ms and run count, with a button to re-run the query 5 times (client calls the API with `includeMetrics=true` each time).

---

## 16. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance (server) | `/route/plan` p95 ≤ 400 ms for the default network (about 180 stops, 2 metro lines, 10 bus corridors) on a 2 vCPU instance |
| Performance (web) | Initial route shell ≤ 300 KB gzip (MapLibre lazy-loaded in a separate chunk). LCP ≤ 2.5 s on mid-tier mobile over 4G |
| Map smoothness | 60 fps pan and zoom on mid-tier mobile with ≤ 1,500 rendered features |
| Reliability | `/route/plan` returns a structured response for 100% of valid inputs, including infeasible cases |
| Correctness | Property tests (Section 17) pass on every CI run |
| Privacy | No personal data stored server-side. Recent place picks are stored in `localStorage` under `pr.recent` and can be cleared in settings |
| Security | Zod validation on every input. Rate limiting. Helmet headers. No `eval`. Dependencies scanned in CI |
| Observability | Structured logs. Request ID on every response. `/health` for probes |
| Accessibility | WCAG 2.2 AA (Section 14.8) |
| Licensing | Attribution displayed for OSM (ODbL), OpenFreeMap, OSRM, and Nominatim usage |

---

## 17. Testing and Acceptance Criteria

### 17.1 Unit tests (Vitest, engine package, target ≥ 90% line coverage)
- Fare slabs: exact boundary values (2.0, 2.01, 4.0, 18.0, 18.01) for metro and bus.
- Auto fare: d = 0, 1.5, 1.6, 10 km; night and non-night; rounding half-up.
- Cab fare: peak and off-peak; surge multiplier applied before rounding.
- Next-departure: at 05:59 (none), 06:00 (first), exactly on the headway grid, across peak boundary 11:00.
- Walk time: 1.2 km = 15 min exactly.

### 17.2 Algorithm tests
- Coalescing: a 4-stop metro ride is charged one slab, not four.
- Rule C: no path contains two consecutive edges with the same line.
- Route A ≤ Smart (time). Route B ≤ Smart (cost ordering, Smart cost ≥ Route B cost).
- Smart cost ≤ B when feasible.
- If Route A cost ≤ B, Smart time equals Route A time.
- Monotonicity: increasing B never increases Smart time (sweep B from 10 to 300 on fixed fixtures).
- Algorithm C equals Algorithm D on time for 500 randomized small graphs (property test, fast-check, seeded).
- FIFO: departure-time monotonicity of arrival for random schedules.
- Infeasibility: when B is below the minimum possible fare, response is infeasible with the correct minimum.

### 17.3 API tests
- Valid request returns 200 with all three routes.
- Invalid budget (9, 301, 74.5) returns 400 with a problem+json body.
- Coordinates outside Pune return 400.
- Rate limit returns 429 after 30 requests in a minute.
- `includeMetrics=true` returns the full metrics block.

### 17.4 E2E tests (Playwright)
1. Plan the example trip (Swargate to Shivajinagar, 17:30, ₹75). Three cards appear. Smart card has the savings chip.
2. Select a preset (₹30). Smart card updates. Timeline updates.
3. Open Inspector, see pruning counters, switch to DP table tab, and the chart renders.
4. Infeasible case (₹10 for a long trip). Warning card with minimum budget appears. One-tap budget fix works.
5. Mobile viewport (390 by 844): bottom sheet snaps through all three positions.

### 17.5 Acceptance criteria (MVP definition of done)
- All tests in 17.1 to 17.4 pass in CI.
- `pnpm validate-data` passes with zero errors.
- Lighthouse performance ≥ 85 on mobile for the root route.
- Docker compose brings up the full stack in under 2 minutes on a clean machine.
- A reviewer can open the Inspector and reproduce the profiler numbers by running `pnpm bench`.

---

## 18. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Route numbers or corridors inaccurate | Wrong instruction to user | `verified` flag, validation script, and visible "scheduled, verify on PMPML" disclaimer |
| Fare changes | Wrong budget results | Versioned `fares.json` with `effectiveFrom`; disclaimer; update path without code change |
| OSRM not available | Geometry gaps | Estimated Bézier fallback, clearly flagged |
| Nominatim rate limits | Autocomplete failures | Local seed first, 24 h cache, debounce, fallback to Photon if needed |
| Pareto blow-up | Slow query | Dominance, B ≤ 300 bound, candidate pruning, 500 ms soft timeout that returns best-known feasible route with `partial: true` |
| Misleading "live" impression | Trust | All times labeled scheduled; no live data claims |
| Map style outage | Blank map | Fallback to a raster Carto Voyager style |

---

## 19. Out of Scope and Roadmap

- **v1.1:** Real-time arrival data from PMPML or Pune Metro if an official feed becomes available.
- **v1.2:** Full PMPML network via GTFS import.
- **v1.3:** Shared auto pooling as a separate mode with pooled fare rules.
- **v2.0:** Multi-city via a city-profile configuration.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| RCSPP | Resource-Constrained Shortest Path Problem |
| Label | A (time, cost) record at a state with a backpointer |
| Pareto frontier | Set of non-dominated labels at a state |
| Macro-ride | Single edge representing a continuous stay on one vehicle |
| Coalescing | Charging one fare for a continuous ride on one line |
| FIFO | First-in-first-out property of time-dependent edges (later departures never arrive earlier) |
| Headway | Scheduled time between consecutive vehicles on a line |
| Slab | Fare band selected by distance range |
| OSRM | Open Source Routing Machine |
| LB | Admissible lower bound used for pruning |

---

## 21. Changelog

- **2026-10-26 (v1.1.0)**: Added Section 22 specifying collision-free map overlay safe zone, live GPS geolocation with Nominatim reverse geocoding cache, first-mile connector with auto/walk feeder edges, map click-to-pin & marker dragging, timeline-to-map synchronization, 60 fps live commute animation simulator, and time-of-day transit service rules (metro closing window & night auto surcharge).
- **2026-10-26 (v1.0.1)**: Added `@playwright/test` and `@axe-core/playwright` to Section 11.1 for automated WCAG 2.2 AA accessibility audits and Playwright E2E verification.

---

## 22. Map Layout, Geolocation, and Live Simulation

### 22.1 Layout Safe Zone and Non-Colliding Markers
- **Root Cause & Objective:** Prevent visual collisions between Start/Destination pills, the midpoint "Estimated Path" pill, route comparison chips, and UI panels (left dock, bottom sheet, right results).
- **Map Overlay Layer:** A dedicated map overlay layer above the vector map canvas (z-index 450) and beneath floating navigation/dock UI (z-index 30/20). Pointer events default to `none` with individual pills set to `pointer-events: auto`.
- **Dock Safe Zone Offsets:**
  - Desktop (≥ 1024 px): overlay content padded by 396 px on the left (380 px dock + 16 px buffer).
  - Tablet (640 px to 1023 px): overlay padded by 376 px on the left (360 px dock + 16 px buffer).
  - Mobile (< 640 px): pills stacked inside or above the top dock card and clear of the bottom sheet.
  - Invariant: No floating pill or marker tag may anchor at `left: 0` or `top: 0`.
- **Marker Tags & Anchors:**
  - Start marker: emerald pill `Start: <Name>`, anchored `bottom-left` (or pixel offset `[0, -36]`), z-index 400.
  - Destination marker: coral pill `Dest: <Name>`, anchored `bottom-right` (or pixel offset `[0, -36]`), z-index 401.
  - Zoom < 12: marker labels collapse into a compact icon, expanding to full text on hover or focus.
- **Route Callouts:**
  - Single visible route: Callout positioned strictly at 50% arc length computed from cumulative Haversine distance along the polyline (never coordinate array midpoints or start/end).
  - Multiple visible routes: Callouts positioned at 35% arc length for Fastest, 55% for Smart Budget, and 70% for Cheapest, offset perpendicular to the line direction by ±14 px on alternating sides.
- **Acceptance Criteria:** At 390×844, 768×1024, and 1440×900 viewports, bounding-box collision tests verify that no two elements overlap among: Start pill, Destination pill, route callouts, dock, results panel, mobile bottom sheet, and map controls.

### 22.2 GPS Location and First-Mile Connector
- **User-Initiated GPS:** "Use Current Location" button in Start input and autocomplete dropdown; floating "My Location" button at bottom-right pulsing a blue accuracy ring and dot. GPS is only invoked on explicit user tap (never on page load).
- **Browser Geolocation:** Invokes `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`. Coordinates are never persisted across page reloads.
- **Error Handling & Bounds Check:**
  - Explicit inline error messages for: Permission Denied, Position Unavailable, Timeout, and Insecure Context.
  - Pune Bounding Box (lat 18.40 to 18.70, lng 73.70 to 74.00): If coordinates fall outside, displays: *"You appear to be outside Pune. Pick a start point, or try the demo location."*
  - Demo Fallback: Toast with button *"Simulate GPS in Pune (VIT Bibwewadi / Swargate)"* using verified landmark coordinates from `data/pune/places.json` (`pl_swargate_bus_stand` lat 18.5015, lng 73.8542; `pl_pune_railway_station` lat 18.5288, lng 73.8744).
- **Reverse Geocoding Endpoint:** `GET /api/v1/geo/reverse?lat=&lng=`
  - Proxies to Nominatim reverse (`https://nominatim.openstreetmap.org/reverse?format=json`) with `NOMINATIM_USER_AGENT`.
  - Rate limited to 1 req/sec, cached for 24 hours keyed by coordinates rounded to 4 decimal places, with a 2-second timeout.
  - Sets Start input to `"Current Location (<Area Name>)"`. On reverse geocode failure, falls back cleanly to `"Current Location (<lat>, <lng>)"` without blocking routing.
- **First-Mile Connector (packages/engine):**
  - Origin GPS point acts as query origin node `O` without creating a new node type.
  - Finds the 3 nearest transit stops by Haversine distance within Pune.
  - For each stop: if distance ≤ 1.2 km, creates a `WALK` access edge at ₹0. If distance > 1.2 km and ≤ 4.0 km, creates an `AUTO` feeder edge priced using `autoFareINR(distKm)`.
  - Road geometry via OSRM or Bézier fallback marked `geometryQuality: "estimated"`.
  - Acceptance Criteria: Property tests verify nearest-3 stop selection, walk threshold at 1.2 km, auto feeder pricing for 2 km and 4 km, and 400 validation error for points outside Pune.

### 22.3 Map Click-to-Pin, Drag, and Swap
- **Endpoint Swap:** Circular swap button between Start and Destination with 180° rotation over 260 ms, swapping inputs and triggering route re-calculation. Respects `prefers-reduced-motion`. Full keyboard accessibility.
- **Map Click-to-Pin:** Clicking the map populates the first empty input (Origin or Destination), or presents a contextual prompt *"Set as Start or Destination?"* if both fields are populated.
- **Marker Dragging:** Start and Destination markers have `draggable: true`. On drag end, the new coordinates are reverse-geocoded via `/api/v1/geo/reverse` and the route is updated. Drag preview remains lightweight with no API calls until release.

### 22.4 Timeline-to-Map Synchronization and Live Commute Simulation
- **Timeline Interaction:**
  - Hovering a timeline step highlights the corresponding map segment.
  - Clicking a step selects that leg, calls `map.fitBounds` with safe padding clearing the dock and sheet, thickens the polyline by 2 px, and shows a floating stop detail card.
  - On mobile, clicking a leg collapses the bottom sheet to the half snap point (50 vh) ensuring map visibility.
- **Live Commute Simulator:**
  - *"▶ Simulate Live Commute"* button on the selected route card.
  - Animates a commuter marker along the route's concatenated polyline from start to end using `requestAnimationFrame` at ~60 fps, capped at a maximum of 20 seconds duration.
  - Marker icon dynamically changes based on active transit mode (`WALK`, `BUS`, `METRO`, `AUTO`, `CAB`).
  - Live HUD displays a running clock starting at `departureTime` and advancing with simulated minutes, and a *"Money Spent So Far (₹)"* counter incrementing at leg boundaries.
  - Controls: Play, Pause, Restart.
  - Respects `prefers-reduced-motion` by displaying a static progress bar instead of 60 fps marker animation. Clean animation frame cancellation on unmount.

### 22.5 Time-of-Day Service Rules
- **Metro Service Window:** Pune Metro operates strictly from 06:00 to 22:00 IST per `data/pune/params.json`.
  - The routing engine excludes any metro boarding edge whose departure time falls outside 06:00–22:00 IST.
  - When departure is between 22:00 and 06:00 IST, the UI displays a prominent notice: *"Metro is closed at this time. Routed via bus and auto."* The returned itinerary contains zero METRO legs.
- **Night Auto Surcharge:** Applies the +25% night multiplier between 00:00 and 05:00 IST (`autoFareINR` from `packages/engine`). The timeline leg fare and total fare match the API returned price.
- **Acceptance Criteria:** Unit tests verify metro closed at 22:30, metro open at 21:59, night auto at 00:30 (surcharged), and standard auto at 05:00 (no surcharge).
