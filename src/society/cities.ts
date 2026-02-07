import { PRNG } from '../core/prng.js';
import { City, CultureGroup } from '../core/types.js';
import { CITY_POP_MIN, CITY_POP_MAX } from '../core/constants.js';
import { generateCityName } from '../worldgen/naming.js';

export function generateCities(
  prng: PRNG,
  candidateCells: number[],
  numCities: number,
  cultureGroups: CultureGroup[]
): City[] {
  const cities: City[] = [];
  const used = new Set<number>();
  const nameRegistry = new Set<string>();
  const cultureIds = cultureGroups.map((c) => c.id);
  const traitsById = new Map(cultureGroups.map((c) => [c.id, c.traits]));
  for (let i = 0; i < numCities; i += 1) {
    const cellId = candidateCells[prng.nextInt(0, candidateCells.length - 1)];
    if (used.has(cellId)) continue;
    used.add(cellId);
    const population = prng.nextInt(CITY_POP_MIN, CITY_POP_MAX);
    const cultureGroupId = cultureIds[prng.nextInt(0, cultureIds.length - 1)];
    const traits = traitsById.get(cultureGroupId) ?? { trade: 0.5, agrarian: 0.5 };
    const name = generateCityName(prng, traits, nameRegistry);
    cities.push({
      id: `city-${i + 1}`,
      name,
      cellId,
      population,
      coastal: prng.nextFloat01() > 0.5,
      river: prng.nextFloat01() > 0.4,
      cultureGroupId
    });
  }
  return cities;
}
