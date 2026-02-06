import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigSchema } from '../core/schema.js';
import { generateWorld } from '../core/engine.js';
import { stableStringify } from '../core/hashing.js';
import { exportCsv } from '../export/csv.js';
import { exportGeoJson } from '../export/geojson.js';
import { buildWorldIndexes, serializeWorldIndexes } from '../sim/indexes.js';

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

const openBrowser = (url: string) => {
  const platform = process.platform;
  let command = '';
  let args: string[] = [];
  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.log(`Open this URL in your browser: ${url}`);
  });
  child.unref();
};

const runCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });

const getLatestMtime = async (dir: string, extensions: Set<string>, ignore: Set<string>) => {
  let latest = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await getLatestMtime(fullPath, extensions, ignore);
      latest = Math.max(latest, nested);
    } else if (entry.isFile()) {
      if (!extensions.has(path.extname(entry.name))) continue;
      const info = await stat(fullPath);
      latest = Math.max(latest, info.mtimeMs);
    }
  }
  return latest;
};

const ensureBuild = async () => {
  const distServer = path.join(process.cwd(), 'dist', 'api', 'server.js');
  const distCli = path.join(process.cwd(), 'dist', 'cli', 'index.js');
  let distMtime = 0;
  try {
    const serverStat = await stat(distServer);
    const cliStat = await stat(distCli);
    distMtime = Math.max(serverStat.mtimeMs, cliStat.mtimeMs);
  } catch {
    distMtime = 0;
  }
  const srcMtime = await getLatestMtime(path.join(process.cwd(), 'src'), new Set(['.ts', '.js', '.css', '.html']), new Set(['node_modules', 'dist']));
  if (distMtime === 0 || srcMtime > distMtime) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await runCommand(npmCmd, ['run', 'build']);
  }
};

const persistWorld = async (outDir: string, bundle: any) => {
  const indexes = buildWorldIndexes(bundle);
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, 'index'), { recursive: true });
  await writeFile(path.join(outDir, 'world.json'), stableStringify(bundle), 'utf-8');
  await writeFile(path.join(outDir, 'index', 'indexes.json'), stableStringify(serializeWorldIndexes(indexes)), 'utf-8');
};

const listenWithFallback = async (app: any, host: string, port: number) => {
  try {
    await app.listen({ port, host });
    return port;
  } catch (error) {
    if (!(error instanceof Error) || !String((error as { code?: string }).code).includes('EADDRINUSE')) {
      throw error;
    }
  }
  for (let candidate = 3001; candidate <= 3010; candidate += 1) {
    if (candidate === port) continue;
    try {
      await app.listen({ port: candidate, host });
      return candidate;
    } catch (error) {
      if (!(error instanceof Error) || !String((error as { code?: string }).code).includes('EADDRINUSE')) {
        throw error;
      }
    }
  }
  throw new Error(`Port ${port} is in use. Try: lsof -iTCP:${port} -sTCP:LISTEN or netstat -ano | findstr :${port}`);
};

program
  .command('view')
  .option('--config <path>', 'config path', 'examples/small.json')
  .option('--port <port>', 'port for the viewer', '3000')
  .option('--host <host>', 'host for the viewer', '127.0.0.1')
  .option('--out <dir>', 'output dir for world + indexes')
  .action(async (opts) => {
    await ensureBuild();
    const raw = await readFile(opts.config, 'utf-8');
    const config = ConfigSchema.parse(JSON.parse(raw));
    const { buildServer } = await import('../api/server.js');
    const app = buildServer();
    const bundle = generateWorld(config);
    const worldId = bundle.meta.configHash;
    (app as any).worlds?.set?.(worldId, bundle);
    (app as any).worldIndexes?.set?.(worldId, buildWorldIndexes(bundle));
    const port = Number(opts.port);
    const host = opts.host;
    const finalPort = await listenWithFallback(app, host, port);
    const url = `http://${host}:${finalPort}/viewer`;
    if (opts.out) {
      await persistWorld(opts.out, bundle);
      console.log(`World persisted to ${opts.out}`);
    }
    console.log(`Viewer available at ${url}`);
    console.log('Press Ctrl+C to stop');
    openBrowser(url);
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
