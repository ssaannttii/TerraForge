import { describe, expect, it } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { generateWorld } from '../src/core/engine.js';
import { ConfigSchema } from '../src/core/schema.js';
import { exportCsv } from '../src/export/csv.js';
import { exportGeoJson } from '../src/export/geojson.js';
import { exportJson } from '../src/export/json.js';

const config = ConfigSchema.parse({
  seed: 77,
  planet: { mapWidth: 40, mapHeight: 20, numContinents: 3, oceanCoverage: 0.66 },
  societies: { numCultureGroups: 20, numCitiesTarget: 20, numPolitiesTarget: 50, endingYear: 100 },
  output: { snapshotsEveryYears: 50 }
});

const bundle = generateWorld(config);
const outDir = '/tmp/terraforge-test-export';

describe('exports', () => {
  it('exports valid CSV files', async () => {
    await mkdir(outDir, { recursive: true });
    await exportCsv(bundle, outDir);

    const polities = await readFile(`${outDir}/polities_by_year.csv`, 'utf-8');
    const lines = polities.split('\n');
    expect(lines[0]).toBe('year,polityId,powerScore,population,gdp,techLevel,stability');
    expect(lines.length).toBeGreaterThan(1);

    const events = await readFile(`${outDir}/events.csv`, 'utf-8');
    expect(events.startsWith('year,type,actors,title')).toBe(true);

    const wars = await readFile(`${outDir}/wars.csv`, 'utf-8');
    expect(wars.startsWith('id,startYear,endYear,outcome,sideA,sideB')).toBe(true);

    await rm(outDir, { recursive: true, force: true });
  });

  it('exports valid GeoJSON', async () => {
    await mkdir(outDir, { recursive: true });
    const outPath = `${outDir}/world.geojson`;
    await exportGeoJson(bundle, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const geojson = JSON.parse(raw);
    expect(geojson.type).toBe('FeatureCollection');
    expect(Array.isArray(geojson.features)).toBe(true);
    expect(geojson.features.length).toBe(bundle.cells.length);
    expect(geojson.features[0].type).toBe('Feature');
    expect(geojson.features[0].geometry.type).toBe('Point');

    await rm(outDir, { recursive: true, force: true });
  });

  it('exports valid JSON', async () => {
    await mkdir(outDir, { recursive: true });
    const outPath = `${outDir}/world.json`;
    await exportJson(bundle, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.meta.seed).toBe(77);
    expect(parsed.cells.length).toBe(40 * 20);

    await rm(outDir, { recursive: true, force: true });
  });
});
