import * as THREE from 'three';
import { Logger } from '../core/Logger';
import type { MonsterStateName, SoundEvent } from '../core/GameEvents';
import type { Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';
import { createRng, type Rng } from '../core/Random';
import type { MonsterConfig } from './MonsterConfig';
import type { NavigationGraph } from './NavigationGraph';
import { MonsterPerception, type PlayerObservable } from './MonsterPerception';

export interface MonsterBrainDeps {
  world: CollisionWorld;
  nav: NavigationGraph;
  config: MonsterConfig;
  perception: MonsterPerception;
  seed: number;
  onStateChange?: (from: MonsterStateName, to: MonsterStateName, reason: string) => void;
  onThreat?: (distance: number, state: MonsterStateName) => void;
}

interface StateContext {
  elapsed: number;
  target: Vec2 | null;
  reason: string;
}

const LEGAL_TRANSITIONS: Record<MonsterStateName, readonly MonsterStateName[]> = {
  patrol: ['investigate', 'chase', 'stunned'],
  investigate: ['searchLastKnown', 'chase', 'returnToPatrol', 'stunned'],
  searchLastKnown: ['chase', 'returnToPatrol', 'stunned'],
  chase: ['searchLost', 'stunned'],
  searchLost: ['chase', 'returnToPatrol', 'stunned'],
  returnToPatrol: ['chase', 'investigate', 'patrol', 'stunned'],
  stunned: ['chase', 'investigate', 'returnToPatrol'],
};

const RADIUS = 0.4;

export class MonsterStateMachine {
  private readonly log = new Logger({ namespace: 'monster' });
  private readonly deps: MonsterBrainDeps;
  private readonly rng: Rng;

  private _state: MonsterStateName = 'patrol';
  private ctx: StateContext = { elapsed: 0, target: null, reason: 'init' };
  private position: Vec2;
  private facing = 0;
  private path: Vec2[] = [];
  private pathIndex = 0;
  private repathTimer = 0;
  private stuckTimer = 0;
  private stuckAnchor: Vec2;
  private lastKnown: Vec2 | null = null;
  private confidence = 0;
  private graceTimer: number;
  private lockerAdaptation = 0;
  private distractionAdaptation = 0;

  constructor(deps: MonsterBrainDeps, start: Vec2) {
    this.deps = deps;
    this.rng = createRng(deps.seed);
    this.position = { ...start };
    this.stuckAnchor = { ...start };
    this.graceTimer = deps.config.firstContactGrace;
  }

  get state(): MonsterStateName {
    return this._state;
  }

  get currentPosition(): Vec2 {
    return this.position;
  }

  get currentFacing(): number {
    return this.facing;
  }

  get isHunting(): boolean {
    return this._state === 'chase';
  }

  get inGrace(): boolean {
    return this.graceTimer > 0;
  }

  /** Locker effectiveness shrinks as the player reuses the same trick. */
  get lockerEffectiveness(): number {
    return Math.max(this.deps.config.adaptationFloor, 1 - this.lockerAdaptation);
  }

  get distractionEffectiveness(): number {
    return Math.max(this.deps.config.adaptationFloor, 1 - this.distractionAdaptation);
  }

  registerLockerUse(): void {
    this.lockerAdaptation = Math.min(1, this.lockerAdaptation + this.deps.config.lockerAdaptationStep);
  }

  registerDistraction(): void {
    this.distractionAdaptation = Math.min(1, this.distractionAdaptation + this.deps.config.distractionAdaptationStep);
  }

  private canTransition(to: MonsterStateName): boolean {
    return LEGAL_TRANSITIONS[this._state].includes(to);
  }

  transition(to: MonsterStateName, reason: string): void {
    if (to === this._state) return;
    if (!this.canTransition(to)) {
      this.log.warnThrottled(`${this._state}->${to}`, 'illegal transition', { from: this._state, to });
      return;
    }
    const from = this._state;
    this._state = to;
    this.ctx = { elapsed: 0, target: this.ctx.target, reason };
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.stuckAnchor = { ...this.position };
    if (to !== 'chase') this.lastKnown = this.lastKnown ?? null;
    this.deps.onStateChange?.(from, to, reason);
    this.log.debug('state change', { from, to, reason });
  }

  hearSound(event: SoundEvent, strength: number): void {
    if (this._state === 'chase' || this._state === 'stunned') return;
    if (strength < this.deps.config.hearingThreshold) return;
    this.lastKnown = { x: event.position.x, z: event.position.z };
    this.confidence = Math.min(this.deps.config.maxMemoryConfidence, strength + 0.2);
    if (this._state === 'patrol' || this._state === 'returnToPatrol') {
      this.transition('investigate', `sound:${event.category}`);
    }
  }

  stun(seconds = this.deps.config.stunDuration): void {
    if (this._state === 'stunned') return;
    this.transition('stunned', 'stunned');
    this.ctx.elapsed = 0;
    this.stunRemaining = seconds;
  }

  private stunRemaining = 0;

  update(delta: number, player: PlayerObservable, sounds: readonly SoundEvent[]): void {
    if (delta <= 0) return;
    if (this.graceTimer > 0) this.graceTimer = Math.max(0, this.graceTimer - delta);

    this.ctx.elapsed += delta;
    this.confidence = Math.max(0, this.confidence - this.deps.config.memoryDecayPerSecond * delta);
    this.lockerAdaptation = Math.max(0, this.lockerAdaptation - this.deps.config.adaptationDecayPerSecond * delta);

    const distance = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z);
    this.deps.onThreat?.(distance, this._state);

    const sees = this.deps.perception.canSee(this.position, this.facing, player);
    if (sees) {
      this.lastKnown = { ...player.position };
      this.confidence = this.deps.config.maxMemoryConfidence;
    }

    if (sees && this._state !== 'chase' && this._state !== 'stunned') {
      this.transition('chase', 'spotted');
    }

    if (!sees && this._state !== 'chase' && this._state !== 'stunned') {
      const heard = this.deps.perception.loudestAudible(this.position, sounds);
      if (heard) this.hearSound(heard.event, heard.effectiveLoudness * this.distractionEffectiveness);
    }

    switch (this._state) {
      case 'patrol':
        this.stepPatrol(delta);
        break;
      case 'investigate':
        this.stepInvestigate(delta, sees);
        break;
      case 'searchLastKnown':
        this.stepSearch(delta, sees, this.deps.config.searchDuration, 'searchLastKnown');
        break;
      case 'chase':
        this.stepChase(delta, player, sees);
        break;
      case 'searchLost':
        this.stepSearch(delta, sees, this.deps.config.searchLostDuration, 'searchLost');
        break;
      case 'returnToPatrol':
        this.stepReturn(delta, sees);
        break;
      case 'stunned':
        this.stunRemaining -= delta;
        if (this.stunRemaining <= 0) this.transition(sees ? 'chase' : 'returnToPatrol', 'recovered');
        break;
    }
  }

  private stepPatrol(delta: number): void {
    if (this.path.length === 0) this.path = this.randomPatrolPath();
    this.followPath(delta, this.deps.config.patrolSpeed);
    if (this.path.length > 0 && this.pathIndex >= this.path.length) this.path = [];
  }

  private randomPatrolPath(): Vec2[] {
    const node = this.deps.nav.nearestWalkable({
      x: this.position.x + this.rng.range(-14, 14),
      z: this.position.z + this.rng.range(-14, 14),
    });
    if (!node) return [];
    return this.deps.nav.findPath(this.position, node) ?? [];
  }

  private stepInvestigate(delta: number, sees: boolean): void {
    if (sees) return;
    const target = this.ctx.target ?? this.lastKnown;
    if (!target) {
      this.transition('returnToPatrol', 'nothing-to-investigate');
      return;
    }
    const arrived = this.moveToward(delta, target, this.deps.config.investigateSpeed);
    if (arrived) this.transition('searchLastKnown', 'arrived-at-sound');
    else if (this.ctx.elapsed > this.deps.config.investigateDuration) {
      this.transition('searchLastKnown', 'investigate-timeout');
    }
  }

  private stepChase(delta: number, player: PlayerObservable, sees: boolean): void {
    this.moveToward(delta, player.position, this.deps.config.chaseSpeed);
    if (sees) {
      this.ctx.target = { ...player.position };
      this.ctx.elapsed = 0;
      return;
    }
    if (this.ctx.elapsed > this.deps.config.loseSightGrace) this.transition('searchLost', 'lost-sight');
  }

  private stepSearch(delta: number, sees: boolean, limit: number, from: MonsterStateName): void {
    if (sees) {
      this.transition('chase', 'reacquired');
      return;
    }
    if (this.ctx.target === null) {
      const centre = this.lastKnown ?? this.position;
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(1.2, 3.4);
      this.ctx.target = {
        x: centre.x + Math.cos(angle) * radius,
        z: centre.z + Math.sin(angle) * radius,
      };
    }
    const arrived = this.moveToward(delta, this.ctx.target, this.deps.config.investigateSpeed);
    if (arrived) this.ctx.target = null;
    if (this.ctx.elapsed > limit && from === 'searchLastKnown') this.transition('returnToPatrol', 'search-exhausted');
    if (this.ctx.elapsed > limit && from === 'searchLost') this.transition('returnToPatrol', 'search-exhausted');
  }

  private stepReturn(delta: number, sees: boolean): void {
    if (sees) {
      this.transition('chase', 'reacquired');
      return;
    }
    const node = this.deps.nav.nearestWalkable(this.position);
    if (node && this.path.length === 0) this.path = this.deps.nav.findPath(this.position, node) ?? [];
    this.followPath(delta, this.deps.config.returnSpeed);
    if (this.ctx.elapsed > 2.5) this.transition('patrol', 'patrolling');
  }

  private moveToward(delta: number, target: Vec2, speed: number): boolean {
    const distance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
    if (distance <= this.deps.config.arrivalRadius) return true;

    this.repathTimer -= delta;
    if (this.path.length === 0 || this.repathTimer <= 0) {
      this.path = this.deps.nav.findPath(this.position, target) ?? [];
      this.pathIndex = 0;
      this.repathTimer = this.deps.config.repathInterval;
    }
    this.followPath(delta, speed);
    return Math.hypot(target.x - this.position.x, target.z - this.position.z) <= this.deps.config.arrivalRadius;
  }

  private followPath(delta: number, speed: number): void {
    const waypoint = this.path[this.pathIndex];
    if (!waypoint) return;
    const dx = waypoint.x - this.position.x;
    const dz = waypoint.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) {
      this.pathIndex += 1;
      return;
    }
    const dirX = dx / distance;
    const dirZ = dz / distance;
    this.facing = Math.atan2(dirX, -dirZ);

    const step = speed * delta;
    const result = this.deps.world.moveCircle(this.position, { x: dirX * step, z: dirZ * step }, RADIUS);
    this.position = result.position;

    this.stuckTimer += delta;
    if (this.stuckTimer >= this.deps.config.stuckWindow) {
      const moved = Math.hypot(this.position.x - this.stuckAnchor.x, this.position.z - this.stuckAnchor.z);
      if (moved < this.deps.config.stuckDistance) this.recoverFromStuck();
      this.stuckTimer = 0;
      this.stuckAnchor = { ...this.position };
    }
  }

  private recoverFromStuck(): void {
    this.log.warnThrottled('stuck', 'monster stuck; repathing', { state: this._state });
    const detour = this.deps.world.nearestWalkablePoint(
      { x: this.position.x + this.rng.range(-1.5, 1.5), z: this.position.z + this.rng.range(-1.5, 1.5) },
      RADIUS,
    );
    if (!detour) return;
    this.path = this.deps.nav.findPath(this.position, detour) ?? [];
    this.pathIndex = 0;
  }

  /** Simulated position as THREE vector for rendering. */
  renderPosition(height = 0): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, height, this.position.z);
  }

  reset(start: Vec2): void {
    this._state = 'patrol';
    this.position = { ...start };
    this.path = [];
    this.pathIndex = 0;
    this.lastKnown = null;
    this.confidence = 0;
    this.ctx = { elapsed: 0, target: null, reason: 'reset' };
    this.graceTimer = this.deps.config.firstContactGrace;
  }
}