import { PRNG } from '../core/prng.js';
import { CultureGroup } from '../core/types.js';
import { generateCultureName } from '../worldgen/naming.js';

const traitKeys = ['martial', 'trade', 'seafaring', 'agrarian', 'nomadic'];

export function generateCultureGroups(
  prng: PRNG,
  habitableCells: number[],
  numGroups: number
): CultureGroup[] {
  const cultures: CultureGroup[] = [];
  const used = new Set<number>();
  const nameRegistry = new Set<string>();
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
    const name = generateCultureName(prng, traits, nameRegistry);
    cultures.push({
      id: `cult-${i + 1}`,
      name,
      traits,
      coreRegionIds: [seedCell]
    });
  }
  return cultures;
}
