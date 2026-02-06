import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import { ConfigSchema } from '../src/core/schema.js';

const config = ConfigSchema.parse({
  seed: 123,
  planet: { mapWidth: 40, mapHeight: 20, numContinents: 3, oceanCoverage: 0.65, radiusKm: 6371, tectonicsMode: 'lite', climateModel: 'koppen-lite' },
  societies: { numCultureGroups: 20, numCitiesTarget: 20, numPolitiesTarget: 50, startingYear: 0, endingYear: 80, techPace: 'medium', migrationIntensity: 0.3 },
  geopolitics: {
    aggression: 0.4,
    diplomacyBias: 0.6,
    coalitionTendency: 0.5,
    imperialOverreachPenalty: 0.5,
    resourceNeedWeight: 0.4,
    culturalAffinityWeight: 0.4,
    warCostModel: 'logistics-terrain',
    annexationRules: { allowVassalization: true, allowFullAbsorb: true, maxAnnexationPerDecadePct: 0.15 }
  },
  output: { detail: 'standard', snapshotsEveryYears: 10, exportFormats: ['json'] }
});

describe('history endpoints', () => {
  const app = buildServer();
  let worldId = '';
  let polityId = '';

  beforeAll(async () => {
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/generate', payload: config });
    const payload = response.json();
    worldId = payload.worldId;
    polityId = payload.bundle.politiesInitial[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns year summaries', async () => {
    const response = await app.inject({ method: 'GET', url: `/world/${worldId}/years/summary?from=0&to=10` });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0]).toHaveProperty('counts');
  });

  it('searches events', async () => {
    const response = await app.inject({ method: 'GET', url: `/world/${worldId}/events/search?q=war&limit=5` });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload)).toBe(true);
  });

  it('returns polity history', async () => {
    const response = await app.inject({ method: 'GET', url: `/world/${worldId}/polity/${polityId}/history?from=0&to=20` });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toHaveProperty('events');
    expect(payload).toHaveProperty('changes');
    expect(payload).toHaveProperty('statsSeries');
  });

  it('returns changes in a range', async () => {
    const response = await app.inject({ method: 'GET', url: `/world/${worldId}/changes?from=0&to=50` });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload)).toBe(true);
  });
});
