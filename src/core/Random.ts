
/** Deterministic PRNG. Same seed always produces the same stream. */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T | undefined;
  fork(salt: string): Rng;
}

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;

  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let state = (seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min)),
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T | undefined =>
      items.length === 0
        ? undefined
        : items[Math.floor(next() * items.length)],
    fork: (salt) => createRng(hashString(`${seed}:${salt}`)),
  };
}

/**
 * Compatibility wrapper for legacy callers using:
 * new Random(seed), reseed(), range(), and chance().
 */
export class Random implements Rng {
  private rng: Rng;

  constructor(private seed: number) {
    this.rng = createRng(seed);
  }

  next(): number {
    return this.rng.next();
  }

  range(min: number, max: number): number {
    return this.rng.range(min, max);
  }

  int(minInclusive: number, maxExclusive: number): number {
    return this.rng.int(minInclusive, maxExclusive);
  }

  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }

  pick<T>(items: readonly T[]): T | undefined {
    return this.rng.pick(items);
  }

  fork(salt: string): Rng {
    return this.rng.fork(salt);
  }

  reseed(seed: number = this.seed): void {
    this.seed = seed;
    this.rng = createRng(seed);
  }
}
