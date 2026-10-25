# PocketRoute · Pune Transit Optimizer

> **DAA (Design and Analysis of Algorithms) Course Project**  
> A multi-modal transit route optimizer for the Pune Metropolitan Area implementing the **Resource-Constrained Shortest Path Problem (RCSPP)** with branch-and-bound pruning, cost-indexed dynamic programming, and Pareto dominance.

---

## 1. Overview & Algorithms

PocketRoute solves transit routing under strict passenger budget constraints across Pune's transit network (Pune Metro Purple Line & Aqua Line, PMPML bus network, Rainbow BRT corridors, auto-rickshaws, and ride-hailing cabs).

### Routing Engines

- **Route A (Fastest reference):** Dijkstra on arrival time ($T$) without financial bounds.
- **Route B (Cheapest reference):** Dijkstra on monetary cost ($C$) without travel time bounds.
- **Smart Route (RCSPP):** Label-setting Branch-and-Bound algorithm with three admissible pruning rules:
  - **Rule P1 (Budget Bound):** Prunes candidate labels where accumulated fare plus admissible lower bound exceeds passenger budget: $c' + \mathrm{LB}_c[w] > B$.
  - **Rule P2 (Time Bound):** Prunes candidate labels where earliest arrival time plus lower bound exceeds the incumbent best feasible arrival: $t' + \mathrm{LB}_t[w] \ge \mathrm{incumbent}$.
  - **Rule P3 (Pareto Dominance):** Prunes labels strictly dominated by an existing label at the same state: $\exists l \in \mathrm{Frontier}[w]: l.c \le c' \land l.t \le t'$.
- **Algorithm D (Dense DP):** Cost-indexed dynamic programming $dp[\mathrm{state}][c]$ over a Float64 typed array, verifying polynomial pseudo-optimal correctness via property-based cross-checks.

---

## 2. Setup & Prerequisites

- **Node.js:** `>= 20.0.0 < 21.0.0` (pinned in `.nvmrc`)
- **Package Manager:** `pnpm@10.11.0` (enforced via Corepack)
- **Docker & Docker Compose:** Optional for containerized deployment

### Quick Installation

```sh
# Ensure Node 20 is active
nvm use 20   # or use fnm / nvm-windows

# Enable corepack and activate pinned pnpm
corepack enable
corepack prepare pnpm@10.11.0 --activate

# Install all workspace dependencies
pnpm install
```

---

## 3. Running Locally

### Development Mode

Start the API and Web applications concurrently or in separate terminals:

```sh
# Terminal 1: Fastify API Server (port 8080)
pnpm --filter @pocketroute/api dev

# Terminal 2: React + Vite Web Client (port 5173)
pnpm --filter @pocketroute/web dev --port 5173
```

Visit `http://localhost:5173` to explore the interactive vector map, search dock, comparison cards, and DAA Complexity Inspector.

### Environment Variables

Copy `.env.example` to configure custom ports, rate limits, and services:

```sh
cp .env.example .env
```

| Variable             | Default                                       | Description                                   |
| -------------------- | --------------------------------------------- | --------------------------------------------- |
| `PORT`               | `8080`                                        | HTTP port for Fastify API                     |
| `HOST`               | `0.0.0.0`                                     | Network interface to bind                     |
| `CORS_ORIGIN`        | `http://localhost:3000`                       | Allowed CORS origins                          |
| `RATE_LIMIT_PER_MIN` | `30`                                          | Max API requests per IP per minute            |
| `DATA_VERSION`       | `2026.10.1`                                   | Network dataset version reported in `/health` |
| `NOMINATIM_URL`      | `https://nominatim.openstreetmap.org`         | OpenStreetMap geocoding fallback              |
| `OSRM_BASE_URL`      | _(empty)_                                     | Optional local OSRM road routing engine       |
| `VITE_API_BASE_URL`  | `/api/v1`                                     | Web client API base prefix                    |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/bright` | OpenFreeMap vector tile style                 |

---

## 4. Running Tests

### Complete Verification Suite

```sh
# Run ESLint and Prettier
pnpm lint

# Run TypeScript typechecks across all workspace packages
pnpm typecheck

# Run unit, property, and integration tests (160+ tests, Vitest)
pnpm test

# Build production bundles
pnpm build

# Run Playwright End-to-End tests (headless Chromium, Desktop, Tablet & Mobile)
pnpm test:e2e
```

### Running Specific Test Packages

```sh
# Pure algorithm unit tests & fast-check property suite (500 seeded graphs)
pnpm --filter @pocketroute/engine test

# Fastify API route tests & rate-limiting tests
pnpm --filter @pocketroute/api test

# Shared schema validations & fare formula tests
pnpm --filter @pocketroute/shared test
```

---

## 5. Benchmarks & Complexity Profiling

Run the empirical benchmark suite comparing Dijkstra TIME, Dijkstra COST, RCSPP, and Dense DP on real Pune transit queries:

```sh
pnpm bench
```

The benchmark reports median runtime (ms), state relaxations, labels created, priority queue operations, and theoretical bound ratios across queries.

---

## 6. Transit Data Validation & Geometry

```sh
# Validate data/pune schemas, stop connectivity, and headway bounds
pnpm validate-data

# Build cached GeoJSON road & transit geometries
pnpm build-geometry
```

---

## 7. Deployment with Docker & Docker Compose

PocketRoute is fully containerized using multi-stage Alpine images for minimal footprint and maximum security.

### Starting the Stack

```sh
# Build and run API and Web containers
docker compose up --build -d
```

### Verify Deployment

```sh
# Verify API healthcheck
curl http://localhost:8080/api/v1/health

# Access Web application (served by Nginx on port 80 & port 3000)
curl -I http://localhost:80/
```

### Service Architecture

- **`api` (`apps/api/Dockerfile`):** Multi-stage Node 20 Alpine container running Fastify with non-root user `node`, rate-limiting, Helmet security headers, and healthcheck.
- **`web` (`apps/web/Dockerfile`):** Multi-stage build producing static React assets served by Nginx Alpine with gzip compression, security headers (CSP, HSTS, frame-ancestors 'none'), SPA fallback routing, and reverse proxying `/api` to the backend.
- **`osrm` (Optional):** Pre-processed OpenStreetMap road routing engine for real turn-by-turn road geometries (see instructions in `docker-compose.yml`).

---

## 8. Pre-Release Data Verification Checklist

> [!IMPORTANT]
> In accordance with project governance rules, transit data in `data/pune` is never invented. Unverified items remain marked `"verified": false` until verified against authoritative PMPML or Pune Metro sources.

### Status of Pune Transit Datasets

| Dataset                | File                        | Verification Status                          | Notes                                                      |
| ---------------------- | --------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Pune Metro Purple Line | `data/pune/metro.json`      | **Verified** (`verified: true`)              | PCMC to Swargate (14 stations verified against Maha Metro) |
| Pune Metro Aqua Line   | `data/pune/metro.json`      | **Verified** (`verified: true`)              | Vanaz to Ramwadi (16 stations verified against Maha Metro) |
| Metro Fare Slabs       | `data/pune/fares.json`      | **Verified** (`verified: true`)              | ₹10 to ₹35 distance-based fare table                       |
| Auto & Cab Fares       | `data/pune/fares.json`      | **Verified** (`verified: true`)              | RTA Pune regulated tariffs (₹25 base, ₹17/km)              |
| Bus Fare Slabs         | `data/pune/fares.json`      | **Verified** (`verified: true`)              | PMPML ordinary stage fares (₹5, ₹10, ₹15, ₹20, ...)        |
| PMPML Bus Corridors    | `data/pune/bus_routes.json` | **Pending Verification** (`verified: false`) | 10 key corridors require PMPML GTFS audit (listed below)   |

### PMPML Bus Corridors Marked `verified: false`

The following 10 bus corridors use published timetable estimates and must be cross-checked against official PMPML GTFS feeds before public production deployment:

1. **Route 2:** Katraj to Shivajinagar (6 stops) — `verified: false`
2. **Route 24:** Katraj to Pune Railway Station (5 stops) — `verified: false`
3. **Route 103:** Katraj to Kothrud Stand (5 stops) — `verified: false`
4. **Route 149:** Nigdi to Hadapsar Gadital (8 stops) — `verified: false`
5. **Route 204:** Hadapsar to Chinchwad Station (6 stops) — `verified: false`
6. **Route BRT_1:** Rainbow BRT: Swargate to Katraj (6 stops) — `verified: false`
7. **Route 111:** Swargate to Pune Railway Station (5 stops) — `verified: false`
8. **Route 115:** Pune Station to Hinjawadi Phase 3 (7 stops) — `verified: false`
9. **Route 174:** Kothrud Depot to Pune Railway Station (5 stops) — `verified: false`
10. **Route 208:** Swargate to Hadapsar Gadital (5 stops) — `verified: false`

---

## 9. Attributions & Open Data Licenses

- **OpenStreetMap:** Transit road networks, station locations, and geometries © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
- **OpenFreeMap:** Free and open vector map tile hosting powered by OpenMapTiles and OpenStreetMap data.
- **Project OSRM:** High-performance road routing engine based on OpenStreetMap data.
- **Nominatim:** Search and reverse geocoding services provided by the OpenStreetMap Foundation.
- **Pune Mahanagar Parivahan Mahamandal Ltd (PMPML):** Public bus route schedules and stage fare structures.
- **Maharashtra Metro Rail Corporation (Maha Metro):** Pune Metro Line 1 & Line 2 station lists, interchange data, and official fare matrices.
