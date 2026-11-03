import type { ActorShape, Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';

export const PLAYER_RADIUS = 0.3;
export const PLAYER_STAND_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.0;

export const PLAYER_STAND: ActorShape = { radius: PLAYER_RADIUS, height: PLAYER_STAND_HEIGHT };
export const PLAYER_CROUCH: ActorShape = { radius: PLAYER_RADIUS, height: PLAYER_CROUCH_HEIGHT };

const EYE_OFFSET = 0.15;

export class PlayerCollider {
  private _crouched = false;

  get crouched(): boolean {
    return this._crouched;
  }

  get shape(): ActorShape {
    return this._crouched ? PLAYER_CROUCH : PLAYER_STAND;
  }

  get radius(): number {
    return this.shape.radius;
  }

  get height(): number {
    return this.shape.height;
  }

  /** Eye height measured from the feet. */
  get eyeHeight(): number {
    return this.shape.height - EYE_OFFSET;
  }

  canStand(world: CollisionWorld, position: Vec2): boolean {
    return world.hasClearance(position, PLAYER_STAND);
  }

  /** Returns true when the state actually changed. */
  setCrouched(value: boolean, world?: CollisionWorld, position?: Vec2): boolean {
    if (value === this._crouched) return false;
    if (!value && world && position && !this.canStand(world, position)) return false;
    this._crouched = value;
    return true;
  }

  reset(): void {
    this._crouched = false;
  }
}