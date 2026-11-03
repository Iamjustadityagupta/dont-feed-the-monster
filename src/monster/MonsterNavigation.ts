import { NavigationGraph } from '../world/NavigationGraph';
import type { Point2 } from '../world/LevelLayout';

export interface GoalResult {
  ok: boolean;
  /** True when the exact target is unreachable and the goal was moved to the nearest reachable spot. */
  approximate: boolean;
  reason?: 'target-blocked' | 'no-path' | 'no-walkable-start';
}

/**
 * Follows A* paths for a body of the graph's radius. Pure TypeScript (no three.js) so the game and the headless
 * AI harness drive exactly the same code. Never teleports and never invents a straight route when A* fails.
 */
export class MonsterNavigation {
  x: number;
  z: number;
  heading = 0;
  /** Seconds the body has failed to make progress while it has a path to follow. */
  stuckSeconds = 0;
  /** Number of repaths triggered by being stuck since the last goal was set. */
  recoveries = 0;
  private path: Point2[] = [];
  private index = 0;
  private goal: Point2 | null = null;
  private requested: Point2 | null = null;
  private repathTimer = 0;

  constructor(private readonly graph: NavigationGraph, start: Point2) {
    this.x = start.x;
    this.z = start.z;
  }

  place(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.clearGoal();
  }

  get hasGoal(): boolean { return this.goal !== null; }
  get currentGoal(): Point2 | null { return this.goal; }

  clearGoal(): void {
    this.goal = null;
    this.requested = null;
    this.path = [];
    this.index = 0;
    this.stuckSeconds = 0;
    this.recoveries = 0;
  }

  /** True once the body has finished walking the path (or has none). */
  get arrived(): boolean {
    return this.goal === null || this.index >= this.path.length;
  }

  distanceToGoal(): number {
    return this.goal ? Math.hypot(this.goal.x - this.x, this.goal.z - this.z) : 0;
  }

  /**
   * Set a destination. With allowApproximate=false an unreachable target is a clear failure (the current goal is kept
   * untouched). With true, the goal becomes the nearest reachable cell and the result says so.
   */
  setGoal(target: Point2, allowApproximate = false): GoalResult {
    if (this.goal && this.requested && Math.hypot(this.requested.x - target.x, this.requested.z - target.z) < 0.6 && !this.arrived && this.repathTimer > 0) {
      return { ok: true, approximate: this.goal.x !== target.x || this.goal.z !== target.z };
    }
    const start = this.graph.nearestWalkable(this.x, this.z, 1.5);
    if (!start) return { ok: false, approximate: false, reason: 'no-walkable-start' };
    let dest: Point2 | null = this.graph.isBlocked(target.x, target.z) ? null : { x: target.x, z: target.z };
    let approximate = false;
    let result = dest ? this.graph.findPath({ x: this.x, z: this.z }, dest) : null;
    if (!result) {
      if (!allowApproximate) return { ok: false, approximate: false, reason: dest ? 'no-path' : 'target-blocked' };
      // Walk to the closest cell the body can actually reach, not through walls.
      const reachable = this.graph.reachableFrom(start);
      let best: Point2 | null = null;
      let bestD = Infinity;
      for (const c of reachable) {
        const d = Math.hypot(c.x - target.x, c.z - target.z);
        if (d < bestD - 1e-9) { bestD = d; best = c; }
      }
      if (!best) return { ok: false, approximate: false, reason: 'no-path' };
      dest = best;
      approximate = true;
      result = this.graph.findPath({ x: this.x, z: this.z }, dest);
      if (!result) return { ok: false, approximate: false, reason: 'no-path' };
    }
    this.path = result.points;
    this.index = 1;
    this.goal = dest!;
    this.requested = { x: target.x, z: target.z };
    this.stuckSeconds = 0;
    this.recoveries = 0;
    this.repathTimer = 0.75;
    return { ok: true, approximate };
  }

  /** Advance along the path. Returns the distance actually moved. */
  update(dt: number, speed: number): number {
    if (this.repathTimer > 0) this.repathTimer -= dt;
    if (this.arrived) return 0;
    let remaining = speed * dt;
    let moved = 0;
    while (remaining > 1e-6 && this.index < this.path.length) {
      const wp = this.path[this.index];
      const dx = wp.x - this.x;
      const dz = wp.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) { this.index++; continue; }
      const step = Math.min(remaining, dist);
      const nx = this.x + (dx / dist) * step;
      const nz = this.z + (dz / dist) * step;
      let ox = this.x;
      let oz = this.z;
      if (!this.graph.isBlocked(nx, nz)) { ox = nx; oz = nz; }
      else if (!this.graph.isBlocked(nx, this.z)) ox = nx;
      else if (!this.graph.isBlocked(this.x, nz)) oz = nz;
      const got = Math.hypot(ox - this.x, oz - this.z);
      if (got < 1e-6) break;
      this.heading = Math.atan2(-(dx / dist), -(dz / dist));
      this.x = ox;
      this.z = oz;
      moved += got;
      remaining -= got;
      if (got < step - 1e-6) break;
    }
    if (moved < speed * dt * 0.25) {
      this.stuckSeconds += dt;
      if (this.stuckSeconds > 0.8) this.recover();
    } else {
      this.stuckSeconds = 0;
    }
    return moved;
  }

  /** Stuck recovery: repath from the current spot; after three failures drop the goal so the brain picks a new one. */
  private recover(): void {
    this.stuckSeconds = 0;
    this.recoveries++;
    const requested = this.requested;
    if (!requested || this.recoveries > 3) {
      this.clearGoalKeepRecoveries();
      return;
    }
    this.repathTimer = 0;
    const count = this.recoveries;
    this.setGoal(requested, true);
    this.recoveries = count;
  }

  private clearGoalKeepRecoveries(): void {
    const count = this.recoveries;
    this.clearGoal();
    this.recoveries = count;
  }
}
