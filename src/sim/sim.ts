import { PRNG } from '../core/prng.js';
import { Delta, PolityState, TimelineEvent, Treaty, TerritorialChange, War } from '../core/types.js';
import { compressRanges } from '../core/utils/compress.js';
import { snapshotFromState } from './snapshots.js';

export type SimulationOutput = {
  politiesInitial: PolityState[];
  timelineIndex: { snapshots: ReturnType<typeof snapshotFromState>[]; deltasBetweenSnapshots: Delta[] };
  events: TimelineEvent[];
  wars: War[];
  treaties: Treaty[];
  territorialChanges: TerritorialChange[];
};

export function simulateTimeline(
  prng: PRNG,
  polities: PolityState[],
  ownerByCell: string[],
  startYear: number,
  endYear: number,
  snapshotsEveryYears: number
): SimulationOutput {
  const events: TimelineEvent[] = [];
  const wars: War[] = [];
  const treaties: Treaty[] = [];
  const territorialChanges: TerritorialChange[] = [];
  const deltas: Delta[] = [];
  const snapshots = [snapshotFromState(startYear, polities, ownerByCell, [])];

  const activeWars = new Map<string, War>();
  let warCounter = 1;
  let treatyCounter = 1;
  let changeCounter = 1;
  let eventCounter = 1;

  for (let year = startYear; year <= endYear; year += 1) {
    const yearlyUpdates: Delta['polityUpdates'] = [];
    const yearlyChanges: string[] = [];
    const yearlyEvents: string[] = [];

    for (const polity of polities) {
      const before = { ...polity.stats };
      const growth = 0.01 + prng.nextFloat01() * 0.01;
      const gdpGrowth = 0.015 + prng.nextFloat01() * 0.02;
      const techGrowth = 0.001 + prng.nextFloat01() * 0.0015;
      const stabilityShift = (prng.nextFloat01() - 0.5) * 0.01;

      polity.stats.population *= 1 + growth;
      polity.stats.gdp *= 1 + gdpGrowth;
      polity.stats.techLevel = Math.min(1, polity.stats.techLevel + techGrowth);
      polity.stats.stability = clamp(polity.stats.stability + stabilityShift, 0.1, 1);
      polity.stats.legitimacy = clamp(polity.stats.legitimacy + stabilityShift * 0.5, 0.1, 1);
      polity.stats.logistics = clamp(polity.stats.logistics + techGrowth * 2, 0.1, 1);
      polity.stats.military = clamp(polity.stats.military + techGrowth * 1.5, 0.1, 1);
      polity.stats.powerScore = Math.min(100, polity.stats.powerScore + gdpGrowth * 2 + techGrowth * 10);

      yearlyUpdates.push({
        polityId: polity.id,
        statsDelta: {
          population: polity.stats.population - before.population,
          gdp: polity.stats.gdp - before.gdp,
          techLevel: polity.stats.techLevel - before.techLevel,
          stability: polity.stats.stability - before.stability,
          legitimacy: polity.stats.legitimacy - before.legitimacy,
          logistics: polity.stats.logistics - before.logistics,
          military: polity.stats.military - before.military,
          powerScore: polity.stats.powerScore - before.powerScore
        }
      });
    }

    if (year % 7 === 0) {
      const a = polities[prng.nextInt(0, polities.length - 1)];
      const b = polities[prng.nextInt(0, polities.length - 1)];
      if (a.id !== b.id) {
        const warId = `war-${warCounter++}`;
        const war: War = {
          id: warId,
          name: `${a.name} - ${b.name} Conflict`,
          startYear: year,
          sides: { A: [a.id], B: [b.id] },
          battles: [],
          outcome: 'DRAW',
          territorialChanges: [],
          explanation: ['Border tension and resource disputes escalated into open conflict.']
        };
        activeWars.set(warId, war);
        wars.push(war);
        const eventId = `event-${eventCounter++}`;
        events.push({
          id: eventId,
          year,
          type: 'WAR_DECLARED',
          title: `${a.name} declares war on ${b.name}`,
          actors: { primary: [a.id], secondary: [b.id] },
          causes: [
            { key: 'resource_need', weight: 0.4 },
            { key: 'border_rivalry', weight: 0.6 }
          ],
          effects: ['mobilization', `war:${warId}`],
          explanation: ['Resource pressures and historic rivalry pushed both polities into war.'],
          refs: { warId }
        });
        yearlyEvents.push(eventId);
      }
    }

    for (const [warId, war] of activeWars) {
      const battleCount = prng.nextInt(1, 3);
      for (let i = 0; i < battleCount; i += 1) {
        const battleId = `${warId}-battle-${war.battles.length + 1}`;
        const result = prng.nextFloat01() > 0.5 ? 'A_VICTORY' : 'B_VICTORY';
        war.battles.push({
          id: battleId,
          year,
          locationCellId: prng.nextInt(0, ownerByCell.length - 1),
          type: prng.nextFloat01() > 0.2 ? 'FIELD' : 'SIEGE',
          result,
          casualtiesEstimate: { A: prng.nextInt(200, 2000), B: prng.nextInt(200, 2000) },
          factors: ['logistics', 'terrain', 'morale'],
          explanation: ['A clash defined by supply lines and terrain advantages.']
        });
      }

      if (prng.nextFloat01() > 0.7 && year - war.startYear > 3) {
        war.endYear = year;
        war.outcome = prng.nextFloat01() > 0.5 ? 'A_WIN' : 'B_WIN';
        const winner = war.outcome === 'A_WIN' ? war.sides.A[0] : war.sides.B[0];
        const loser = war.outcome === 'A_WIN' ? war.sides.B[0] : war.sides.A[0];
        const changeId = `change-${changeCounter++}`;
        const transferCell = prng.nextInt(0, ownerByCell.length - 1);
        const change: TerritorialChange = {
          id: changeId,
          year,
          type: 'ANNEXATION_PARTIAL',
          winnerPolityId: winner,
          loserPolityId: loser,
          regionsTransferredCompressed: compressRanges([transferCell]),
          reason: 'War settlement redrew border regions.',
          linkedWarId: warId
        };
        ownerByCell[transferCell] = winner;
        updatePolityTerritory(polities, winner, loser, transferCell);
        territorialChanges.push(change);
        war.territorialChanges.push(changeId);
        yearlyChanges.push(changeId);
        const treatyId = `treaty-${treatyCounter++}`;
        treaties.push({
          id: treatyId,
          name: `Treaty of ${year}`,
          year,
          participants: [winner, loser],
          terms: ['Border adjustments', 'War reparations']
        });
        war.treatyId = treatyId;
        const eventId = `event-${eventCounter++}`;
        events.push({
          id: eventId,
          year,
          type: 'WAR_ENDED',
          title: `Treaty ends ${war.name}`,
          actors: { primary: [winner], secondary: [loser] },
          causes: [
            { key: 'war_exhaustion', weight: 0.5 },
            { key: 'logistics_cost', weight: 0.5 }
          ],
          effects: ['treaty_signed', `territory_change:${changeId}`],
          explanation: ['Both sides agreed to a settlement after costly campaigns.'],
          refs: { warId, treatyId, changeId }
        });
        yearlyEvents.push(eventId);
        activeWars.delete(warId);
      }
    }

    if ((year - startYear) % snapshotsEveryYears === 0 && year !== startYear) {
      snapshots.push(snapshotFromState(year, polities, ownerByCell, []));
    }

    deltas.push({
      year,
      polityUpdates: yearlyUpdates,
      territorialChangeIds: yearlyChanges,
      events: yearlyEvents
    });
  }

  return {
    politiesInitial: polities,
    timelineIndex: { snapshots, deltasBetweenSnapshots: deltas },
    events,
    wars,
    treaties,
    territorialChanges
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function updatePolityTerritory(polities: PolityState[], winnerId: string, loserId: string, cellId: number): void {
  const winner = polities.find((p) => p.id === winnerId);
  const loser = polities.find((p) => p.id === loserId);
  if (winner) {
    const ids = winner.territory.cellIdsCompressed.flatMap((range) => {
      const list: number[] = [];
      for (let i = range.start; i <= range.end; i += 1) list.push(i);
      return list;
    });
    ids.push(cellId);
    winner.territory.cellIdsCompressed = compressRanges(ids);
  }
  if (loser) {
    const ids = loser.territory.cellIdsCompressed.flatMap((range) => {
      const list: number[] = [];
      for (let i = range.start; i <= range.end; i += 1) list.push(i);
      return list;
    });
    const filtered = ids.filter((id) => id !== cellId);
    loser.territory.cellIdsCompressed = compressRanges(filtered);
  }
}
