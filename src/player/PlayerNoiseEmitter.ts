import * as THREE from 'three';
import type { Gait, SoundCategory } from '../core/GameEvents';

interface NoiseProfile {
  interval: number;
  loudness: number;
  category: SoundCategory;
}

const PROFILES: Record<Exclude<Gait, 'idle'>, NoiseProfile> = {
  crouch: { interval: 0.7, loudness: 0.16, category: 'crouch' },
  walk: { interval: 0.48, loudness: 0.42, category: 'footstep' },
  sprint: { interval: 0.3, loudness: 0.85, category: 'sprint' },
};

/** Emits one noise event per stride, never per frame. */
export class PlayerNoiseEmitter {
  private accumulator = 0;

  constructor(
    private readonly emit: (position: THREE.Vector3, loudness: number, category: SoundCategory) => void,
  ) {}

  update(delta: number, position: THREE.Vector3, gait: Gait): void {
    if (gait === 'idle') {
      this.accumulator = PROFILES.walk.interval * 0.9; // next step fires promptly
      return;
    }
    const profile = PROFILES[gait];
    this.accumulator += Math.max(delta, 0);
    if (this.accumulator < profile.interval) return;
    this.accumulator -= profile.interval;
    this.emit(position, profile.loudness, profile.category);
  }

  /** Discrete one-off noise (landing, throw, interaction). */
  burst(position: THREE.Vector3, loudness: number, category: SoundCategory): void {
    this.emit(position, Math.min(Math.max(loudness, 0), 1), category);
  }

  reset(): void {
    this.accumulator = 0;
  }
}