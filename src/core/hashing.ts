import { createHash } from 'node:crypto';

export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val as object);
      if (Array.isArray(val)) {
        return val;
      }
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[key] = (val as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return val;
  });
}

export function hashObject(value: unknown): string {
  const json = stableStringify(value);
  return createHash('sha256').update(json).digest('hex');
}
