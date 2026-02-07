import { ELEVATION_TEMP_WEIGHT, BASE_HUMIDITY, LATITUDE_HUMIDITY_DIVISOR, OCEAN_HUMIDITY_BONUS } from '../core/constants.js';

export type ClimateCell = { biomeId: string; temperature: number; humidity: number };

export function computeClimate(width: number, height: number, elevation: number[], isOcean: boolean[]): ClimateCell[] {
  const climate: ClimateCell[] = [];
  const maxElevation = Math.max(...elevation);
  const minElevation = Math.min(...elevation);
  for (let y = 0; y < height; y += 1) {
    const lat = (y / (height - 1)) * 180 - 90;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const elevNorm = (elevation[idx] - minElevation) / (maxElevation - minElevation + 1e-6);
      const temperature = 1 - Math.abs(lat) / 90 - elevNorm * ELEVATION_TEMP_WEIGHT;
      let humidity = BASE_HUMIDITY - Math.abs(lat) / LATITUDE_HUMIDITY_DIVISOR;
      if (isOcean[idx]) humidity += OCEAN_HUMIDITY_BONUS;
      const biomeId = pickBiome(temperature, humidity, isOcean[idx]);
      climate.push({ biomeId, temperature, humidity });
    }
  }
  return climate;
}

function pickBiome(temp: number, humidity: number, isOcean: boolean): string {
  if (isOcean) return 'ocean';
  if (temp < 0.2) return humidity < 0.35 ? 'tundra' : 'taiga';
  if (temp < 0.4) return humidity < 0.3 ? 'steppe' : 'temperate';
  if (temp < 0.7) return humidity < 0.3 ? 'desert' : humidity < 0.6 ? 'mediterranean' : 'temperate';
  return humidity < 0.35 ? 'desert' : humidity < 0.6 ? 'savanna' : 'tropical';
}
