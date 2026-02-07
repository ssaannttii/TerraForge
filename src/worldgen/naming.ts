import { PRNG } from '../core/prng.js';

const syllables = {
  martial: { c: ['kr', 'dr', 'gr', 'th', 'br'], v: ['a', 'o', 'u'] },
  trade: { c: ['l', 'm', 'n', 's', 'v'], v: ['a', 'e', 'i', 'o'] },
  seafaring: { c: ['s', 'h', 'r', 't'], v: ['a', 'e', 'o', 'u'] },
  agrarian: { c: ['b', 'd', 'g', 'k', 'p'], v: ['a', 'e', 'i'] },
  nomadic: { c: ['q', 'z', 'x', 'y', 'n'], v: ['a', 'u', 'o'] }
};

const citySuffixes = ['burg', 'ford', 'haven', 'port', 'stead', 'ton', 'vale', 'wick', 'dale', 'gate'];
const continentSuffixes = ['ia', 'ica', 'ara', 'onia', 'rea', 'ica', 'anda', 'eria'];

function baseName(prng: PRNG, syllableKey: keyof typeof syllables, minSyl: number, maxSyl: number): string {
  const set = syllables[syllableKey] ?? syllables.trade;
  let name = '';
  const count = prng.nextInt(minSyl, maxSyl);
  for (let i = 0; i < count; i += 1) {
    const c = set.c[prng.nextInt(0, set.c.length - 1)];
    const v = set.v[prng.nextInt(0, set.v.length - 1)];
    name += c + v;
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function dedup(name: string, existing: Set<string>): string {
  if (!existing.has(name)) {
    existing.add(name);
    return name;
  }
  let suffix = 2;
  while (existing.has(`${name} ${suffix}`)) suffix += 1;
  const unique = `${name} ${suffix}`;
  existing.add(unique);
  return unique;
}

export function generateName(prng: PRNG, traits: Record<string, number>, existing: Set<string>): string {
  const order = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const primary = order[0]?.[0] as keyof typeof syllables || 'trade';
  const name = baseName(prng, primary, 2, 4);
  return dedup(name, existing);
}

export function generateCityName(prng: PRNG, traits: Record<string, number>, existing: Set<string>): string {
  const order = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const primary = order[0]?.[0] as keyof typeof syllables || 'trade';
  const root = baseName(prng, primary, 1, 3);
  const suffix = citySuffixes[prng.nextInt(0, citySuffixes.length - 1)];
  const name = root + suffix;
  return dedup(name, existing);
}

export function generateCultureName(prng: PRNG, traits: Record<string, number>, existing: Set<string>): string {
  const order = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const primary = order[0]?.[0] as keyof typeof syllables || 'trade';
  const name = baseName(prng, primary, 2, 3);
  return dedup(name, existing);
}

export function generateContinentName(prng: PRNG, existing: Set<string>): string {
  const key = (['trade', 'agrarian', 'seafaring'] as const)[prng.nextInt(0, 2)];
  const root = baseName(prng, key, 2, 3);
  const suffix = continentSuffixes[prng.nextInt(0, continentSuffixes.length - 1)];
  const name = root + suffix;
  return dedup(name, existing);
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
