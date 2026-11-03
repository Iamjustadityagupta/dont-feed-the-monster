
import type {
  CollisionGeometry,
  DoorVolume,
  SolidVolume,
  Vec2,
} from './CollisionTypes';

import { Logger } from '../core/Logger';

const log = new Logger({ namespace: 'geometry' });

export interface RawBox {
  id?: string;
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  x?: number;
  z?: number;
  width?: number;
  depth?: number;
  blocksSight?: boolean;
  isOpen?: () => boolean;
  label?: string;
}

export interface RawSegment {
  id?: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  thickness?: number;
  blocksSight?: boolean;
  isOpen?: () => boolean;
  label?: string;
}

export interface RawCrawlspace extends RawBox {
  minHeight?: number;
}

export interface RawLocker extends RawBox {
  facing?: Vec2;
}

export type RawVolume = RawBox | RawSegment;

export interface RawInteractable {
  id: string;
  x: number;
  z: number;
  radius?: number;
  kind?: 'pickup' | 'door' | 'console' | 'note' | 'exit';
  label?: string;
  enabled?: () => boolean;
}

export interface RawLevelLayout {
  WALLS?: RawVolume[];
  SOLIDS?: RawVolume[];
  DOORS?: RawVolume[];
  CRAWLSPACES?: RawCrawlspace[];
  LOCKERS?: RawLocker[];
  INTERACTABLES?: RawInteractable[];
  BOUNDS?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

interface BoxCoordinates {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const isSegment = (box: RawVolume): box is RawSegment =>
  'x1' in box &&
  typeof box.x1 === 'number' &&
  typeof box.z1 === 'number' &&
  typeof box.x2 === 'number' &&
  typeof box.z2 === 'number';

const toAabb = (box: RawVolume): BoxCoordinates => {
  if (isSegment(box)) {
    const thickness = (box.thickness ?? 0.3) / 2;

    return {
      minX: Math.min(box.x1, box.x2) - thickness,
      maxX: Math.max(box.x1, box.x2) + thickness,
      minZ: Math.min(box.z1, box.z2) - thickness,
      maxZ: Math.max(box.z1, box.z2) + thickness,
    };
  }

  if (
    box.minX !== undefined &&
    box.maxX !== undefined &&
    box.minZ !== undefined &&
    box.maxZ !== undefined
  ) {
    return {
      minX: box.minX,
      maxX: box.maxX,
      minZ: box.minZ,
      maxZ: box.maxZ,
    };
  }

  if (
    box.x !== undefined &&
    box.z !== undefined &&
    box.width !== undefined &&
    box.depth !== undefined
  ) {
    return {
      minX: box.x - box.width / 2,
      maxX: box.x + box.width / 2,
      minZ: box.z - box.depth / 2,
      maxZ: box.z + box.depth / 2,
    };
  }

  throw new Error(
    `Unresolvable box in level layout: ${JSON.stringify(box)}`,
  );
};

const normalizeFacing = (
  facing: Vec2 | undefined,
): Vec2 => {
  if (!facing) {
    return { x: 0, z: 1 };
  }

  const length = Math.hypot(facing.x, facing.z);

  if (length < 1e-8) {
    return { x: 0, z: 1 };
  }

  return {
    x: facing.x / length,
    z: facing.z / length,
  };
};

export function buildCollisionGeometry(
  layout: RawLevelLayout,
  index = 0,
): CollisionGeometry {
  const solids: SolidVolume[] = [];
  const doors: DoorVolume[] = [];

  let generatedId = 0;

  const nextId = (
    prefix: string,
    explicit?: string,
  ): string => explicit ?? `${prefix}-${index}-${generatedId++}`;

  for (const raw of [
    ...(layout.WALLS ?? []),
    ...(layout.SOLIDS ?? []),
  ]) {
    const box = toAabb(raw);

    solids.push({
      id: nextId('solid', raw.id),
      ...box,
      blocksSight: raw.blocksSight ?? true,
    });
  }

  for (const raw of layout.DOORS ?? []) {
    const box = toAabb(raw);

    doors.push({
      id: nextId('door', raw.id),
      ...box,
      blocksSight: true,
      isOpen: raw.isOpen ?? (() => false),
      label: raw.label,
    });
  }

  const crawlspaces = (layout.CRAWLSPACES ?? []).map(
    (raw) => ({
      id: nextId('crawl', raw.id),
      ...toAabb(raw),
      minHeight: raw.minHeight ?? 0.95,
      isOpen: raw.isOpen ?? (() => true),
    }),
  );

  const lockers = (layout.LOCKERS ?? []).map(
    (raw) => ({
      id: nextId('locker', raw.id),
      ...toAabb(raw),
      facing: normalizeFacing(raw.facing),
      label: raw.label,
    }),
  );

  const interactables = (
    layout.INTERACTABLES ?? []
  ).map((raw) => ({
    id: raw.id,
    x: raw.x,
    z: raw.z,
    radius: raw.radius ?? 1.6,
    kind: raw.kind ?? 'pickup',
    label: raw.label ?? 'Interact',
    enabled: raw.enabled ?? (() => true),
  }));

  if (solids.length === 0) {
    log.warn(
      'layout produced no solids; verify the level layout',
    );
  }

  return {
    solids,
    doors,
    crawlspaces,
    lockers,
    interactables,
    bounds: layout.BOUNDS ?? {
      minX: -100,
      maxX: 100,
      minZ: -100,
      maxZ: 100,
    },
  };
}
