import Fastify from 'fastify';
import { ConfigSchema } from '../core/schema.js';
import { generateWorld } from '../core/engine.js';
import { WorldBundle } from '../core/types.js';
import { hashObject } from '../core/hashing.js';
import { exportGeoJson } from '../export/geojson.js';

export function buildServer() {
  const app = Fastify();
  const worlds = new Map<string, WorldBundle>();
  (app as any).worlds = worlds;

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/generate', async (request, reply) => {
    const config = ConfigSchema.parse(request.body);
    const bundle = generateWorld(config);
    const worldId = hashObject({ seed: config.seed, config });
    worlds.set(worldId, bundle);
    return reply.send({ worldId, bundle });
  });

  app.get('/world/:worldId/meta', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    return reply.send(world.meta);
  });

  app.get('/world/:worldId/map', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { layer, year } = request.query as { layer: string; year?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    if (layer === 'biome') {
      return reply.send(world.cells.map((cell) => cell.biomeId));
    }
    if (layer === 'resources') {
      return reply.send(world.cells.map((cell) => cell.resourceTags));
    }
    const yearNum = year ? Number(year) : world.meta.startYear;
    const snapshot = world.timelineIndex.snapshots
      .filter((s) => s.year <= yearNum)
      .sort((a, b) => b.year - a.year)[0];
    return reply.send(snapshot.politicalOwnersRLE);
  });

  app.get('/world/:worldId/polities', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { year, sort, limit } = request.query as { year?: string; sort?: string; limit?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearNum = year ? Number(year) : world.meta.startYear;
    const snapshot = world.timelineIndex.snapshots
      .filter((s) => s.year <= yearNum)
      .sort((a, b) => b.year - a.year)[0];
    let polities = snapshot.polityStates;
    if (sort === 'powerScore') {
      polities = [...polities].sort((a, b) => b.stats.powerScore - a.stats.powerScore);
    }
    if (limit) {
      polities = polities.slice(0, Number(limit));
    }
    return reply.send(polities);
  });

  app.get('/world/:worldId/polity/:id', async (request, reply) => {
    const { worldId, id } = request.params as { worldId: string; id: string };
    const { year } = request.query as { year?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearNum = year ? Number(year) : world.meta.startYear;
    const snapshot = world.timelineIndex.snapshots
      .filter((s) => s.year <= yearNum)
      .sort((a, b) => b.year - a.year)[0];
    const polity = snapshot.polityStates.find((p) => p.id === id);
    if (!polity) return reply.code(404).send({ error: 'polity not found' });
    return reply.send(polity);
  });

  app.get('/world/:worldId/timeline', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { from, to, type } = request.query as { from?: string; to?: string; type?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const fromYear = from ? Number(from) : world.meta.startYear;
    const toYear = to ? Number(to) : world.meta.endYear;
    const events = world.events.filter((event) => event.year >= fromYear && event.year <= toYear);
    const filtered = type ? events.filter((event) => event.type === type) : events;
    return reply.send(filtered);
  });

  app.get('/world/:worldId/war/:id', async (request, reply) => {
    const { worldId, id } = request.params as { worldId: string; id: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const war = world.wars.find((w) => w.id === id);
    if (!war) return reply.code(404).send({ error: 'war not found' });
    return reply.send(war);
  });

  app.get('/world/:worldId/changes', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { year } = request.query as { year?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearNum = year ? Number(year) : world.meta.startYear;
    const changes = world.territorialChanges.filter((change) => change.year === yearNum);
    return reply.send(changes);
  });

  app.get('/world/:worldId/export', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { format, year } = request.query as { format?: string; year?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    if (format === 'geojson') {
      const outPath = `out_${worldId}.geojson`;
      await exportGeoJson(world, outPath, year ? Number(year) : undefined);
      return reply.send({ path: outPath });
    }
    return reply.send(world);
  });

  return app;
}

if (process.argv[1]?.includes('server')) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: '0.0.0.0' });
}
