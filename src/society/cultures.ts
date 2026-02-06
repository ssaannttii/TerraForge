import { PRNG } from '../core/prng.js';
import { CultureGroup } from '../core/types.js';

const traitKeys = ['martial', 'trade', 'seafaring', 'agrarian', 'nomadic'];

export function generateCultureGroups(
  prng: PRNG,
  habitableCells: number[],
  numGroups: number
): CultureGroup[] {
  const cultures: CultureGroup[] = [];
  const used = new Set<number>();
  for (let i = 0; i < numGroups; i += 1) {
    const seedCell = habitableCells[prng.nextInt(0, habitableCells.length - 1)];
    if (used.has(seedCell)) continue;
    used.add(seedCell);
    const traits: Record<string, number> = {};
    let total = 0;
    for (const key of traitKeys) {
      const value = prng.nextFloat01();
      traits[key] = value;
      total += value;
    }
    for (const key of traitKeys) {
      traits[key] = traits[key] / total;
    }
    cultures.push({
      id: `cult-${i + 1}`,
      name: `Culture ${i + 1}`,
      traits,
      coreRegionIds: [seedCell]
    });
  }
  return cultures;
}
