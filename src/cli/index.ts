import { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ConfigSchema } from '../core/schema.js';
import { generateWorld } from '../core/engine.js';
import { stableStringify } from '../core/hashing.js';
import { exportCsv } from '../export/csv.js';
import { exportGeoJson } from '../export/geojson.js';

const program = new Command();

program
  .name('terraforge')
  .description('Generate deterministic worlds and geopolitics');

program
  .command('generate')
  .requiredOption('--config <path>')
  .requiredOption('--out <dir>')
  .action(async (opts) => {
    const raw = await readFile(opts.config, 'utf-8');
    const config = ConfigSchema.parse(JSON.parse(raw));
    const bundle = generateWorld(config);
    await mkdir(opts.out, { recursive: true });
    await mkdir(`${opts.out}/index`, { recursive: true });
    await writeFile(`${opts.out}/world.json`, stableStringify(bundle), 'utf-8');
    await writeFile(`${opts.out}/index/snapshots.json`, stableStringify(bundle.timelineIndex.snapshots), 'utf-8');
    await writeFile(`${opts.out}/index/deltas.json`, stableStringify(bundle.timelineIndex.deltasBetweenSnapshots), 'utf-8');
    console.log(`World generated at ${opts.out}`);
  });

program
  .command('serve')
  .requiredOption('--config <path>')
  .action(async (opts) => {
    const raw = await readFile(opts.config, 'utf-8');
    const config = ConfigSchema.parse(JSON.parse(raw));
    const { buildServer } = await import('../api/server.js');
    const app = buildServer();
    const bundle = generateWorld(config);
    const worldId = bundle.meta.configHash;
    (app as any).worlds?.set?.(worldId, bundle);
    const port = Number(process.env.PORT ?? 3000);
    await app.listen({ port, host: '0.0.0.0' });
  });

program
  .command('query')
  .requiredOption('--world <path>')
  .requiredOption('--year <year>')
  .option('--polity <id>')
  .action(async (opts) => {
    const raw = await readFile(opts.world, 'utf-8');
    const world = JSON.parse(raw);
    const year = Number(opts.year);
    const snapshot = world.timelineIndex.snapshots
      .filter((s: { year: number }) => s.year <= year)
      .sort((a: { year: number }, b: { year: number }) => b.year - a.year)[0];
    if (opts.polity) {
      const polity = snapshot.polityStates.find((p: { id: string }) => p.id === opts.polity);
      console.log(JSON.stringify(polity, null, 2));
    } else {
      console.log(JSON.stringify(snapshot, null, 2));
    }
  });

program
  .command('export')
  .requiredOption('--world <path>')
  .requiredOption('--format <format>')
  .option('--out <dir>', 'output dir', 'out')
  .option('--year <year>')
  .action(async (opts) => {
    const raw = await readFile(opts.world, 'utf-8');
    const world = JSON.parse(raw);
    await mkdir(opts.out, { recursive: true });
    if (opts.format === 'json') {
      await writeFile(`${opts.out}/world.json`, stableStringify(world), 'utf-8');
    } else if (opts.format === 'csv') {
      await exportCsv(world, opts.out);
    } else if (opts.format === 'geojson') {
      await exportGeoJson(world, `${opts.out}/world.geojson`, opts.year ? Number(opts.year) : undefined);
    } else {
      throw new Error('Unsupported format');
    }
    console.log(`Exported to ${opts.out}`);
  });

program.parseAsync(process.argv);
