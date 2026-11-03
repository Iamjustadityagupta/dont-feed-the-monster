
export interface Vec2 {
  x: number;
  z: number;
}

export interface AabbBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SolidVolume extends AabbBounds {
  id: string;
  blocksSight: boolean;
}

export interface DoorVolume extends SolidVolume {
  isOpen: () => boolean;
  label?: string;
}

export interface CrawlspaceVolume extends AabbBounds {
  id: string;
  minHeight: number;
  isOpen: () => boolean;
}

export interface LockerVolume extends AabbBounds {
  id: string;
  facing: Vec2;
  label?: string;
}

export type InteractableKind =
  | 'pickup'
  | 'door'
  | 'console'
  | 'note'
  | 'exit';

export interface InteractableVolume {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: InteractableKind;
  label: string;
  enabled: () => boolean;
}

export interface CollisionGeometry {
  solids: SolidVolume[];
  doors: DoorVolume[];
  crawlspaces: CrawlspaceVolume[];
  lockers: LockerVolume[];
  interactables: InteractableVolume[];
  bounds: AabbBounds;
}

export interface ActorShape {
  radius: number;
  height: number;
}

export interface MoveOptions {
  ignoreIds?: ReadonlySet<string>;
}

export interface MoveResult {
  position: Vec2;
  blockedX: boolean;
  blockedZ: boolean;
  hitIds: string[];
}

export interface RaycastHit {
  id: string;
  distance: number;
  point: Vec2;
}
