import type { Group, Object3D, Vector3 } from 'three';

export type GameMode =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'caught'
  | 'complete'
  | 'howto';

export type MonsterState =
  | 'PATROL'
  | 'INVESTIGATE'
  | 'SEARCH'
  | 'CHASE'
  | 'RETURN';

export type SoundKind =
  | 'footstep'
  | 'throw'
  | 'door'
  | 'scripted'
  | 'impact';

export interface SoundEvent {
  position: Vector3;
  loudness: number;
  kind: SoundKind;
  time: number;
}

export interface HidingSpot {
  mesh: Group;
  position: Vector3;
  occupied: boolean;
  label: string;
}

export type InteractionCategory = 'paper' | 'solid';

export interface Interactable {
  position: Vector3;
  kind:
    | 'keycard'
    | 'door'
    | 'hiding'
    | 'note'
    /* --- puzzle kinds (appended; existing values unchanged) --- */
    | 'drawer'
    | 'fragment'
    | 'key'
    | 'box'
    | 'keyed_door'
    | 'password_locker';
  label: string;
  active: boolean;
  mesh: Object3D;
  category: InteractionCategory;
  text?: string;
  /* --- optional puzzle payload --- */
  objectId?: PuzzleObjectId;
  requiresItem?: PuzzleItemId;
  consumesItem?: boolean;
}

/** Types for the new inventory and puzzle gameplay. */

export type InventoryItemType =
  | 'object'
  | 'key'
  | 'keycard'
  /* --- appended --- */
  | 'fragment'
  | 'composite';

export interface InventoryItem {
  id: string;
  name: string;
  type: InventoryItemType;
  description?: string;
  mesh?: Object3D;
  collected: boolean;
  /** Typed link when the item belongs to the puzzle set. */
  puzzleId?: PuzzleItemId;
}

export interface PuzzleProgress {
  hiddenObjectsCollected: number;
  requiredHiddenObjects: number;
  hasRoomKey: boolean;
  hasKeycard: boolean;
  passwordFound: boolean;
  drawerKeysCollected: number;
  requiredDrawerKeys: number;
  locksUnlocked: number;
  requiredLocks: number;
  escaped: boolean;
  /* --- appended --- */
  stage: PuzzleStage;
  fragmentsCollected: number;
  requiredFragments: number;
  fragmentsCombined: boolean;
  boxOpened: boolean;
  roomKeyTaken: boolean;
  accessDoorUnlocked: boolean;
  keycardRoomDoorUnlocked: boolean;
  lockerUnlocked: boolean;
  keycardState: KeycardState;
  papersRead: number;
  passwordAttempts: number;
  /* --- appended: ObjectiveSystem.ts already reads these; PuzzleProgress was missing them --- */
  drawersSearched: number;
  requiredDrawers: number;
}

export const DEFAULT_PUZZLE_PROGRESS: PuzzleProgress = {
  hiddenObjectsCollected: 0,
  requiredHiddenObjects: 3,
  hasRoomKey: false,
  hasKeycard: false,
  passwordFound: false,
  drawerKeysCollected: 0,
  requiredDrawerKeys: 3,
  locksUnlocked: 0,
  requiredLocks: 3,
  escaped: false,
  stage: 'explore',
  fragmentsCollected: 0,
  requiredFragments: 3,
  fragmentsCombined: false,
  boxOpened: false,
  roomKeyTaken: false,
  accessDoorUnlocked: false,
  keycardRoomDoorUnlocked: false,
  lockerUnlocked: false,
  keycardState: 'in_locker',
  papersRead: 0,
  passwordAttempts: 0,
  drawersSearched: 0,
  requiredDrawers: 20
};

/* ==========================================================================
 * PUZZLE SYSTEM
 * ========================================================================== */

/* ---------- identifiers ---------- */

export type PuzzleItemId =
  | 'drawer_key_1'
  | 'drawer_key_2'
  | 'drawer_key_3'
  | 'fragment_1'
  | 'fragment_2'
  | 'fragment_3'
  | 'combined_object'
  | 'room_key'
  | 'keycard';

export type DrawerKeyId =
  | 'drawer_key_1'
  | 'drawer_key_2'
  | 'drawer_key_3';

export type FragmentId = 'fragment_1' | 'fragment_2' | 'fragment_3';

export type DrawerId =
  | 'drawer_01'
  | 'drawer_02'
  | 'drawer_03'
  | 'drawer_04'
  | 'drawer_05'
  | 'drawer_06'
  | 'drawer_07'
  | 'drawer_08'
  | 'drawer_09'
  | 'drawer_10'
  | 'drawer_11'
  | 'drawer_12'
  | 'drawer_13'
  | 'drawer_14'
  | 'drawer_15'
  | 'drawer_16'
  | 'drawer_17'
  | 'drawer_18'
  | 'drawer_19'
  | 'drawer_20';

export type LockId = 'lock_1' | 'lock_2' | 'lock_3';

export type DrawerContent = DrawerKeyId | null;

export type PuzzleObjectId =
  | DrawerId
  | LockId
  | FragmentId
  | 'combination_box'
  | 'access_door'
  | 'keycard_room_door'
  | 'password_locker'
  | 'exit_door'
  /* --- appended: WorldManager.registerPuzzleInteractable('keycard', ...) and LevelLayout's
   *     KEYCARD_REWARD ({ id: 'keycard', ... }) already reference this id; it was missing
   *     from the union, which made both call sites a type error. --- */
  | 'keycard';

/* ---------- progression ---------- */

export type PuzzleStage =
  | 'explore'
  | 'find_keys'
  | 'unlock_access_door'
  | 'collect_fragments'
  | 'combine_and_open_box'
  | 'take_room_key'
  | 'search_papers'
  | 'unlock_locker'
  | 'escape'
  | 'complete';

/** Authoritative ordering; compare with indexOf, never string ordering. */
export const PUZZLE_STAGE_ORDER: readonly PuzzleStage[] = [
  'explore',
  'find_keys',
  'unlock_access_door',
  'collect_fragments',
  'combine_and_open_box',
  'take_room_key',
  'search_papers',
  'unlock_locker',
  'escape',
  'complete'
];

export function puzzleStageIndex(stage: PuzzleStage): number {
  return PUZZLE_STAGE_ORDER.indexOf(stage);
}

export type DrawerState = 'closed' | 'open';

export type LockState = 'locked' | 'unlocked';

export type KeycardState = 'in_locker' | 'collected' | 'used';

/* ---------- item definitions ---------- */

export type PuzzleItemKind = 'key' | 'fragment' | 'composite' | 'access';

export interface PuzzleItemDefinition {
  id: PuzzleItemId;
  kind: PuzzleItemKind;
  label: string;
  iconKey: string;
  stackable: boolean;
  sortIndex: number;
}

/* ---------- interaction descriptors ---------- */

export interface PuzzlePromptSpec {
  objectId: PuzzleObjectId;
  prompt: string;
  actionable: boolean;
}

/* ---------- state records ---------- */

export interface DrawerStateRecord {
  state: DrawerState;
  content: DrawerContent;
  searched: boolean;
}

export interface LockStateRecord {
  state: LockState;
  accepts: DrawerKeyId;
}

export interface FragmentStateRecord {
  collected: boolean;
}

export interface KeycardStateRecord {
  state: KeycardState;
  spawned: boolean;
}

export interface PasswordLockerStateRecord {
  unlocked: boolean;
  attempts: number;
  lastEntry: string;
}

/* ---------- serialisable snapshot ---------- */

export const PUZZLE_SNAPSHOT_VERSION = 1;

export interface PuzzleProgressSnapshot {
  version: typeof PUZZLE_SNAPSHOT_VERSION;
  seed: number;
  stage: PuzzleStage;
  drawers: Record<DrawerId, DrawerStateRecord>;
  locks: Record<LockId, LockStateRecord>;
  fragments: Record<FragmentId, FragmentStateRecord>;
  inventory: InventoryItem[];
  progress: PuzzleProgress;
  locker: PasswordLockerStateRecord;
  keycard: KeycardStateRecord;
}

/* ---------- action results ---------- */

export type PuzzleFailureReason =
  | 'out_of_range'
  | 'already_open'
  | 'already_searched'
  | 'missing_item'
  | 'wrong_item'
  | 'not_ready'
  | 'wrong_password'
  | 'already_unlocked'
  | 'disabled';

export type PuzzleActionResult =
  | { ok: true }
  | { ok: false; reason: PuzzleFailureReason };

export interface PuzzleStageChange {
  from: PuzzleStage;
  to: PuzzleStage;
}

/* ---------- seeded randomness contract ---------- */

export interface SeededRandom {
  next(): number;
  int(min: number, max: number): number;
  shuffle<T>(input: readonly T[]): T[];
}

/* ---------- events ---------- */

export type PuzzleEventName =
  | 'puzzle:stage'
  | 'puzzle:drawer-opened'
  | 'puzzle:key-collected'
  | 'puzzle:lock-unlocked'
  | 'puzzle:fragment-collected'
  | 'puzzle:fragments-combined'
  | 'puzzle:box-opened'
  | 'puzzle:room-key-taken'
  | 'puzzle:locker-unlocked'
  | 'puzzle:keycard-collected'
  | 'puzzle:failed';

export interface PuzzleEventPayloadMap {
  'puzzle:stage': PuzzleStageChange;
  'puzzle:drawer-opened': { drawerId: DrawerId; hadKey: boolean };
  'puzzle:key-collected': { keyId: DrawerKeyId };
  'puzzle:lock-unlocked': { lockId: LockId };
  'puzzle:fragment-collected': { fragmentId: FragmentId };
  'puzzle:fragments-combined': { itemId: 'combined_object' };
  'puzzle:box-opened': { itemId: 'room_key' };
  'puzzle:room-key-taken': { itemId: 'room_key' };
  'puzzle:locker-unlocked': { objectId: 'password_locker' };
  'puzzle:keycard-collected': { itemId: 'keycard' };
  'puzzle:failed': { objectId: PuzzleObjectId; reason: PuzzleFailureReason };
}

export type PuzzleEventHandler<K extends PuzzleEventName> = (
  payload: PuzzleEventPayloadMap[K]
) => void;

/* ---------- tuning ---------- */

export const PUZZLE_INTERACT_DISTANCE = 2.2;
export const PUZZLE_RAY_LENGTH = 2.6;

/** Loudness pushed into SoundEventSystem on use, so MonsterPerception reacts. */
export const PUZZLE_NOISE: Readonly<Record<string, number>> = {
  drawer: 0.35,
  lock: 0.5,
  fragment: 0.15,
  box: 0.45,
  locker: 0.4,
  door: 0.65
};

export const DRAWER_COUNT = 20;
export const KEY_COUNT = 3;
export const FRAGMENT_COUNT = 3;

export const PAPER_COUNT = 45;
/**
 * Must match DocumentRegistry's PASSWORD_LOCKER_CONFIG.clueDocumentId /
 * PaperPlacements' entry exactly — both already use 'doc_security_password'.
 * (Was 'doc_locker_password', an id that exists nowhere in DocumentRegistry
 * or PaperPlacements, so GameController's onDocumentCollected check could
 * never fire and notePasswordDiscovered() was unreachable.)
 */
export const PAPER_PASSWORD_ID = 'doc_security_password';