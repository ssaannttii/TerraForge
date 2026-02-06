import { Range } from '../types.js';

export function compressRanges(ids: number[]): Range[] {
  if (ids.length === 0) return [];
  const sorted = [...ids].sort((a, b) => a - b);
  const ranges: Range[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      ranges.push({ start, end: prev });
      start = current;
      prev = current;
    }
  }
  ranges.push({ start, end: prev });
  return ranges;
}

export function expandRanges(ranges: Range[]): number[] {
  const ids: number[] = [];
  for (const range of ranges) {
    for (let i = range.start; i <= range.end; i += 1) {
      ids.push(i);
    }
  }
  return ids;
}

export function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}
