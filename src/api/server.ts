import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { ConfigSchema } from '../core/schema.js';
import { generateWorld } from '../core/engine.js';
import { TimelineEvent, WorldBundle } from '../core/types.js';
import { hashObject } from '../core/hashing.js';
import { exportGeoJson } from '../export/geojson.js';
import { buildWorldIndexes, searchWorldIndexes, WorldIndexes } from '../sim/indexes.js';

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
  const worldIndexes = new Map<string, WorldIndexes>();
  (app as any).worlds = worlds;
  (app as any).worldIndexes = worldIndexes;
  const viewerCache = new Map<string, string>();

  const loadViewerAsset = async (filename: string) => {
    if (viewerCache.has(filename)) {
      return viewerCache.get(filename) as string;
    }
    const assetPath = path.join(process.cwd(), 'src', 'viewer', filename);
    const content = await readFile(assetPath, 'utf-8');
    viewerCache.set(filename, content);
    return content;
  };

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid config', details: error.issues });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/worlds', async () => {
    return Array.from(worlds.entries()).map(([worldId, world]) => ({ worldId, meta: world.meta }));
  });

  app.get('/viewer', async (_request, reply) => {
    const html = await loadViewerAsset('index.html');
    return reply.type('text/html').send(html);
  });

  app.get('/viewer/app.js', async (_request, reply) => {
    const js = await loadViewerAsset('app.js');
    return reply.type('text/javascript').send(js);
  });

  app.get('/viewer/style.css', async (_request, reply) => {
    const css = await loadViewerAsset('style.css');
    return reply.type('text/css').send(css);
  });

  app.post('/generate', async (request, reply) => {
    const config = ConfigSchema.parse(request.body);
    const bundle = generateWorld(config);
    const worldId = hashObject({ seed: config.seed, config });
    worlds.set(worldId, bundle);
    worldIndexes.set(worldId, buildWorldIndexes(bundle));
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
    if (layer === 'elevation') {
      return reply.send(world.cells.map((cell) => cell.elevation));
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
    const { year, from, to, type } = request.query as { year?: string; from?: string; to?: string; type?: string };
    const world = worlds.get(worldId);
    if (!world) return reply.code(404).send({ error: 'world not found' });
    const yearParsed = parseOptionalInt(year);
    if (year !== undefined && yearParsed === undefined) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    const fromParsed = parseOptionalInt(from);
    if (from !== undefined && fromParsed === undefined) {
      return reply.code(400).send({ error: 'invalid from' });
    }
    const toParsed = parseOptionalInt(to);
    if (to !== undefined && toParsed === undefined) {
      return reply.code(400).send({ error: 'invalid to' });
    }
    if (yearParsed !== undefined) {
      const changes = world.territorialChanges.filter((change) => change.year === yearParsed);
      return reply.send(changes);
    }
    const fromYear = fromParsed ?? world.meta.startYear;
    const toYear = toParsed ?? world.meta.endYear;
    const filtered = world.territorialChanges.filter((change) => change.year >= fromYear && change.year <= toYear);
    const typed = type ? filtered.filter((change) => change.type === type) : filtered;
    const sorted = typed.sort((a, b) => a.year - b.year);
    return reply.send(sorted);
  });

  app.get('/world/:worldId/years/summary', async (request, reply) => {
    const { worldId } = request.params as { worldId: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const world = worlds.get(worldId);
    const indexes = worldIndexes.get(worldId);
    if (!world || !indexes) return reply.code(404).send({ error: 'world not found' });
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
    const summary = [];
    for (let year = fromYear; year <= toYear; year += 1) {
      const eventIds = indexes.eventsByYear.get(year) ?? [];
      const events = eventIds.map((id) => indexes.eventsById.get(id)).filter(Boolean) as TimelineEvent[];
      const counts: Record<string, number> = {};
      const headline = events
        .map((event) => ({
          id: event.id,
          score: (event.actors.primary?.length ?? 0) + (event.actors.secondary?.length ?? 0) + event.effects.length
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((item) => item.id);
      for (const event of events) {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
      }
      summary.push({ year, counts, headline });
    }
    return reply.send(summary);
  });

  const handleSearch = (request: { params: unknown; query: unknown }, reply: { code: (status: number) => any; send: (payload: unknown) => any }) => {
    const { worldId } = request.params as { worldId: string };
    const { q, limit } = request.query as { q?: string; limit?: string };
    const world = worlds.get(worldId);
    const indexes = worldIndexes.get(worldId);
    if (!world || !indexes) return reply.code(404).send({ error: 'world not found' });
    const limitParsed = parseOptionalInt(limit);
    if (limit !== undefined && limitParsed === undefined) {
      return reply.code(400).send({ error: 'invalid limit' });
    }
    if (!q) return reply.send([]);
    const results = searchWorldIndexes(indexes, q, limitParsed ?? 20);
    return reply.send(results);
  };

  app.get('/world/:worldId/search', async (request, reply) => {
    return handleSearch(request, reply);
  });

  app.get('/world/:worldId/events/search', async (request, reply) => {
    return handleSearch(request, reply);
  });

  app.get('/world/:worldId/polity/:id/history', async (request, reply) => {
    const { worldId, id } = request.params as { worldId: string; id: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const world = worlds.get(worldId);
    const indexes = worldIndexes.get(worldId);
    if (!world || !indexes) return reply.code(404).send({ error: 'world not found' });
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
    const eventIds = indexes.eventsByPolity.get(id) ?? [];
    const events = eventIds
      .map((eventId) => indexes.eventsById.get(eventId))
      .filter((event): event is TimelineEvent => Boolean(event))
      .filter((event) => event.year >= fromYear && event.year <= toYear);
    const changeIds = indexes.changesByPolity.get(id) ?? [];
    const changes = changeIds
      .map((changeId) => indexes.changesById.get(changeId))
      .filter((change): change is WorldBundle['territorialChanges'][number] => Boolean(change))
      .filter((change) => change.year >= fromYear && change.year <= toYear);
    const statsSeries = (indexes.polityStatsSeries.get(id) ?? []).filter((point) => point.year >= fromYear && point.year <= toYear);
    return reply.send({ events, changes, statsSeries });
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
