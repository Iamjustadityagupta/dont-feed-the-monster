import { Logger } from '../core/Logger';
import type { Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';
import type { PlayerCollider } from './PlayerCollider';
import type { Gait } from '../core/GameEvents';

export interface MovementConfig {
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  acceleration: number;
  deceleration: number;
  maxDelta: number;
  sprintCostFactor: number;
}

export const DEFAULT_MOVEMENT: MovementConfig = {
  walkSpeed: 2.6,
  sprintSpeed: 4.6,
  crouchSpeed: 1.35,
  acceleration: 18,
  deceleration: 22,
  maxDelta: 0.1,
  sprintCostFactor: 0.85,
};

export interface MovementIntent {
  forward: number;
  strafe: number;
  sprint: boolean;
  crouch: boolean;
  yaw: number;
}

export class PlayerMotor {
  private readonly log = new Logger({ namespace: 'motor' });
  private readonly config: MovementConfig;
  private velocity: Vec2 = { x: 0, z: 0 };
  private _position: Vec2;
  private _gait: Gait = 'idle';
  private _distanceTravelled = 0;

  constructor(
    private readonly world: CollisionWorld,
    private readonly collider: PlayerCollider,
    start: Vec2,
    config: MovementConfig = DEFAULT_MOVEMENT,
  ) {
    this.config = config;
    this._position = { ...start };
  }

  get position(): Vec2 {
    return this._position;
  }

  get gait(): Gait {
    return this._gait;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get distanceTravelled(): number {
    return this._distanceTravelled;
  }

  setPosition(position: Vec2): void {
    this._position = { ...position };
    this.velocity = { x: 0, z: 0 };
    this._gait = 'idle';
  }

  teleportSafe(position: Vec2): void {
    const safe = this.world.nearestWalkablePoint(position, this.collider.radius);
    this.setPosition(safe ?? position);
  }

  private targetSpeed(intent: MovementIntent): number {
    if (intent.crouch) return this.config.crouchSpeed;
    if (intent.sprint) return this.config.sprintSpeed;
    return this.config.walkSpeed;
  }

  update(delta: number, intent: MovementIntent): void {
    const dt = Math.min(Math.max(delta, 0), this.config.maxDelta);
    if (dt === 0) return;

    const crouchChanged = this.collider.setCrouched(intent.crouch, this.world, this._position);
    if (crouchChanged) this.log.debug('crouch', { crouched: this.collider.crouched });

    // Normalise so diagonal movement is not faster.
    let wishX = intent.strafe;
    let wishZ = intent.forward;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const sin = Math.sin(intent.yaw);
    const cos = Math.cos(intent.yaw);
    const dirX = wishX * cos - wishZ * sin;
    const dirZ = -wishX * sin - wishZ * cos;

    const speed = this.targetSpeed(intent);
    const targetX = dirX * speed;
    const targetZ = dirZ * speed;
    const rate = wishLength > 0 ? this.config.acceleration : this.config.deceleration;
    const blend = Math.min(1, rate * dt);

    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;

    if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;

    const deltaMove: Vec2 = { x: this.velocity.x * dt, z: this.velocity.z * dt };
    const result = this.world.moveCircle(this._position, deltaMove, this.collider.radius);
    if (result.blockedX) this.velocity.x = 0;
    if (result.blockedZ) this.velocity.z = 0;

    const moved = Math.hypot(result.position.x - this._position.x, result.position.z - this._position.z);
    this._distanceTravelled += moved;
    this._position = result.position;

    this._gait = this.deriveGait(intent, moved / dt);
  }

  private deriveGait(intent: MovementIntent, actualSpeed: number): Gait {
    if (actualSpeed < 0.15) return 'idle';
    if (this.collider.crouched) return 'crouch';
    return intent.sprint ? 'sprint' : 'walk';
  }

  reset(start: Vec2): void {
    this.collider.reset();
    this._distanceTravelled = 0;
    this.setPosition(start);
  }
}