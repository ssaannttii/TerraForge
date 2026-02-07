# TerraForge

Deterministic planet + geopolitics generator with a CLI and REST API. Produces a reproducible `WorldBundle` using a seeded PRNG and a fixed, ordered JSON output.

## Features
- Deterministic world generation with seeded PRNG (no `Math.random`).
- Pipeline phases: planet → cultures → cities → polities → timeline simulation.
- Snapshot + delta timeline indexing for efficient temporal queries.
- History-first viewer with timeline navigation, search, and story trails.

## Quickstart
```bash
pnpm install && pnpm build
node dist/cli/index.js view --config examples/small.json
```
The viewer auto-opens in your browser and prints the URL. Use <kbd>/</kbd> to focus search, <kbd>Enter</kbd> to open the first result, and <kbd>Esc</kbd> to close search.

## Install
```bash
# pnpm (recommended)
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
pnpm build

# npm (fallback)
npm install
npm run build
```

## CLI Usage
```bash
# Generate world (build first so dist/ exists)
node dist/cli/index.js generate --config examples/medium.json --out out/

# Run API server
node dist/cli/index.js serve --config examples/medium.json

# Launch viewer + open browser
node dist/cli/index.js view --config examples/small.json --out out/

# Query snapshot or polity
node dist/cli/index.js query --world out/world.json --year 500
node dist/cli/index.js query --world out/world.json --year 500 --polity polity-3

# Export data
node dist/cli/index.js export --world out/world.json --format csv --out out/
node dist/cli/index.js export --world out/world.json --format geojson --year 500 --out out/
```

## API Endpoints
- `GET /health`
- `GET /worlds`
- `POST /generate` → `{ worldId, bundle }`
- `GET /world/:worldId/meta`
- `GET /world/:worldId/planet`
- `GET /world/:worldId/map?layer=political|biome|elevation|resources&year=YYYY`
- `GET /world/:worldId/polities?year=YYYY&sort=powerScore&limit=...`
- `GET /world/:worldId/polity/:id?year=YYYY`
- `GET /world/:worldId/timeline?from=Y1&to=Y2&type=...`
- `GET /world/:worldId/war/:id`
- `GET /world/:worldId/wars`
- `GET /world/:worldId/cells`
- `GET /world/:worldId/changes?year=YYYY&type=...&polity=...`
- `GET /world/:worldId/changes?from=Y1&to=Y2&type=...&polity=...`
- `GET /world/:worldId/years/summary?from=Y1&to=Y2` → `{ from, to, years: [...] }`
- `GET /world/:worldId/search?q=...&limit=...`
- `GET /world/:worldId/events/search?q=...&limit=...` (legacy)
- `GET /world/:worldId/polity/:id/history?from=Y1&to=Y2`
- `GET /world/:worldId/export?format=...`
- `GET /viewer` (HTML)
- `GET /viewer/app.js`
- `GET /viewer/style.css`
- Invalid numeric query params (year/from/to/limit) return `400 { error: "invalid <param>" }`.
- Invalid `/generate` config returns `400 { error: "invalid config", details: [...] }`.

## Encyclopedia Viewer
```bash
pnpm install && pnpm build
node dist/cli/index.js view --config examples/small.json
```
The CLI starts the server, opens a browser window, and prints the viewer URL (copy it if the browser does not open). The viewer is served from `src/viewer` and expects to run from the repo root so it can read those files at runtime.

### Deep links
All viewer state is encoded in the URL hash for sharing:
- `/viewer#world=<id>&year=500`
- `/viewer#world=<id>&year=500&polity=polity-3`
- `/viewer#world=<id>&year=500&war=war-12`
- `/viewer#world=<id>&year=500&event=event-9`
- `/viewer#world=<id>&year=500&change=chg-88&layer=political`

### Keyboard shortcuts
- <kbd>/</kbd> focus global search
- <kbd>Esc</kbd> close search
- <kbd>←</kbd>/<kbd>→</kbd> step year -1/+1

### Viewer highlights
- Timeline-first layout: jump to years, heatmap navigation, and grouped events.
- Instant search across polities, wars, events, and changes.
- Inspector pages for events, polities, wars, and changes.
- Absorption ledger and top powers at year Y for quick context.

## Output Formats
- **JSON**: `WorldBundle` (deterministically ordered fields).
- **CSV**: `polities_by_year.csv`, `events.csv`, `wars.csv`.
- **GeoJSON**: cell points with biome/elevation/owner by year.

## Coherence
Events include causes and explanations. War outcomes produce territorial changes with constrained transfers. Power scores derive from population, GDP, tech, and stability so results stay internally consistent.

## Presets
- `examples/small.json`
- `examples/medium.json`
- `examples/huge.json`

## Performance Limits
- Timeline simulation is O(years * polities). Snapshots every N years reduce query costs.
- Exporting CSV for large worlds can be heavy; use GeoJSON for a single year if needed.

## Development
```bash
pnpm test
# or
npm test
```
