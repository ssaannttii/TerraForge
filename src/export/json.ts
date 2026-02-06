import { writeFile } from 'node:fs/promises';
import { WorldBundle } from '../core/types.js';
import { stableStringify } from '../core/hashing.js';

export async function exportJson(bundle: WorldBundle, outPath: string): Promise<void> {
  const content = stableStringify(bundle);
  await writeFile(outPath, content, 'utf-8');
}
