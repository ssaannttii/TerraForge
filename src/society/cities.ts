import { PRNG } from '../core/prng.js';
import { City } from '../core/types.js';

export function generateCities(
  prng: PRNG,
  candidateCells: number[],
  numCities: number,
  cultureIds: string[]
): City[] {
  const cities: City[] = [];
  const used = new Set<number>();
  for (let i = 0; i < numCities; i += 1) {
    const cellId = candidateCells[prng.nextInt(0, candidateCells.length - 1)];
    if (used.has(cellId)) continue;
    used.add(cellId);
    const population = prng.nextInt(5000, 120000);
    const cultureGroupId = cultureIds[prng.nextInt(0, cultureIds.length - 1)];
    cities.push({
      id: `city-${i + 1}`,
      name: `City ${i + 1}`,
      cellId,
      population,
      coastal: prng.nextFloat01() > 0.5,
      river: prng.nextFloat01() > 0.4,
      cultureGroupId
    });
  }
  return cities;
}
