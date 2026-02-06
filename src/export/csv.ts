import { writeFile } from 'node:fs/promises';
import { WorldBundle } from '../core/types.js';

export async function exportCsv(bundle: WorldBundle, outDir: string): Promise<void> {
  const polityLines: string[] = ['year,polityId,powerScore,population,gdp,techLevel,stability'];
  for (const snapshot of bundle.timelineIndex.snapshots) {
    for (const polity of snapshot.polityStates) {
      polityLines.push([
        snapshot.year,
        polity.id,
        polity.stats.powerScore.toFixed(2),
        polity.stats.population.toFixed(0),
        polity.stats.gdp.toFixed(0),
        polity.stats.techLevel.toFixed(3),
        polity.stats.stability.toFixed(3)
      ].join(','));
    }
  }
  await writeFile(`${outDir}/polities_by_year.csv`, polityLines.join('\n'), 'utf-8');

  const eventLines: string[] = ['year,type,actors,title'];
  for (const event of bundle.events) {
    eventLines.push([
      event.year,
      event.type,
      event.actors.primary.join('|'),
      `"${event.title.replace(/"/g, '""')}"`
    ].join(','));
  }
  await writeFile(`${outDir}/events.csv`, eventLines.join('\n'), 'utf-8');

  const warLines: string[] = ['id,startYear,endYear,outcome,sideA,sideB'];
  for (const war of bundle.wars) {
    warLines.push([
      war.id,
      war.startYear,
      war.endYear ?? '',
      war.outcome,
      war.sides.A.join('|'),
      war.sides.B.join('|')
    ].join(','));
  }
  await writeFile(`${outDir}/wars.csv`, warLines.join('\n'), 'utf-8');
}
