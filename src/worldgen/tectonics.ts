import { PRNG } from '../core/prng.js';

export function applyTectonics(width: number, height: number, elevation: number[], prng: PRNG): void {
  const plates = prng.nextInt(4, 8);
  const centers = Array.from({ length: plates }, () => ({
    x: prng.nextInt(0, width - 1),
    y: prng.nextInt(0, height - 1),
    drift: prng.nextFloat01() * 2 - 1
  }));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let closest = centers[0];
      let minDist = Infinity;
      for (const center of centers) {
        const dx = x - center.x;
        const dy = y - center.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          closest = center;
        }
      }
      const idx = y * width + x;
      const ridge = Math.cos((x + y) * 0.05 + closest.drift);
      elevation[idx] += ridge * 0.35;
    }
  }
}
