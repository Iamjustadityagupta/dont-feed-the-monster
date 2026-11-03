/**
 * Bounded, decaying tactic counters. Subject 09 "adapts" only through these: a handful of capped numbers that
 * fade over time. No learning model; repeated tactics become less effective gradually, never impossible.
 */
export const MEMORY = {
  maxScore: 5,
  /** Score points lost per second of calm. 1 point per 45 s. */
  decayPerSecond: 1 / 45,
  throwEffectivenessFloor: 0.35,
  throwPenaltyPerUse: 0.22,
  lockerBaseChance: 0.3,
  lockerChancePerUse: 0.12,
  lockerChanceCap: 0.75,
  maxLockersChecked: 3,
} as const;

export class MonsterMemory {
  throws = 0;
  lockerUses = 0;

  reset(): void {
    this.throws = 0;
    this.lockerUses = 0;
  }

  recordThrow(): void {
    this.throws = Math.min(MEMORY.maxScore, this.throws + 1);
  }

  recordLockerUse(): void {
    this.lockerUses = Math.min(MEMORY.maxScore, this.lockerUses + 1);
  }

  decay(dt: number): void {
    const d = dt * MEMORY.decayPerSecond;
    this.throws = Math.max(0, this.throws - d);
    this.lockerUses = Math.max(0, this.lockerUses - d);
  }

  /** 1 = a thrown object fully convinces it; falls with repetition but never below the floor. */
  throwEffectiveness(): number {
    return Math.max(MEMORY.throwEffectivenessFloor, 1 - MEMORY.throwPenaltyPerUse * Math.max(0, this.throws - 1));
  }

  /** How many lockers it will bother to inspect near a search. Zero until it has evidence you hide in lockers. */
  lockersToCheck(): number {
    return Math.min(MEMORY.maxLockersChecked, Math.floor(this.lockerUses + 0.5));
  }

  /** Chance that opening an occupied locker actually finds you. Increases with repeated use, capped, never 1. */
  lockerDiscoveryChance(): number {
    return Math.min(MEMORY.lockerChanceCap, MEMORY.lockerBaseChance + MEMORY.lockerChancePerUse * this.lockerUses);
  }
}
