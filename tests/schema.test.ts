import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/core/engine.js';
import { ConfigSchema, WorldBundleSchema } from '../src/core/schema.js';

const config = ConfigSchema.parse({
  seed: 77,
  planet: { mapWidth: 50, mapHeight: 25, numContinents: 3, oceanCoverage: 0.65, radiusKm: 6371, tectonicsMode: 'lite', climateModel: 'koppen-lite' },
  societies: { numCultureGroups: 20, numCitiesTarget: 20, numPolitiesTarget: 20, startingYear: 0, endingYear: 50, techPace: 'medium', migrationIntensity: 0.3 },
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

describe('schema', () => {
  it('validates output', () => {
    const world = generateWorld(config);
    expect(WorldBundleSchema.safeParse(world).success).toBe(true);
  });
});
