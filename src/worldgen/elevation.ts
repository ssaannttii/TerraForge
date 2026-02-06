import { PRNG } from '../core/prng.js';

export function generateElevation(width: number, height: number, prng: PRNG): number[] {
  const values = new Array<number>(width * height).fill(0);
  const octaves = 4;
  for (let o = 0; o < octaves; o += 1) {
    const frequency = 2 ** o;
    const amplitude = 1 / (o + 1);
    const gridW = Math.ceil(width / frequency) + 1;
    const gridH = Math.ceil(height / frequency) + 1;
    const grid: number[] = [];
    for (let y = 0; y < gridH; y += 1) {
      for (let x = 0; x < gridW; x += 1) {
        grid.push(prng.nextFloat01() * 2 - 1);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const gx = x / frequency;
        const gy = y / frequency;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const sx = gx - x0;
        const sy = gy - y0;
        const idx = (yy: number, xx: number) => yy * gridW + xx;
        const v00 = grid[idx(y0, x0)];
        const v10 = grid[idx(y0, x1)];
        const v01 = grid[idx(y1, x0)];
        const v11 = grid[idx(y1, x1)];
        const ix0 = v00 * (1 - sx) + v10 * sx;
        const ix1 = v01 * (1 - sx) + v11 * sx;
        const value = ix0 * (1 - sy) + ix1 * sy;
        values[y * width + x] += value * amplitude;
      }
    }
  }
  return values;
}
