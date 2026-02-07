import { PRNG } from './prng.js';
import { hashObject } from './hashing.js';
import { TerraForgeConfig } from './schema.js';
import { Cell, Continent, WorldBundle, WorldMeta } from './types.js';
import { cellLatLon } from './utils/grid.js';
import { generateElevation } from '../worldgen/elevation.js';
import { applyTectonics } from '../worldgen/tectonics.js';
import { assignOcean } from '../worldgen/ocean.js';
import { computeClimate } from '../worldgen/climate.js';
import { generateRivers } from '../worldgen/hydrology.js';
import { assignResources } from '../worldgen/resources.js';
import { generateCultureGroups } from '../society/cultures.js';
import { generateCities } from '../society/cities.js';
import { generatePolities } from '../society/polities.js';
import { simulateTimeline } from '../sim/sim.js';
import { generateContinentName } from '../worldgen/naming.js';

export function generateWorld(config: TerraForgeConfig): WorldBundle {
  const prng = new PRNG(config.seed);
  const { mapWidth, mapHeight } = config.planet;
  const elevation = generateElevation(mapWidth, mapHeight, prng.fork('elevation'));
  if (config.planet.tectonicsMode === 'lite') {
    applyTectonics(mapWidth, mapHeight, elevation, prng.fork('tectonics'));
  }
  const { isOcean } = assignOcean(elevation, config.planet.oceanCoverage);
  const climate = computeClimate(mapWidth, mapHeight, elevation, isOcean);
  const riverIds = generateRivers(mapWidth, mapHeight, elevation, isOcean, prng.fork('rivers'));
  const resources = assignResources(elevation, isOcean, riverIds, prng.fork('resources'));

  const cells: Cell[] = [];
  const habitableCells: number[] = [];
  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const idx = y * mapWidth + x;
      const { lat, lon } = cellLatLon(x, y, mapWidth, mapHeight);
      const cell: Cell = {
        id: idx,
        x,
        y,
        lat,
        lon,
        elevation: elevation[idx],
        isOcean: isOcean[idx],
        riverId: riverIds[idx] > 0 ? riverIds[idx] : undefined,
        biomeId: climate[idx].biomeId,
        resourceTags: resources[idx]
      };
      cells.push(cell);
      if (!cell.isOcean && cell.biomeId !== 'desert' && cell.biomeId !== 'tundra') {
        habitableCells.push(idx);
      }
    }
  }

  const continents = generateContinents(config.planet.numContinents, habitableCells, prng.fork('continents'));
  const cultureGroups = generateCultureGroups(prng.fork('cultures'), habitableCells, config.societies.numCultureGroups);
  const cityCandidates = habitableCells.filter((id) => riverIds[id] > 0 || resources[id].includes('fertile'));
  const cities = generateCities(prng.fork('cities'), cityCandidates, config.societies.numCitiesTarget, cultureGroups);
  const polityCities = cities.slice(0, Math.min(config.societies.numPolitiesTarget, cities.length));
  const { polities, ownerByCell } = generatePolities(prng.fork('polities'), polityCities, mapWidth, mapHeight, isOcean, resources);
  const sim = simulateTimeline(prng.fork('sim'), polities, ownerByCell, config.societies.startingYear, config.societies.endingYear, config.output.snapshotsEveryYears);

  const meta: WorldMeta = {
    seed: config.seed,
    configHash: hashObject(config),
    createdAtIso: new Date(0).toISOString(),
    startYear: config.societies.startingYear,
    endYear: config.societies.endingYear,
    tick: 'year',
    version: '0.1.0',
    summary: buildSummary(sim)
  };

  return {
    meta,
    planet: {
      radiusKm: config.planet.radiusKm,
      oceanCoverage: config.planet.oceanCoverage,
      mapWidth,
      mapHeight
    },
    cells,
    continents,
    cultureGroups,
    cities,
    politiesInitial: sim.politiesInitial,
    timelineIndex: sim.timelineIndex,
    events: sim.events,
    wars: sim.wars,
    treaties: sim.treaties,
    territorialChanges: sim.territorialChanges
  };
}

function generateContinents(count: number, habitableCells: number[], prng: PRNG): Continent[] {
  const continents: Continent[] = [];
  const nameRegistry = new Set<string>();
  const chunk = Math.floor(habitableCells.length / count);
  for (let i = 0; i < count; i += 1) {
    const start = i * chunk;
    const end = i === count - 1 ? habitableCells.length : (i + 1) * chunk;
    const cells = habitableCells.slice(start, end);
    continents.push({
      id: `cont-${i + 1}`,
      name: generateContinentName(prng, nameRegistry),
      cellIds: prng.shuffle(cells).slice(0, Math.min(cells.length, 1200))
    });
  }
  return continents;
}

function buildSummary(sim: ReturnType<typeof simulateTimeline>): WorldMeta['summary'] {
  const topPowersByDecade: WorldMeta['summary']['topPowersByDecade'] = [];
  for (const snapshot of sim.timelineIndex.snapshots) {
    const top = [...snapshot.polityStates]
      .sort((a, b) => b.stats.powerScore - a.stats.powerScore)
      .slice(0, 10)
      .map((p) => ({ id: p.id, powerScore: p.stats.powerScore }));
    topPowersByDecade.push({ decade: Math.floor(snapshot.year / 10) * 10, top });
  }
  const totals = {
    wars: sim.wars.length,
    battles: sim.wars.reduce((acc, war) => acc + war.battles.length, 0),
    annexations: sim.territorialChanges.filter((c) => c.type === 'ANNEXATION_PARTIAL' || c.type === 'ABSORBED_FULL').length,
    secessions: sim.territorialChanges.filter((c) => c.type === 'SECESSION').length
  };
  const eras = [
    { name: 'Expansion', start: sim.timelineIndex.snapshots[0].year, end: sim.timelineIndex.snapshots.at(-1)?.year ?? 0, reason: 'Rising power scores and frequent wars.' }
  ];
  return { topPowersByDecade, totals, eras };
}
