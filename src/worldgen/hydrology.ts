import { PRNG } from '../core/prng.js';

export function generateRivers(width: number, height: number, elevation: number[], isOcean: boolean[], prng: PRNG): number[] {
  const riverIds = new Array<number>(width * height).fill(-1);
  const candidates = elevation
    .map((e, idx) => ({ e, idx }))
    .filter((cell) => !isOcean[cell.idx] && cell.e > 0.3)
    .sort((a, b) => b.e - a.e);
  const riverCount = Math.max(10, Math.floor((width * height) / 1500));
  for (let r = 0; r < riverCount; r += 1) {
    const seed = candidates[prng.nextInt(0, Math.max(0, candidates.length - 1))];
    if (!seed) continue;
    let current = seed.idx;
    const riverId = r + 1;
    for (let steps = 0; steps < 200; steps += 1) {
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
