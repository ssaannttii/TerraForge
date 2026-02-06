import { writeFile } from 'node:fs/promises';
import { WorldBundle } from '../core/types.js';
import { expandRanges } from '../core/utils/compress.js';

export async function exportGeoJson(bundle: WorldBundle, outPath: string, year?: number): Promise<void> {
  const snapshot = pickSnapshot(bundle, year ?? bundle.meta.startYear);
  const ownerMap = new Map<number, string>();
  for (const entry of snapshot.politicalOwnersRLE) {
    for (const id of expandRanges(entry.ranges)) {
      ownerMap.set(id, entry.owner);
    }
  }
  const features = bundle.cells.map((cell) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [cell.lon, cell.lat]
    },
    properties: {
      id: cell.id,
      elevation: cell.elevation,
      biome: cell.biomeId,
      owner: ownerMap.get(cell.id) ?? null
    }
  }));
  const geojson = {
    type: 'FeatureCollection',
    features
  };
  await writeFile(outPath, JSON.stringify(geojson), 'utf-8');
}

function pickSnapshot(bundle: WorldBundle, year: number) {
  const snapshots = [...bundle.timelineIndex.snapshots].sort((a, b) => a.year - b.year);
  let selected = snapshots[0];
  for (const snapshot of snapshots) {
    if (snapshot.year <= year) selected = snapshot;
  }
  return selected;
}
