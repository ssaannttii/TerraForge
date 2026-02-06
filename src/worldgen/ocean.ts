export function assignOcean(elevation: number[], oceanCoverage: number): { isOcean: boolean[]; threshold: number } {
  const sorted = [...elevation].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * oceanCoverage);
  const threshold = sorted[index];
  const isOcean = elevation.map((e) => e <= threshold);
  return { isOcean, threshold };
}
