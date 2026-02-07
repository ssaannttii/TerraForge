import { PRNG } from '../core/prng.js';
import { RIVER_MIN_ELEVATION, RIVER_DENSITY_DIVISOR, RIVER_MIN_COUNT, RIVER_MAX_STEPS } from '../core/constants.js';

export function generateRivers(width: number, height: number, elevation: number[], isOcean: boolean[], prng: PRNG): number[] {
  const riverIds = new Array<number>(width * height).fill(-1);
  const candidates = elevation
    .map((e, idx) => ({ e, idx }))
    .filter((cell) => !isOcean[cell.idx] && cell.e > RIVER_MIN_ELEVATION)
    .sort((a, b) => b.e - a.e);
  const riverCount = Math.max(RIVER_MIN_COUNT, Math.floor((width * height) / RIVER_DENSITY_DIVISOR));
  for (let r = 0; r < riverCount; r += 1) {
    const seed = candidates[prng.nextInt(0, Math.max(0, candidates.length - 1))];
    if (!seed) continue;
    let current = seed.idx;
    const riverId = r + 1;
    for (let steps = 0; steps < RIVER_MAX_STEPS; steps += 1) {
      if (isOcean[current]) break;
      riverIds[current] = riverId;
      const x = current % width;
      const y = Math.floor(current / width);
      let next = current;
      let nextElev = elevation[current];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (elevation[nIdx] < nextElev) {
          nextElev = elevation[nIdx];
          next = nIdx;
        }
      }
      if (next === current) break;
      current = next;
    }
  }
  return riverIds;
}
