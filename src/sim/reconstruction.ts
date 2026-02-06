import { Delta, PolityState, TerritorialChange } from '../core/types.js';
import { compressRanges, expandRanges, mergeRanges } from '../core/utils/compress.js';

export function reconstructPolities(
  snapshotStates: PolityState[],
  deltas: Delta[],
  territorialChanges: TerritorialChange[],
  targetYear: number
): { polities: PolityState[]; ownerByCell?: Map<number, string> } {
  const states = snapshotStates.map((state) => ({
    ...state,
    stats: { ...state.stats },
    territory: { cellIdsCompressed: state.territory.cellIdsCompressed.map((r) => ({ ...r })) }
  }));
  const changeById = new Map(territorialChanges.map((change) => [change.id, change]));
  for (const delta of deltas) {
    if (delta.year > targetYear) break;
    for (const update of delta.polityUpdates) {
      const polity = states.find((p) => p.id === update.polityId);
      if (!polity) continue;
      for (const [key, value] of Object.entries(update.statsDelta)) {
        const statKey = key as keyof typeof polity.stats;
        const current = polity.stats[statKey];
        if (typeof current === 'number') {
          polity.stats[statKey] = current + Number(value);
        }
      }
    }
    for (const changeId of delta.territorialChangeIds) {
      const change = changeById.get(changeId);
      if (!change) continue;
      const winner = states.find((p) => p.id === change.winnerPolityId);
      const loser = states.find((p) => p.id === change.loserPolityId);
      if (winner) {
        const ids = expandRanges(change.regionsTransferredCompressed);
        const current = expandRanges(winner.territory.cellIdsCompressed);
        winner.territory.cellIdsCompressed = mergeRanges(compressRanges(current.concat(ids)));
      }
      if (loser) {
        const transfer = new Set(expandRanges(change.regionsTransferredCompressed));
        const remaining = expandRanges(loser.territory.cellIdsCompressed).filter((id) => !transfer.has(id));
        loser.territory.cellIdsCompressed = mergeRanges(compressRanges(remaining));
      }
    }
  }
  return { polities: states };
}
