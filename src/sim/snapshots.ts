import { Range, Snapshot } from '../core/types.js';
import { compressRanges, mergeRanges } from '../core/utils/compress.js';

export function buildOwnerRLE(ownerByCell: string[]): { owner: string; ranges: Range[] }[] {
  const owners = new Map<string, number[]>();
  ownerByCell.forEach((owner, idx) => {
    if (!owner) return;
    if (!owners.has(owner)) owners.set(owner, []);
    owners.get(owner)?.push(idx);
  });
  const result: { owner: string; ranges: Range[] }[] = [];
  for (const [owner, ids] of owners) {
    result.push({ owner, ranges: mergeRanges(compressRanges(ids)) });
  }
  return result;
}

export function snapshotFromState(
  year: number,
  polityStates: Snapshot['polityStates'],
  ownerByCell: string[],
  alliances: string[][]
): Snapshot {
  return {
    year,
    polityStates: polityStates.map((p) => ({ ...p, stats: { ...p.stats }, territory: { cellIdsCompressed: p.territory.cellIdsCompressed } })),
    politicalOwnersRLE: buildOwnerRLE(ownerByCell),
    alliances: alliances.map((a) => [...a])
  };
}
