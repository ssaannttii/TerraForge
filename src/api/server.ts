import Fastify from 'fastify';
import { ZodError } from 'zod';
import { ConfigSchema } from '../core/schema.js';
import { generateWorld } from '../core/engine.js';
import { WorldBundle } from '../core/types.js';
import { hashObject } from '../core/hashing.js';
import { exportGeoJson } from '../export/geojson.js';

type Snapshot = WorldBundle['timelineIndex']['snapshots'][number];

const parseOptionalInt = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return undefined;
    }
    return parsed;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return undefined;
    }
    return value;
  }
  return undefined;
};

const selectSnapshot = (snapshots: Snapshot[], year: number): Snapshot | undefined => {
  if (snapshots.length === 0) {
    return undefined;
  }
  let earliest = snapshots[0];
  let latest: Snapshot | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.year < earliest.year) {
      earliest = snapshot;
    }
    if (snapshot.year <= year && (!latest || snapshot.year > latest.year)) {
      latest = snapshot;
    }
  }
  return latest ?? earliest;
};

export function buildServer() {
  const app = Fastify();
  const worlds = new Map<string, WorldBundle>();
  (app as any).worlds = worlds;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid config', details: error.issues });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal error' });
  });

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
    const yearParsed = parseOptionalInt(year);
    if (year !== undefined && yearParsed === undefined) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    if (layer === 'biome') {
      return reply.send(world.cells.map((cell) => cell.biomeId));
    }
    if (layer === 'resources') {
      return reply.send(world.cells.map((cell) => cell.resourceTags));
    }
    const yearNum = yearParsed ?? world.meta.startYear;
    const snapshot = selectSnapshot(world.timelineIndex.snapshots, yearNum);
    if (!snapshot) {
      return reply.code(500).send({ error: 'timeline snapshots missing' });
    }
    return reply.send(snapshot.politicalOwnersRLE);
  });

  app.get('/world/:worldId/polities', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { year, sort, limit } = request.query as { year?: string; sort?: string; limit?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearParsed = parseOptionalInt(year);
    if (year !== undefined && yearParsed === undefined) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    const limitParsed = parseOptionalInt(limit);
    if (limit !== undefined && limitParsed === undefined) {
      return reply.code(400).send({ error: 'invalid limit' });
    }
    const yearNum = yearParsed ?? world.meta.startYear;
    const snapshot = selectSnapshot(world.timelineIndex.snapshots, yearNum);
    if (!snapshot) {
      return reply.code(500).send({ error: 'timeline snapshots missing' });
    }
    let polities = snapshot.polityStates;
    if (sort === 'powerScore') {
      polities = [...polities].sort((a, b) => b.stats.powerScore - a.stats.powerScore);
    }
    if (limitParsed !== undefined) {
      polities = polities.slice(0, limitParsed);
    }
    return reply.send(polities);
  });

  app.get('/world/:worldId/polity/:id', async (request, reply) => {
    const { worldId, id } = request.params as { worldId: string; id: string };
    const { year } = request.query as { year?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearParsed = parseOptionalInt(year);
    if (year !== undefined && yearParsed === undefined) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    const yearNum = yearParsed ?? world.meta.startYear;
    const snapshot = selectSnapshot(world.timelineIndex.snapshots, yearNum);
    if (!snapshot) {
      return reply.code(500).send({ error: 'timeline snapshots missing' });
    }
    const polity = snapshot.polityStates.find((p) => p.id === id);
    if (!polity) return reply.code(404).send({ error: 'polity not found' });
    return reply.send(polity);
  });

  app.get('/world/:worldId/timeline', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { from, to, type } = request.query as { from?: string; to?: string; type?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const fromParsed = parseOptionalInt(from);
    if (from !== undefined && fromParsed === undefined) {
      return reply.code(400).send({ error: 'invalid from' });
    }
    const toParsed = parseOptionalInt(to);
    if (to !== undefined && toParsed === undefined) {
      return reply.code(400).send({ error: 'invalid to' });
    }
    const fromYear = fromParsed ?? world.meta.startYear;
    const toYear = toParsed ?? world.meta.endYear;
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
    const yearParsed = parseOptionalInt(year);
    if (year !== undefined && yearParsed === undefined) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    const yearNum = yearParsed ?? world.meta.startYear;
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
      const yearParsed = parseOptionalInt(year);
      if (year !== undefined && yearParsed === undefined) {
        return reply.code(400).send({ error: 'invalid year' });
      }
      await exportGeoJson(world, outPath, yearParsed);
      return reply.send({ path: outPath });
    }
    return reply.send(world);
  });

  return app;
}

if (process.argv[1]?.includes('server')) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  (async () => {
    try {
      await app.listen({ port, host: '0.0.0.0' });
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  })();
}
