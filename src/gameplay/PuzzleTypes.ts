/**
 * PuzzleTypes.ts - pure type + configuration module for the facility puzzle architecture.
 *
 * Rules for this file:
 *  - No imports of WorldManager, PlayerController, THREE or any class module (prevents circular imports).
 *  - Only type-only imports from '../core/types' and '../save/SaveManager', plus value re-exports of
 *    constants that already live in '../core/types'. Nothing here has side effects.
 *  - Identifiers, stages and progress records that already exist in core/types.ts are RE-EXPORTED, never
 *    redeclared, so there is exactly one definition of each.
 *
 * Puzzle chain (matches core/types PUZZLE_STAGE_ORDER and LevelLayout):
 *   20 drawers -> 3 keys -> 3 locks on the access door -> 3 fragments -> combine (Q) -> combination box
 *   -> room key -> keycard-room door -> password paper -> password locker -> keycard -> exit.
 */

import type {
  DrawerId,
  DrawerKeyId,
  DrawerState,
  FragmentId,
  InventoryItemType,
  LockId,
  LockState,
  PuzzleItemId,
  PuzzleObjectId,
  PuzzleProgress,
  PuzzleStage,
  KeycardState,
  DrawerStateRecord,
  KeycardStateRecord,
  PasswordLockerStateRecord,
  FragmentStateRecord,
  LockStateRecord,
  PuzzleEventName,
  PuzzleItemDefinition,
} from '../core/types';

/* ==========================================================================
 * Re-exports of the existing single source of truth (core/types.ts)
 * ========================================================================== */

export type {
  DrawerId,
  DrawerKeyId,
  DrawerState,
  DrawerContent,
  FragmentId,
  LockId,
  LockState,
  KeycardState,
  PuzzleItemId,
  PuzzleItemKind,
  PuzzleItemDefinition,
  PuzzleObjectId,
  PuzzleStage,
  PuzzleStageChange,
  PuzzlePromptSpec,
  PuzzleActionResult,
  PuzzleFailureReason,
  PuzzleEventName,
  PuzzleEventPayloadMap,
  PuzzleEventHandler,
  PuzzleProgress,
  InventoryItem,
  InventoryItemType,
  DrawerStateRecord,
  LockStateRecord,
  FragmentStateRecord,
  KeycardStateRecord,
  PasswordLockerStateRecord,
  SeededRandom,
} from '../core/types';

export {
  PUZZLE_STAGE_ORDER,
  puzzleStageIndex,
  PUZZLE_SNAPSHOT_VERSION,
  PUZZLE_INTERACT_DISTANCE,
  PUZZLE_RAY_LENGTH,
  PUZZLE_NOISE,
  DRAWER_COUNT,
  KEY_COUNT,
  FRAGMENT_COUNT,
  PAPER_COUNT,
  PAPER_PASSWORD_ID,
} from '../core/types';

/** Persisted (localStorage) puzzle format owned by SaveManager. Re-exported so puzzle code has one import site. */
export type { PuzzleSaveData, DrawerSave } from '../save/SaveManager';

/* ==========================================================================
 * New stable identifiers
 * ========================================================================== */

/** Room ids as used by LevelLayout RoomSpec.id ('decon', 'records', ...). */
export type PuzzleRoomId = string;

/** Every door the puzzle chain can lock. `exit_door` is the final keycard exit. */
export type RoomDoorId = 'access_door' | 'keycard_room_door' | 'exit_door';

export type CombinationBoxId = 'combination_box';
export type PasswordLockerId = 'password_locker';
export type KeycardRewardId = 'keycard';

/** Items the player may hold; the keycard and room key are items too, so one union covers the inventory. */
export type PuzzleInventoryItemId = PuzzleItemId;

/** Items that can be consumed by a lock/door/box when used. */
export type ConsumablePuzzleItemId = DrawerKeyId | 'room_key' | 'keycard';

export type RoomDoorState = 'locked' | 'unlocked';
export type CombinationBoxState = 'closed' | 'open';
export type LockerLidState = 'closed' | 'open';

/** Same literals as LevelLayout's Facing, so LevelLayout specs are structurally assignable to these types. */
export type PuzzleFacing = '+z' | '-z' | '+x' | '-x';
export type PuzzleWallAxis = 'x' | 'z';

/** Anything that can be physically interacted with has one of these categories. */
export type PuzzleObjectCategory =
  | 'drawer'
  | 'lock'
  | 'fragment'
  | 'box'
  | 'door'
  | 'locker'
  | 'keycard';

/** Noise keys used by PUZZLE_NOISE (core/types). */
export type PuzzleNoiseKey = 'drawer' | 'lock' | 'fragment' | 'box' | 'locker' | 'door';

/* ==========================================================================
 * Readonly configuration types (data only; meshes are built elsewhere)
 * ========================================================================== */

export interface PuzzlePoint2 {
  readonly x: number;
  readonly z: number;
}

export interface DrawerDefinition extends PuzzlePoint2 {
  readonly id: DrawerId;
  readonly facing: PuzzleFacing;
  readonly roomId: PuzzleRoomId;
  readonly label: string;
}

export interface KeyDefinition {
  readonly id: DrawerKeyId;
  readonly label: string;
  /** The lock this key opens. */
  readonly lockId: LockId;
}

/** One keyed lock (tumbler). Each lock accepts exactly one key. */
export interface KeyedLockDefinition extends PuzzlePoint2 {
  readonly id: LockId;
  readonly accepts: DrawerKeyId;
  readonly axis: PuzzleWallAxis;
  /** The door this lock belongs to. */
  readonly doorId: string;
  /** Whether the key leaves the inventory when used. */
  readonly consumesKey: boolean;
}

export interface FragmentDefinition extends PuzzlePoint2 {
  readonly id: FragmentId;
  readonly label: string;
  /** Height of the surface the fragment rests on. */
  readonly surfaceY: number;
  readonly roomId: PuzzleRoomId;
}

export interface CombinationBoxDefinition extends PuzzlePoint2 {
  readonly id: CombinationBoxId;
  readonly label: string;
  readonly roomId: PuzzleRoomId;
  /** All of these must be combined before the box can be opened. */
  readonly requiredFragments: readonly FragmentId[];
  /** Item produced by combining the fragments. */
  readonly combinedItemId: 'combined_object';
  /** Item revealed when the box opens. */
  readonly rewardItemId: 'room_key';
}

/**
 * A door that stays shut until its condition is met.
 *  - 'multi_lock': every listed lock must be unlocked (the restricted-room access door).
 *  - 'keyed': one inventory item opens it (the keycard-room door, opened by the room key).
 *  - 'keycard': the final exit, opened by the keycard.
 */
export type RoomDoorRequirement =
  | { readonly kind: 'multi_lock'; readonly lockIds: readonly LockId[] }
  | { readonly kind: 'keyed'; readonly itemId: 'room_key'; readonly consumesItem: boolean }
  | { readonly kind: 'keycard'; readonly itemId: 'keycard'; readonly consumesItem: boolean };

export interface RoomDoorDefinition extends PuzzlePoint2 {
  readonly id: RoomDoorId;
  readonly label: string;
  readonly roomId: PuzzleRoomId;
  readonly requirement: RoomDoorRequirement;
  /** Stage the player must have reached before this door will respond at all. */
  readonly minimumStage: PuzzleStage;
}

export interface PasswordLockerDefinition extends PuzzlePoint2 {
  readonly id: PasswordLockerId;
  readonly label: string;
  readonly roomId: PuzzleRoomId;
  /** Document id of the paper that teaches the code (see PAPER_PASSWORD_ID). */
  readonly passwordPaperId: string;
  readonly codeLength: number;
  /** null = unlimited attempts. */
  readonly maxAttempts: number | null;
  /** What opens when the code is correct. */
  readonly rewardId: KeycardRewardId;
}

export interface KeycardRewardDefinition extends PuzzlePoint2 {
  readonly id: KeycardRewardId;
  readonly itemId: 'keycard';
  readonly label: string;
  readonly roomId: PuzzleRoomId;
  readonly y: number;
  /** The reward only exists once this container is opened. */
  readonly spawnsFrom: PasswordLockerId;
}

/* ==========================================================================
 * Stage progression configuration
 * ========================================================================== */

/** Events that may advance the stage machine; every one is an existing PuzzleEventName. */
export type PuzzleStageTrigger = Extract<
  PuzzleEventName,
  | 'puzzle:drawer-opened'
  | 'puzzle:key-collected'
  | 'puzzle:lock-unlocked'
  | 'puzzle:fragment-collected'
  | 'puzzle:fragments-combined'
  | 'puzzle:box-opened'
  | 'puzzle:room-key-taken'
  | 'puzzle:locker-unlocked'
  | 'puzzle:keycard-collected'
>;

export interface PuzzleStageTransitionRule {
  readonly from: PuzzleStage;
  readonly to: PuzzleStage;
  readonly trigger: PuzzleStageTrigger;
  /** Optional counter that must be reached; omitted = the first trigger advances. */
  readonly requiresCount?: number;
}

export const PUZZLE_STAGE_TRANSITIONS: readonly PuzzleStageTransitionRule[] = [
  { from: 'explore', to: 'find_keys', trigger: 'puzzle:drawer-opened' },
  { from: 'find_keys', to: 'unlock_access_door', trigger: 'puzzle:key-collected', requiresCount: 3 },
  { from: 'unlock_access_door', to: 'collect_fragments', trigger: 'puzzle:lock-unlocked', requiresCount: 3 },
  { from: 'collect_fragments', to: 'combine_and_open_box', trigger: 'puzzle:fragment-collected', requiresCount: 3 },
  { from: 'combine_and_open_box', to: 'take_room_key', trigger: 'puzzle:box-opened' },
  { from: 'take_room_key', to: 'search_papers', trigger: 'puzzle:room-key-taken' },
  { from: 'search_papers', to: 'unlock_locker', trigger: 'puzzle:locker-unlocked' },
  { from: 'unlock_locker', to: 'escape', trigger: 'puzzle:keycard-collected' },
];

/* ==========================================================================
 * Item definitions (inventory catalogue)
 * ========================================================================== */

export const PUZZLE_ITEM_DEFINITIONS: Readonly<Record<PuzzleItemId, PuzzleItemDefinition>> = {
  drawer_key_1: { id: 'drawer_key_1', kind: 'key', label: 'Brass key', iconKey: 'key_brass', stackable: false, sortIndex: 0 },
  drawer_key_2: { id: 'drawer_key_2', kind: 'key', label: 'Steel key', iconKey: 'key_steel', stackable: false, sortIndex: 1 },
  drawer_key_3: { id: 'drawer_key_3', kind: 'key', label: 'Tarnished key', iconKey: 'key_tarnished', stackable: false, sortIndex: 2 },
  fragment_1: { id: 'fragment_1', kind: 'fragment', label: 'Matte fragment', iconKey: 'fragment', stackable: false, sortIndex: 3 },
  fragment_2: { id: 'fragment_2', kind: 'fragment', label: 'Matte fragment', iconKey: 'fragment', stackable: false, sortIndex: 4 },
  fragment_3: { id: 'fragment_3', kind: 'fragment', label: 'Matte fragment', iconKey: 'fragment', stackable: false, sortIndex: 5 },
  combined_object: { id: 'combined_object', kind: 'composite', label: 'Assembled object', iconKey: 'combined', stackable: false, sortIndex: 6 },
  room_key: { id: 'room_key', kind: 'key', label: 'Archive key', iconKey: 'key_archive', stackable: false, sortIndex: 7 },
  keycard: { id: 'keycard', kind: 'access', label: 'Security keycard', iconKey: 'keycard', stackable: false, sortIndex: 8 },
};

/* ==========================================================================
 * Aggregate configuration
 * ========================================================================== */

/** Rules the seeded generator must respect; keeping them here keeps the generator free of magic numbers. */
export interface PuzzleGenerationRules {
  readonly drawerCount: number;
  readonly keyCount: number;
  readonly fragmentCount: number;
  /** At most one key per drawer, and keys never share a drawer. */
  readonly maxKeysPerDrawer: 1;
  /** Fragments are fixed-position props; only keys are randomised. */
  readonly randomiseFragments: false;
  /** Salt passed to Rng.fork() so key placement has its own stream and never shifts other random draws. */
  readonly keyPlacementSalt: string;
}

export const DEFAULT_PUZZLE_GENERATION_RULES: PuzzleGenerationRules = {
  drawerCount: 20,
  keyCount: 3,
  fragmentCount: 3,
  maxKeysPerDrawer: 1,
  randomiseFragments: false,
  keyPlacementSalt: 'puzzle:key-placement',
};

/** Complete, immutable puzzle definition handed to the puzzle systems. */
export interface PuzzleConfig {
  readonly drawers: readonly DrawerDefinition[];
  readonly keys: readonly KeyDefinition[];
  readonly locks: readonly KeyedLockDefinition[];
  readonly fragments: readonly FragmentDefinition[];
  readonly box: CombinationBoxDefinition;
  readonly doors: readonly RoomDoorDefinition[];
  readonly locker: PasswordLockerDefinition;
  readonly keycard: KeycardRewardDefinition;
  readonly transitions: readonly PuzzleStageTransitionRule[];
  readonly rules: PuzzleGenerationRules;
}

/** Narrow lookup shape so systems can map a PuzzleObjectId to its category without a world reference. */
export type PuzzleObjectCategoryMap = Readonly<Record<PuzzleObjectId, PuzzleObjectCategory>>;

/* ==========================================================================
 * Serializable progress (JSON-safe; no Object3D, no functions, no class instances)
 * ========================================================================== */

export const PUZZLE_PROGRESS_SNAPSHOT_VERSION = 1 as const;

/** InventoryItem minus `mesh`, so it survives JSON.stringify. */
export interface SerializableInventoryItem {
  readonly id: string;
  readonly name: string;
  readonly type: InventoryItemType;
  readonly description?: string;
  readonly collected: boolean;
  readonly puzzleId?: PuzzleItemId;
}

/**
 * PuzzleProgress as declared in core/types lacks `drawersSearched` and `requiredDrawers`,
 * yet gameplay/ObjectiveSystem.ts reads both. This is the superset the objective text needs.
 */
export interface PuzzleProgressState extends PuzzleProgress {
  readonly drawersSearched: number;
  readonly requiredDrawers: number;
}

export interface RoomDoorStateRecord {
  readonly state: RoomDoorState;
}

export interface CombinationBoxStateRecord {
  readonly state: CombinationBoxState;
  readonly fragmentsCombined: boolean;
  readonly roomKeyTaken: boolean;
}

export interface SerializablePuzzleSnapshot {
  readonly version: typeof PUZZLE_PROGRESS_SNAPSHOT_VERSION;
  /** Run seed. Restoring with the same seed and `initialized: true` reproduces the exact key layout. */
  readonly seed: number;
  /** True once the layout has been generated; a restore must never re-roll it. */
  readonly initialized: boolean;
  readonly stage: PuzzleStage;
  readonly drawers: Readonly<Record<DrawerId, DrawerStateRecord>>;
  /** Where each key sits (null once picked up). Cross-checked against `drawers` on load. */
  readonly keyLocations: Readonly<Record<DrawerKeyId, DrawerId | null>>;
  readonly locks: Readonly<Record<LockId, LockStateRecord>>;
  readonly fragments: Readonly<Record<FragmentId, FragmentStateRecord>>;
  readonly box: CombinationBoxStateRecord;
  readonly doors: Readonly<Record<RoomDoorId, RoomDoorStateRecord>>;
  readonly locker: PasswordLockerStateRecord;
  readonly keycard: KeycardStateRecord;
  readonly inventory: readonly SerializableInventoryItem[];
  readonly progress: PuzzleProgressState;
}

/* ==========================================================================
 * Type-level guards for consumers (compile-time only helpers)
 * ========================================================================== */

/** Every state union the puzzle layer uses, for exhaustive switch/Record typing. */
export interface PuzzleStateUnions {
  readonly drawer: DrawerState;
  readonly lock: LockState;
  readonly keycard: KeycardState;
  readonly door: RoomDoorState;
  readonly box: CombinationBoxState;
  readonly locker: LockerLidState;
}