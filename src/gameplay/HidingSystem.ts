import * as THREE from 'three';
import { Logger } from '../core/Logger';
import type { Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';
import type { LockerVolume } from '../world/CollisionTypes';

export interface HidingDeps {
  world: CollisionWorld;
  onEnter?: (locker: LockerVolume) => void;
  onExit?: (locker: LockerVolume) => void;
  onDiscovered?: (locker: LockerVolume) => void;
}

export interface HidingProbe {
  position: Vec2;
  distance: number;
  state: string;
}

export class HidingSystem {
  private readonly log = new Logger({ namespace: 'hiding' });
  private _locker: LockerVolume | null = null;
  private suspicion = 0;
  private _justDiscovered = false;

  constructor(private readonly deps: HidingDeps) {}

  get hidden(): boolean {
    return this._locker !== null;
  }

  get locker(): LockerVolume | null {
    return this._locker;
  }

  get suspicionLevel(): number {
    return this.suspicion;
  }

  /** Locker the player could enter from this position. */
  findCandidate(position: Vec2, maxDistance = 1.0): LockerVolume | null {
    if (this._locker) return null;
    const locker = this.deps.world.findLockerContaining(position, maxDistance);
    if (!locker) return null;
    const centre = {
      x: (locker.minX + locker.maxX) / 2,
      z: (locker.minZ + locker.maxZ) / 2,
    };
    const facingDot =
      (position.x - centre.x) * locker.facing.x + (position.z - centre.z) * locker.facing.z;
    return facingDot > -0.05 ? locker : null;
  }

  enter(locker: LockerVolume): boolean {
    if (this._locker) return false;
    this._locker = locker;
    this.suspicion = 0;
    this._justDiscovered = false;
    this.log.debug('entered locker', { lockerId: locker.id });
    this.deps.onEnter?.(locker);
    return true;
  }

  exit(): boolean {
    if (!this._locker) return false;
    const locker = this._locker;
    this._locker = null;
    this.suspicion = 0;
    this.log.debug('exited locker', { lockerId: locker.id });
    this.deps.onExit?.(locker);
    return true;
  }

  /**
   * Progressive discovery instead of an instant kill. `probe` describes how
   * close / how aware the monster is. `effectiveness` shrinks with reuse.
   */
  update(delta: number, probe: HidingProbe | null, effectiveness: number): void {
    if (!this._locker) return;
    this._justDiscovered = false;
    if (!probe) {
      this.suspicion = Math.max(0, this.suspicion - delta * 0.6);
      return;
    }
    const proximity = Math.max(0, 1 - probe.distance / 3.2);
    const stateWeight = probe.state === 'chase' ? 1 : probe.state === 'searchLastKnown' ? 0.75 : 0.4;
    this.suspicion += proximity * stateWeight * delta * (1 / Math.max(effectiveness, 0.2));
    if (this.suspicion >= 1) {
      this.suspicion = 1;
      this._justDiscovered = true;
      const locker = this._locker;
      this._locker = null;
      this.deps.onDiscovered?.(locker);
    }
  }

  get discoveredThisTick(): boolean {
    return this._justDiscovered;
  }

  position(locker: LockerVolume): THREE.Vector3 {
    return new THREE.Vector3((locker.minX + locker.maxX) / 2, 0, (locker.minZ + locker.maxZ) / 2);
  }

  clear(): void {
    this._locker = null;
    this.suspicion = 0;
    this._justDiscovered = false;
  }
}