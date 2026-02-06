# TerraForge

Deterministic planet + geopolitics generator with a CLI and REST API. Produces a reproducible `WorldBundle` using a seeded PRNG and a fixed, ordered JSON output.

## Features
- Deterministic world generation with seeded PRNG (no `Math.random`).
- Pipeline phases: planet -> cultures -> cities -> polities -> timeline simulation.
- Snapshot + delta timeline indexing for efficient temporal queries.
- CLI + Fastify API endpoints per spec.

## Install
```bash
pnpm install
pnpm build
```

## CLI Usage
```bash
# Generate world
node dist/cli/index.js generate --config examples/medium.json --out out/

# Run API server
node dist/cli/index.js serve --config examples/medium.json

# Query snapshot or polity
node dist/cli/index.js query --world out/world.json --year 500
node dist/cli/index.js query --world out/world.json --year 500 --polity polity-3

# Export data
node dist/cli/index.js export --world out/world.json --format csv --out out/
node dist/cli/index.js export --world out/world.json --format geojson --year 500 --out out/
```

## API Endpoints
- `GET /health`
- `POST /generate` -> `{ worldId, bundle }`
- `GET /world/:worldId/meta`
- `GET /world/:worldId/map?layer=political|biome|resources&year=YYYY`
- `GET /world/:worldId/polities?year=YYYY&sort=powerScore&limit=...`
- `GET /world/:worldId/polity/:id?year=YYYY`
- `GET /world/:worldId/timeline?from=Y1&to=Y2&type=...`
- `GET /world/:worldId/war/:id`
- `GET /world/:worldId/changes?year=YYYY`
- `GET /world/:worldId/export?format=...`

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
```
