import * as THREE from 'three';
import { Logger } from '../core/Logger';
import type { Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';

export interface ThrownObject {
  readonly id: string;
  position: Vec2;
  velocity: Vec2;
  readonly createdAt: number;
  settled: boolean;
  bounced: number;
}

export interface DistractionDeps {
  world: CollisionWorld;
  onImpact: (position: THREE.Vector3, loudness: number) => void;
  maxActive?: number;
  radius?: number;
}

const GRAVITY_DAMP = 3.4;
const RESTITUTION = 0.32;

export class DistractionSystem {
  private readonly log = new Logger({ namespace: 'distraction' });
  private readonly objects: ThrownObject[] = [];
  private readonly maxActive: number;
  private readonly radius: number;
  private cooldown = 0;
  private readonly cooldownSeconds = 0.9;
  private counter = 0;

  constructor(private readonly deps: DistractionDeps) {
    this.maxActive = deps.maxActive ?? 3;
    this.radius = deps.radius ?? 0.12;
  }

  get active(): readonly ThrownObject[] {
    return this.objects;
  }

  get ready(): boolean {
    return this.cooldown <= 0 && this.objects.length < this.maxActive;
  }

  get cooldownRemaining(): number {
    return this.cooldown;
  }

  throw(from: Vec2, yaw: number, simulationTime: number, speed = 9): ThrownObject | null {
    if (!this.ready) return null;
    const object: ThrownObject = {
      id: `throw-${this.counter++}`,
      position: { ...from },
      velocity: { x: Math.sin(yaw) * speed, z: Math.cos(yaw) * speed },
      createdAt: simulationTime,
      settled: false,
      bounced: 0,
    };
    this.objects.push(object);
    this.cooldown = this.cooldownSeconds;
    this.log.debug('thrown', { id: object.id });
    return object;
  }

  update(delta: number, simulationTime: number): void {
    this.cooldown = Math.max(0, this.cooldown - delta);
    for (let i = this.objects.length - 1; i >= 0; i -= 1) {
      const object = this.objects[i];
      if (object.settled) {
        if (simulationTime - object.createdAt > 30) this.objects.splice(i, 1);
        continue;
      }
      const step = Math.max(delta, 0);
      const dx = object.velocity.x * step;
      const dz = object.velocity.z * step;
      const result = this.deps.world.moveCircle(object.position, { x: dx, z: dz }, this.radius);

      const blockedX = result.blockedX;
      const blockedZ = result.blockedZ;
      object.position = result.position;

      if (blockedX || blockedZ) {
        if (blockedX) object.velocity.x *= -RESTITUTION;
        if (blockedZ) object.velocity.z *= -RESTITUTION;
        object.bounced += 1;
        const impactSpeed = Math.hypot(object.velocity.x, object.velocity.z);
        this.deps.onImpact(new THREE.Vector3(object.position.x, 0.05, object.position.z), Math.min(0.9, 0.35 + impactSpeed * 0.06));
        if (object.bounced >= 2 || impactSpeed < 0.7) object.settled = true;
        continue;
      }

      object.velocity.x -= object.velocity.x * GRAVITY_DAMP * step;
      object.velocity.z -= object.velocity.z * GRAVITY_DAMP * step;
      if (Math.hypot(object.velocity.x, object.velocity.z) < 0.35) object.settled = true;
    }
  }

  clear(): void {
    this.objects.length = 0;
    this.cooldown = 0;
  }
}