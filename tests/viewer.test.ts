import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';

describe('viewer assets', () => {
  const app = buildServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves viewer HTML', async () => {
    const response = await app.inject({ method: 'GET', url: '/viewer' });
    expect(response.statusCode).toBe(200);
    expect(response.payload).toContain('History-first world viewer');
  });

  it('serves viewer app.js', async () => {
    const response = await app.inject({ method: 'GET', url: '/viewer/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
  });
});
