
import { Logger } from '../core/Logger';

import type {
  ActorShape,
  AabbBounds,
  CollisionGeometry,
  InteractableVolume,
  LockerVolume,
  MoveOptions,
  MoveResult,
  RaycastHit,
  SolidVolume,
  Vec2,
} from './CollisionTypes';

const EPS = 1e-4;
const MIN_STEP = 0.05;

const clamp = (
  value: number,
  min: number,
  max: number,
): number => Math.max(min, Math.min(max, value));

export const circleIntersectsAabb = (
  cx: number,
  cz: number,
  radius: number,
  box: AabbBounds,
): boolean => {
  const nx = clamp(cx, box.minX, box.maxX);
  const nz = clamp(cz, box.minZ, box.maxZ);
  const dx = cx - nx;
  const dz = cz - nz;

  return dx * dx + dz * dz < radius * radius;
};

/** Returns segment entry fraction in [0, 1], or null. */
const segmentIntersectsAabb = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  box: AabbBounds,
): number | null => {
  const dx = bx - ax;
  const dz = bz - az;

  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < EPS) {
    if (ax < box.minX || ax > box.maxX) {
      return null;
    }
  } else {
    const t1 = (box.minX - ax) / dx;
    const t2 = (box.maxX - ax) / dx;

    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (Math.abs(dz) < EPS) {
    if (az < box.minZ || az > box.maxZ) {
      return null;
    }
  } else {
    const t1 = (box.minZ - az) / dz;
    const t2 = (box.maxZ - az) / dz;

    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (tMax < tMin) {
    return null;
  }

  return tMin;
};

export class CollisionWorld {
  private readonly log = new Logger({
    namespace: 'collision',
  });

  private debugEnabled = false;

  constructor(
    private readonly geometry: CollisionGeometry,
  ) {}

  get bounds(): AabbBounds {
    return this.geometry.bounds;
  }

  get lockers(): readonly LockerVolume[] {
    return this.geometry.lockers;
  }

  get interactables(): readonly InteractableVolume[] {
    return this.geometry.interactables;
  }

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  private movementBlockers(): SolidVolume[] {
    const blockers = this.geometry.solids.slice();

    for (const door of this.geometry.doors) {
      if (!door.isOpen()) {
        blockers.push(door);
      }
    }

    return blockers;
  }

  private sightBlockers(): SolidVolume[] {
    const blockers: SolidVolume[] = [];

    for (const solid of this.geometry.solids) {
      if (solid.blocksSight) {
        blockers.push(solid);
      }
    }

    for (const door of this.geometry.doors) {
      if (!door.isOpen()) {
        blockers.push(door);
      }
    }

    return blockers;
  }

  private collectHits(
    x: number,
    z: number,
    radius: number,
    ignoreIds: ReadonlySet<string> | undefined,
    sink: Set<string>,
  ): void {
    for (const box of this.movementBlockers()) {
      if (ignoreIds?.has(box.id)) {
        continue;
      }

      if (circleIntersectsAabb(x, z, radius, box)) {
        sink.add(box.id);
      }
    }
  }

  circleBlocked(
    x: number,
    z: number,
    radius: number,
    ignoreIds?: ReadonlySet<string>,
  ): boolean {
    const bounds = this.geometry.bounds;

    if (
      x - radius < bounds.minX ||
      x + radius > bounds.maxX ||
      z - radius < bounds.minZ ||
      z + radius > bounds.maxZ
    ) {
      return true;
    }

    for (const box of this.movementBlockers()) {
      if (ignoreIds?.has(box.id)) {
        continue;
      }

      if (circleIntersectsAabb(x, z, radius, box)) {
        return true;
      }
    }

    return false;
  }

  moveCircle(
    position: Vec2,
    delta: Vec2,
    radius: number,
    options: MoveOptions = {},
  ): MoveResult {
    const stepLength = Math.max(radius * 0.5, MIN_STEP);
    const distance = Math.hypot(delta.x, delta.z);
    const steps = Math.max(
      1,
      Math.ceil(distance / stepLength),
    );

    const stepX = delta.x / steps;
    const stepZ = delta.z / steps;
    const hits = new Set<string>();

    let x = position.x;
    let z = position.z;
    let blockedX = false;
    let blockedZ = false;

    for (let i = 0; i < steps; i += 1) {
      if (stepX !== 0) {
        const nextX = x + stepX;

        if (
          this.circleBlocked(
            nextX,
            z,
            radius,
            options.ignoreIds,
          )
        ) {
          blockedX = true;

          this.collectHits(
            nextX,
            z,
            radius,
            options.ignoreIds,
            hits,
          );
        } else {
          x = nextX;
        }
      }

      if (stepZ !== 0) {
        const nextZ = z + stepZ;

        if (
          this.circleBlocked(
            x,
            nextZ,
            radius,
            options.ignoreIds,
          )
        ) {
          blockedZ = true;

          this.collectHits(
            x,
            nextZ,
            radius,
            options.ignoreIds,
            hits,
          );
        } else {
          z = nextZ;
        }
      }
    }

    if (this.debugEnabled && (blockedX || blockedZ)) {
      this.log.debug('move blocked', {
        blockedX,
        blockedZ,
        hitIds: [...hits],
      });
    }

    return {
      position: { x, z },
      blockedX,
      blockedZ,
      hitIds: [...hits],
    };
  }

  hasClearance(
    position: Vec2,
    shape: ActorShape,
  ): boolean {
    if (
      this.circleBlocked(
        position.x,
        position.z,
        shape.radius,
      )
    ) {
      return false;
    }

    for (const crawl of this.geometry.crawlspaces) {
      if (!crawl.isOpen()) {
        continue;
      }

      if (
        circleIntersectsAabb(
          position.x,
          position.z,
          shape.radius * 0.9,
          crawl,
        ) &&
        shape.height > crawl.minHeight
      ) {
        return false;
      }
    }

    return true;
  }

  hasLineOfSight(from: Vec2, to: Vec2): boolean {
    for (const box of this.sightBlockers()) {
      if (
        segmentIntersectsAabb(
          from.x,
          from.z,
          to.x,
          to.z,
          box,
        ) !== null
      ) {
        return false;
      }
    }

    return true;
  }

  raycast(from: Vec2, to: Vec2): RaycastHit | null {
    let best: RaycastHit | null = null;

    const totalDistance = Math.hypot(
      to.x - from.x,
      to.z - from.z,
    );

    for (const box of this.sightBlockers()) {
      const t = segmentIntersectsAabb(
        from.x,
        from.z,
        to.x,
        to.z,
        box,
      );

      if (t === null) {
        continue;
      }

      const distance = t * totalDistance;

      if (best !== null && distance >= best.distance) {
        continue;
      }

      best = {
        id: box.id,
        distance,
        point: {
          x: from.x + (to.x - from.x) * t,
          z: from.z + (to.z - from.z) * t,
        },
      };
    }

    return best;
  }

  findNearestInteractable(
    position: Vec2,
    maxDistance: number,
    kind?: InteractableVolume['kind'],
  ): InteractableVolume | null {
    let best: InteractableVolume | null = null;
    let bestDistance = maxDistance;

    for (const item of this.geometry.interactables) {
      if (!item.enabled()) {
        continue;
      }

      if (kind !== undefined && item.kind !== kind) {
        continue;
      }

      const distance = Math.hypot(
        item.x - position.x,
        item.z - position.z,
      );

      if (distance <= bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }

    return best;
  }

  findLockerContaining(
    position: Vec2,
    maxDistance = 0.9,
  ): LockerVolume | null {
    for (const locker of this.geometry.lockers) {
      if (
        circleIntersectsAabb(
          position.x,
          position.z,
          maxDistance,
          locker,
        )
      ) {
        return locker;
      }
    }

    return null;
  }

  nearestWalkablePoint(
    position: Vec2,
    radius: number,
    maxRings = 24,
    ringStep = 0.25,
  ): Vec2 | null {
    if (!this.circleBlocked(position.x, position.z, radius)) {
      return { x: position.x, z: position.z };
    }

    for (let ring = 1; ring <= maxRings; ring += 1) {
      const distance = ring * ringStep;
      const samples = 8 * ring;

      for (let i = 0; i < samples; i += 1) {
        const angle = (i / samples) * Math.PI * 2;
        const x = position.x + Math.cos(angle) * distance;
        const z = position.z + Math.sin(angle) * distance;

        if (!this.circleBlocked(x, z, radius)) {
          return { x, z };
        }
      }
    }

    return null;
  }

  isWalkable(position: Vec2, radius: number): boolean {
    return !this.circleBlocked(
      position.x,
      position.z,
      radius,
    );
  }

  debugSummary(): Record<string, number> {
    return {
      solids: this.geometry.solids.length,
      doorsClosed: this.geometry.doors.filter(
        (door) => !door.isOpen(),
      ).length,
      crawlspaces: this.geometry.crawlspaces.length,
      lockers: this.geometry.lockers.length,
      interactables: this.geometry.interactables.length,
    };
  }
}
