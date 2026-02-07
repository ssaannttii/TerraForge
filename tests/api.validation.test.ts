import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';

const config = {
  seed: 101,
  planet: {
    radiusKm: 6371,
    oceanCoverage: 0.66,
    numContinents: 3,
    mapWidth: 40,
    mapHeight: 20,
    tectonicsMode: 'lite',
    climateModel: 'koppen-lite'
  },
  societies: {
    numCultureGroups: 20,
    numCitiesTarget: 20,
    numPolitiesTarget: 50,
    startingYear: 0,
    endingYear: 100,
    techPace: 'medium',
    migrationIntensity: 0.3
  },
  geopolitics: {
    aggression: 0.45,
    diplomacyBias: 0.55,
    coalitionTendency: 0.5,
    imperialOverreachPenalty: 0.5,
    resourceNeedWeight: 0.45,
    culturalAffinityWeight: 0.5,
    warCostModel: 'logistics-terrain',
    annexationRules: {
      allowVassalization: true,
      allowFullAbsorb: true,
      maxAnnexationPerDecadePct: 0.15
    }
  },
  output: {
    detail: 'standard',
    snapshotsEveryYears: 10,
    exportFormats: ['json']
  }
};

describe('api validation', () => {
  const app = buildServer();
  let worldId = '';

  beforeAll(async () => {
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      payload: config
    });
    const body = JSON.parse(response.payload) as { worldId: string };
    worldId = body.worldId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for invalid generate config', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      payload: { seed: 'not-a-number' }
    });
    const body = JSON.parse(response.payload) as { error: string; details?: unknown[] };
    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('invalid config');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('rejects invalid year for polities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/world/${worldId}/polities?year=notANumber`
    });
    const body = JSON.parse(response.payload) as { error: string };
    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('invalid year');
  });

  it('rejects invalid from for timeline', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/world/${worldId}/timeline?from=NaN`
    });
    const body = JSON.parse(response.payload) as { error: string };
    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('invalid from');
  });

  it('falls back to earliest snapshot when year is too early', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/world/${worldId}/map?year=-1000`
    });
    const body = JSON.parse(response.payload) as unknown;
    expect(response.statusCode).toBe(200);
    expect(body).toBeTruthy();
  });
});
