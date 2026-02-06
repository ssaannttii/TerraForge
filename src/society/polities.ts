import { PRNG } from '../core/prng.js';
import { City, PolityState, PolityType } from '../core/types.js';
import { compressRanges } from '../core/utils/compress.js';
import { formatPolityName, generateName } from '../worldgen/naming.js';

const polityTypes: PolityType[] = ['kingdom', 'republic', 'empire', 'city-state', 'tribal', 'federation'];

export function generatePolities(
  prng: PRNG,
  cities: City[],
  mapWidth: number,
  mapHeight: number,
  isOcean: boolean[],
  resources: string[][]
): { polities: PolityState[]; ownerByCell: string[] } {
  const numPolities = cities.length;
  const ownerByCell = new Array<string>(mapWidth * mapHeight).fill('');
  const cityById = new Map(cities.map((city) => [city.id, city]));
  const cultureIdByCity = new Map(cities.map((city) => [city.id, city.cultureGroupId]));
  const citySeeds = cities.map((city) => ({
    id: city.id,
    x: city.cellId % mapWidth,
    y: Math.floor(city.cellId / mapWidth)
  }));

  for (let idx = 0; idx < ownerByCell.length; idx += 1) {
    if (isOcean[idx]) continue;
    const x = idx % mapWidth;
    const y = Math.floor(idx / mapWidth);
    let bestCity = citySeeds[0];
    let bestScore = Infinity;
    for (const seed of citySeeds) {
      const dx = x - seed.x;
      const dy = y - seed.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const roughness = resources[idx].includes('minerals') ? 1.1 : 1.0;
      const score = dist * roughness;
      if (score < bestScore) {
        bestScore = score;
        bestCity = seed;
      }
    }
    ownerByCell[idx] = bestCity.id;
  }

  const territories = new Map<string, number[]>();
  ownerByCell.forEach((owner, idx) => {
    if (!owner) return;
    if (!territories.has(owner)) territories.set(owner, []);
    territories.get(owner)?.push(idx);
  });

  const nameRegistry = new Set<string>();
  const polities: PolityState[] = [];
  cities.forEach((city, index) => {
    const baseName = generateName(prng, { trade: 0.5, agrarian: 0.5 }, nameRegistry);
    const type = polityTypes[index % polityTypes.length];
    const name = formatPolityName(baseName, type);
    const territoryIds = territories.get(city.id) ?? [];
    const population = territoryIds.length * prng.nextInt(200, 700);
    const gdp = population * prng.nextInt(2, 6);
    const techLevel = prng.nextFloat01() * 0.6 + 0.2;
    const stats = {
      population,
      gdp,
      techLevel,
      industrialCapacity: techLevel * 0.8,
      resourceSecurity: Math.min(1, resources[city.cellId].length / 3 + 0.3),
      military: Math.min(1, 0.3 + techLevel * 0.5),
      navalProjection: city.coastal ? 0.4 + techLevel * 0.4 : 0.1,
      stability: 0.55 + prng.nextFloat01() * 0.2,
      legitimacy: 0.5 + prng.nextFloat01() * 0.3,
      logistics: 0.4 + techLevel * 0.5,
      powerScore: 0
    };
    stats.powerScore = computePowerScore(stats);
    polities.push({
      id: `polity-${index + 1}`,
      name,
      type,
      capitalCityId: city.id,
      cultureGroupIds: [cultureIdByCity.get(city.id) ?? 'cult-1'],
      stats,
      territory: { cellIdsCompressed: compressRanges(territoryIds) }
    });
  });

  return { polities, ownerByCell: mapOwnersToPolities(ownerByCell, cities, polities) };
}

function computePowerScore(stats: {
  population: number;
  gdp: number;
  techLevel: number;
  industrialCapacity: number;
  resourceSecurity: number;
  military: number;
  navalProjection: number;
  stability: number;
  legitimacy: number;
  logistics: number;
}): number {
  const base = Math.log10(stats.population + 1) * 10 + Math.log10(stats.gdp + 1) * 8;
  const modifiers =
    stats.techLevel * 15 +
    stats.industrialCapacity * 10 +
    stats.resourceSecurity * 8 +
    stats.military * 12 +
    stats.navalProjection * 4 +
    stats.stability * 6 +
    stats.legitimacy * 4 +
    stats.logistics * 6;
  return Math.min(100, base + modifiers);
}

function mapOwnersToPolities(ownerByCell: string[], cities: City[], polities: PolityState[]): string[] {
  const cityToPolity = new Map<string, string>();
  cities.forEach((city, index) => {
    cityToPolity.set(city.id, polities[index].id);
  });
  return ownerByCell.map((owner) => (owner ? cityToPolity.get(owner) ?? '' : ''));
}
