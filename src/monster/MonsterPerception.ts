import type * as THREE from 'three';
import type { SoundEvent } from '../core/GameEvents';
interface Vec2 {
  x: number;
  z: number;
}
import type { CollisionWorld } from '../world/CollisionWorld';
import { fovRadians, type MonsterConfig } from './MonsterConfig';

export interface PlayerObservable {
  position: Vec2;
  crouched: boolean;
  hidden: boolean;
  noiseMultiplier: number;
}

export interface HearingResult {
  event: SoundEvent;
  effectiveLoudness: number;
}

const toVec2 = (v: THREE.Vector3): Vec2 => ({ x: v.x, z: v.z });

/** Pure perception maths. No state machine knowledge. */
export class MonsterPerception {
  constructor(private readonly world: CollisionWorld, private readonly config: MonsterConfig) {}

  private angleBetween(from: Vec2, facing: number, to: Vec2): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const target = Math.atan2(dx, -dz);
    let diff = target - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff);
  }

  effectiveSightRange(player: PlayerObservable): number {
    let range = this.config.sightRange;
    if (player.crouched) range *= this.config.crouchSightMultiplier;
    if (player.hidden) range *= this.config.hiddenSightMultiplier;
    return range;
  }

  canSee(monsterPos: Vec2, facing: number, player: PlayerObservable): boolean {
    if (player.hidden) return false;
    const distance = Math.hypot(player.position.x - monsterPos.x, player.position.z - monsterPos.z);
    if (distance > this.effectiveSightRange(player)) return false;
    if (distance > 0.001 && this.angleBetween(monsterPos, facing, player.position) > fovRadians(this.config) / 2) {
      return false;
    }
    return this.world.hasLineOfSight(monsterPos, player.position);
  }

  /** Attenuated + wall-muffled. Returns the most salient audible event. */
  loudestAudible(monsterPos: Vec2, events: readonly SoundEvent[]): HearingResult | null {
    let best: HearingResult | null = null;
    for (const event of events) {
      const position = toVec2(event.position);
      const distance = Math.hypot(position.x - monsterPos.x, position.z - monsterPos.z);
      if (distance > this.config.hearingRange) continue;
      const falloff = 1 - distance / this.config.hearingRange;
      const muffled = this.world.hasLineOfSight(monsterPos, position) ? 1 : 0.45;
      const effective = event.loudness * falloff * muffled;
      if (effective < this.config.hearingThreshold) continue;
      if (best === null || effective > best.effectiveLoudness) best = { event, effectiveLoudness: effective };
    }
    return best;
  }
}