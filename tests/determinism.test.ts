import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/core/engine.js';
import { ConfigSchema } from '../src/core/schema.js';
import { hashObject } from '../src/core/hashing.js';

const config = ConfigSchema.parse({
  seed: 123,
  planet: { mapWidth: 80, mapHeight: 40, numContinents: 4, oceanCoverage: 0.68, radiusKm: 6371, tectonicsMode: 'lite', climateModel: 'koppen-lite' },
  societies: { numCultureGroups: 20, numCitiesTarget: 40, numPolitiesTarget: 40, startingYear: 0, endingYear: 200, techPace: 'medium', migrationIntensity: 0.3 },
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

describe('determinism', () => {
  it('generates same hash for same seed', () => {
    const worldA = generateWorld(config);
    const worldB = generateWorld(config);
    expect(hashObject(worldA)).toBe(hashObject(worldB));
  });
});
