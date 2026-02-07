/**
 * Centralized constants for TerraForge world generation and simulation.
 * Extracted from scattered magic numbers to make tuning easy and code readable.
 */

// ── Elevation generation ──────────────────────────────────────────
export const ELEVATION_OCTAVES = 4;

// ── Tectonic plates ───────────────────────────────────────────────
export const PLATES_MIN = 4;
export const PLATES_MAX = 8;
export const RIDGE_FREQUENCY = 0.05;
export const RIDGE_AMPLITUDE = 0.35;

// ── Climate ───────────────────────────────────────────────────────
export const ELEVATION_TEMP_WEIGHT = 0.4;
export const BASE_HUMIDITY = 0.6;
export const LATITUDE_HUMIDITY_DIVISOR = 120;
export const OCEAN_HUMIDITY_BONUS = 0.2;

// ── Hydrology ─────────────────────────────────────────────────────
export const RIVER_MIN_ELEVATION = 0.3;
export const RIVER_DENSITY_DIVISOR = 1500;
export const RIVER_MIN_COUNT = 10;
export const RIVER_MAX_STEPS = 200;

// ── Resources ─────────────────────────────────────────────────────
export const MINERAL_ELEVATION_THRESHOLD = 0.5;
export const FERTILE_ELEVATION_THRESHOLD = 0.2;
export const ENERGY_CHANCE = 0.08;   // 1 - 0.92
export const TIMBER_CHANCE = 0.10;   // 1 - 0.90

// ── Cities ────────────────────────────────────────────────────────
export const CITY_POP_MIN = 5_000;
export const CITY_POP_MAX = 120_000;

// ── Simulation growth rates (per year) ────────────────────────────
export const POP_GROWTH_BASE = 0.01;
export const POP_GROWTH_VARIANCE = 0.01;
export const GDP_GROWTH_BASE = 0.015;
export const GDP_GROWTH_VARIANCE = 0.02;
export const TECH_GROWTH_BASE = 0.001;
export const TECH_GROWTH_VARIANCE = 0.0015;
export const STABILITY_SHIFT_RANGE = 0.01;

// ── War triggers ──────────────────────────────────────────────────
export const WAR_INTERVAL_YEARS = 7;
export const WAR_END_CHANCE = 0.3;        // 1 - 0.7
export const WAR_MIN_DURATION_YEARS = 3;
export const BATTLES_PER_YEAR_MIN = 1;
export const BATTLES_PER_YEAR_MAX = 3;
export const CASUALTY_MIN = 200;
export const CASUALTY_MAX = 2_000;
export const SIEGE_CHANCE = 0.2;          // 1 - 0.8

// ── Polity stats ──────────────────────────────────────────────────
export const POP_DENSITY_MIN = 200;
export const POP_DENSITY_MAX = 700;
export const GDP_PER_CAPITA_MIN = 2;
export const GDP_PER_CAPITA_MAX = 6;
export const TECH_LEVEL_MIN = 0.2;
export const TECH_LEVEL_RANGE = 0.6;
export const STAT_FLOOR = 0.1;
export const POWER_SCORE_CAP = 100;
