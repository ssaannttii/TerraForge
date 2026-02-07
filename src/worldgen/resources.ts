import { PRNG } from '../core/prng.js';
import { MINERAL_ELEVATION_THRESHOLD, FERTILE_ELEVATION_THRESHOLD, ENERGY_CHANCE, TIMBER_CHANCE } from '../core/constants.js';

export function assignResources(elevation: number[], isOcean: boolean[], riverIds: number[], prng: PRNG): string[][] {
  return elevation.map((e, idx) => {
    if (isOcean[idx]) return [];
    const tags: string[] = [];
    if (e > MINERAL_ELEVATION_THRESHOLD) tags.push('minerals');
    if (riverIds[idx] > 0 || e < FERTILE_ELEVATION_THRESHOLD) tags.push('fertile');
    if (prng.nextFloat01() < ENERGY_CHANCE) tags.push('energy');
    if (prng.nextFloat01() < TIMBER_CHANCE) tags.push('timber');
    return tags;
  });
}
