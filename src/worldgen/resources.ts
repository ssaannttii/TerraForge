import { PRNG } from '../core/prng.js';

export function assignResources(elevation: number[], isOcean: boolean[], riverIds: number[], prng: PRNG): string[][] {
  return elevation.map((e, idx) => {
    if (isOcean[idx]) return [];
    const tags: string[] = [];
    if (e > 0.5) tags.push('minerals');
    if (riverIds[idx] > 0 || e < 0.2) tags.push('fertile');
    if (prng.nextFloat01() > 0.92) tags.push('energy');
    if (prng.nextFloat01() > 0.9) tags.push('timber');
    return tags;
  });
}
