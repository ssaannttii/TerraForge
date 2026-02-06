import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/core/engine.js';
import { ConfigSchema } from '../src/core/schema.js';
import { expandRanges } from '../src/core/utils/compress.js';

const config = ConfigSchema.parse({
  seed: 42,
  planet: { mapWidth: 60, mapHeight: 30, numContinents: 4, oceanCoverage: 0.66, radiusKm: 6371, tectonicsMode: 'lite', climateModel: 'koppen-lite' },
  societies: { numCultureGroups: 20, numCitiesTarget: 30, numPolitiesTarget: 30, startingYear: 0, endingYear: 100, techPace: 'medium', migrationIntensity: 0.3 },
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

describe('invariants', () => {
  it('has no overlapping territories and capitals on land', () => {
    const world = generateWorld(config);
    const occupied = new Set<number>();
    for (const polity of world.politiesInitial) {
      const ids = expandRanges(polity.territory.cellIdsCompressed);
      for (const id of ids) {
        expect(occupied.has(id)).toBe(false);
        occupied.add(id);
      }
      const capitalCity = world.cities.find((city) => city.id === polity.capitalCityId);
      expect(capitalCity).toBeTruthy();
      const cell = world.cells[capitalCity!.cellId];
      expect(cell.isOcean).toBe(false);
    }
  });
});
