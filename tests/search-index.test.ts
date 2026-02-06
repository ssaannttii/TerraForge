import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/core/engine.js';
import { ConfigSchema } from '../src/core/schema.js';
import { buildWorldIndexes, searchWorldIndexes } from '../src/sim/indexes.js';

const config = ConfigSchema.parse({
  seed: 321,
  planet: { mapWidth: 60, mapHeight: 30, numContinents: 3, oceanCoverage: 0.66, radiusKm: 6371, tectonicsMode: 'lite', climateModel: 'koppen-lite' },
  societies: { numCultureGroups: 20, numCitiesTarget: 25, numPolitiesTarget: 50, startingYear: 0, endingYear: 120, techPace: 'medium', migrationIntensity: 0.3 },
  geopolitics: {
    aggression: 0.4,
    diplomacyBias: 0.6,
    coalitionTendency: 0.5,
    imperialOverreachPenalty: 0.5,
    resourceNeedWeight: 0.4,
    culturalAffinityWeight: 0.4,
    warCostModel: 'logistics-terrain',
    annexationRules: { allowVassalization: true, allowFullAbsorb: true, maxAnnexationPerDecadePct: 0.15 }
  },
  output: { detail: 'standard', snapshotsEveryYears: 10, exportFormats: ['json'] }
});

describe('search index determinism', () => {
  it('returns stable ordering for identical worlds', () => {
    const worldA = generateWorld(config);
    const worldB = generateWorld(config);
    const indexesA = buildWorldIndexes(worldA);
    const indexesB = buildWorldIndexes(worldB);
    const resultsA = searchWorldIndexes(indexesA, 'war', 20);
    const resultsB = searchWorldIndexes(indexesB, 'war', 20);
    expect(resultsA).toEqual(resultsB);
  });
});
