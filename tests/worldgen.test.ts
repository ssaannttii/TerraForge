import { describe, expect, it } from 'vitest';
import { PRNG } from '../src/core/prng.js';
import { generateElevation } from '../src/worldgen/elevation.js';
import { applyTectonics } from '../src/worldgen/tectonics.js';
import { assignOcean } from '../src/worldgen/ocean.js';
import { computeClimate } from '../src/worldgen/climate.js';
import { generateRivers } from '../src/worldgen/hydrology.js';
import { assignResources } from '../src/worldgen/resources.js';
import { generateCityName, generateCultureName, generateContinentName, generateName } from '../src/worldgen/naming.js';

const WIDTH = 30;
const HEIGHT = 15;
const prng = new PRNG(999);

describe('worldgen pipeline', () => {
  it('generateElevation returns correct size with values in range', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('elev'));
    expect(elev.length).toBe(WIDTH * HEIGHT);
    for (const val of elev) {
      expect(typeof val).toBe('number');
      expect(Number.isFinite(val)).toBe(true);
    }
  });

  it('applyTectonics modifies elevation in-place', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('t-elev'));
    const before = [...elev];
    applyTectonics(WIDTH, HEIGHT, elev, prng.fork('t-tect'));
    let changed = false;
    for (let i = 0; i < elev.length; i++) {
      if (elev[i] !== before[i]) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });

  it('assignOcean respects coverage ratio', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('o-elev'));
    const { isOcean } = assignOcean(elev, 0.65);
    const oceanCount = isOcean.filter(Boolean).length;
    const ratio = oceanCount / isOcean.length;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(0.8);
  });

  it('computeClimate assigns biomes to every cell', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('c-elev'));
    const { isOcean } = assignOcean(elev, 0.65);
    const climate = computeClimate(WIDTH, HEIGHT, elev, isOcean);
    expect(climate.length).toBe(WIDTH * HEIGHT);
    for (const cell of climate) {
      expect(typeof cell.biomeId).toBe('string');
      expect(cell.biomeId.length).toBeGreaterThan(0);
    }
  });

  it('generateRivers produces river IDs on land only', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('r-elev'));
    const { isOcean } = assignOcean(elev, 0.65);
    const rivers = generateRivers(WIDTH, HEIGHT, elev, isOcean, prng.fork('r-riv'));
    expect(rivers.length).toBe(WIDTH * HEIGHT);
    for (let i = 0; i < rivers.length; i++) {
      if (rivers[i] > 0) {
        expect(isOcean[i]).toBe(false);
      }
    }
  });

  it('assignResources tags land cells only', () => {
    const elev = generateElevation(WIDTH, HEIGHT, prng.fork('res-elev'));
    const { isOcean } = assignOcean(elev, 0.65);
    const rivers = generateRivers(WIDTH, HEIGHT, elev, isOcean, prng.fork('res-riv'));
    const resources = assignResources(elev, isOcean, rivers, prng.fork('res'));
    expect(resources.length).toBe(WIDTH * HEIGHT);
    for (let i = 0; i < resources.length; i++) {
      if (isOcean[i]) {
        expect(resources[i]).toEqual([]);
      }
    }
  });
});

describe('naming', () => {
  it('generateName produces unique names', () => {
    const nameRng = new PRNG(42);
    const registry = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < 20; i++) {
      names.push(generateName(nameRng, { trade: 0.5, martial: 0.3 }, registry));
    }
    expect(new Set(names).size).toBe(20);
  });

  it('generateCityName produces names with city suffixes', () => {
    const nameRng = new PRNG(55);
    const registry = new Set<string>();
    const name = generateCityName(nameRng, { agrarian: 0.5 }, registry);
    expect(name.length).toBeGreaterThan(3);
    expect(name[0]).toBe(name[0].toUpperCase());
  });

  it('generateCultureName produces unique culture names', () => {
    const nameRng = new PRNG(88);
    const registry = new Set<string>();
    const names = Array.from({ length: 10 }, () =>
      generateCultureName(nameRng, { seafaring: 0.6 }, registry)
    );
    expect(new Set(names).size).toBe(10);
  });

  it('generateContinentName produces unique continent names', () => {
    const nameRng = new PRNG(33);
    const registry = new Set<string>();
    const names = Array.from({ length: 5 }, () =>
      generateContinentName(nameRng, registry)
    );
    expect(new Set(names).size).toBe(5);
  });
});
