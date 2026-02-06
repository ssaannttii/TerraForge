import { PRNG } from '../core/prng.js';

const syllables = {
  martial: { c: ['kr', 'dr', 'gr', 'th', 'br'], v: ['a', 'o', 'u'] },
  trade: { c: ['l', 'm', 'n', 's', 'v'], v: ['a', 'e', 'i', 'o'] },
  seafaring: { c: ['s', 'h', 'r', 't'], v: ['a', 'e', 'o', 'u'] },
  agrarian: { c: ['b', 'd', 'g', 'k', 'p'], v: ['a', 'e', 'i'] },
  nomadic: { c: ['q', 'z', 'x', 'y', 'n'], v: ['a', 'u', 'o'] }
};

export function generateName(prng: PRNG, traits: Record<string, number>, existing: Set<string>): string {
  const order = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const primary = order[0]?.[0] as keyof typeof syllables || 'trade';
  const syllableSet = syllables[primary] ?? syllables.trade;
  let name = '';
  const count = prng.nextInt(2, 4);
  for (let i = 0; i < count; i += 1) {
    const c = syllableSet.c[prng.nextInt(0, syllableSet.c.length - 1)];
    const v = syllableSet.v[prng.nextInt(0, syllableSet.v.length - 1)];
    name += c + v;
  }
  name = name.charAt(0).toUpperCase() + name.slice(1);
  if (existing.has(name)) {
    let suffix = 2;
    while (existing.has(`${name}-${suffix}`)) suffix += 1;
    name = `${name}-${suffix}`;
  }
  existing.add(name);
  return name;
}

export function formatPolityName(base: string, type: string): string {
  switch (type) {
    case 'republic':
      return `Republic of ${base}`;
    case 'empire':
      return `${base} Empire`;
    case 'federation':
      return `${base} Federation`;
    case 'city-state':
      return `${base} City-State`;
    case 'tribal':
      return `${base} Confederacy`;
    default:
      return `Kingdom of ${base}`;
  }
}
