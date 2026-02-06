export class PRNG {
  private state: bigint;

  constructor(seed: number | bigint) {
    this.state = BigInt(seed) & ((1n << 64n) - 1n);
    if (this.state === 0n) {
      this.state = 0x9e3779b97f4a7c15n;
    }
  }

  private nextUint64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & ((1n << 64n) - 1n);
    let z = this.state;
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & ((1n << 64n) - 1n);
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & ((1n << 64n) - 1n);
    return z ^ (z >> 31n);
  }

  nextFloat01(): number {
    const u = this.nextUint64();
    return Number(u >> 11n) / Number(1n << 53n);
  }

  nextInt(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    const range = max - min + 1;
    return min + Math.floor(this.nextFloat01() * range);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  fork(subSeed: string): PRNG {
    let hash = 2166136261n;
    for (let i = 0; i < subSeed.length; i += 1) {
      hash ^= BigInt(subSeed.charCodeAt(i));
      hash = (hash * 16777619n) & ((1n << 64n) - 1n);
    }
    const mixed = this.nextUint64() ^ hash;
    return new PRNG(mixed);
  }
}
