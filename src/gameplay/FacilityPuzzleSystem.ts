import type { Vector3 } from 'three';
import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';
import type {
  DrawerId,
  DrawerKeyId,
  FragmentId,
  Interactable,
  InventoryItem,
  LockId,
  PuzzleActionResult,
  PuzzleEventPayloadMap,
  PuzzleFailureReason,
  PuzzleObjectId,
  PuzzleProgress,
  PuzzleStage,
} from '../core/types';
import {
  DEFAULT_PUZZLE_PROGRESS,
  DRAWER_COUNT,
  FRAGMENT_COUNT,
  KEY_COUNT,
  PAPER_PASSWORD_ID,
  PUZZLE_INTERACT_DISTANCE,
  PUZZLE_NOISE,
  puzzleStageIndex,
} from '../core/types';

import {
  FragmentCombinationSystem,
  FRAGMENT_IDS,
  type FragmentCombinationSnapshot,
} from './FragmentCombinationSystem';
import { PasswordLocker } from './PasswordLocker';

// Re-export through this module so GameController has a single canonical import
// path for PasswordLocker (avoids casing-related duplicate-file diagnostics).
export { PasswordLocker };

/* ==========================================================================
 * Dependency-injection contracts (Headless + Live WorldManager / PlayerHost)
 * ========================================================================== */

export interface IPuzzleInventory {
  grant?(item: InventoryItem): void;
  add?(item: InventoryItem): void;
  has(itemId: InventoryItem['id']): boolean;
  items?(): readonly InventoryItem[];
  getAll?(): readonly InventoryItem[];
  serialize?(): InventoryItem[];
  snapshot?(): InventoryItem[];
  restore(items: InventoryItem[]): void;
  reset(): void;
}

export interface IDrawerSystem {
  readonly drawerCount?: number;
  open(drawerId: DrawerId): PuzzleActionResult;
  keysFound?(): readonly DrawerKeyId[];
  getFoundKeys?(): readonly DrawerKeyId[];
  allKeysFound?(): boolean;
  serialize?(): unknown;
  snapshot?(): unknown;
  restore(snapshot: unknown): void;
  reset(seed?: number): void;
  dispose?(): void;
}

export interface FacilityWorldAccess {
  /** World-space position of the player, used for interaction-range gating and noise origin. */
  getPlayerPosition(): Vector3;
  distanceToObject(objectId: PuzzleObjectId): number | null;
}

export interface LiveWorldAdapter {
  getPuzzleInteractable(id: PuzzleObjectId): Interactable | undefined;
  setDrawerOpen(id: DrawerId, open: boolean): void;
  setLockUnlocked(id: LockId, unlocked: boolean): void;
  playLockFeedback(id: LockId, ok: boolean): void;
  setFragmentVisible(id: FragmentId, visible: boolean): void;
  setBoxOpen(open: boolean): void;
  setKeyedDoorOpen(open: boolean): void;
  setLockerOpen(open: boolean): void;
  setKeycardVisible(visible: boolean): void;
}

export interface LivePlayerAdapter {
  readonly position: Vector3;
  hasKeycard: boolean;
}

export interface LiveEventBusAdapter {
  emit(event: string, payload?: unknown): void;
}

export interface FacilityPuzzleDeps {
  readonly world: FacilityWorldAccess;
  readonly inventory: IPuzzleInventory;
  readonly drawers: IDrawerSystem;
  /** Pushes a world-space noise event into SoundEventSystem so MonsterPerception can react. */
  readonly onNoise: (position: Vector3, loudness: number) => void;
  /** UI callbacks — orchestrator never touches the DOM or any global browser object directly. */
  readonly ui: {
    setObjective: (text: string) => void;
    showPrompt: (text: string) => void;
    showFailure: (text: string) => void;
  };
  /** True once the player has read the given document id (wire to PaperReader/DocumentRegistry). */
  hasReadDocument(documentId: string): boolean;
  /** Called once when the player reads any document, to tally papersRead for progress tracking. */
  onDocumentRead?: (documentId: string) => void;
  readonly interactDistance?: number;
}

export interface FacilityPuzzleRuntimeConfig {
  readonly world: LiveWorldAdapter;
  readonly player: LivePlayerAdapter;
  readonly inventory: IPuzzleInventory;
  readonly drawers: IDrawerSystem;
  readonly locker: PasswordLocker;
  readonly events: LiveEventBusAdapter;
  readonly seed: number;
  readonly interactDistance?: number;
}

export interface FacilityPuzzleSnapshot {
  version: 1;
  seed?: number;
  progress: PuzzleProgress;
  stage: PuzzleStage;
  locks: Record<LockId, boolean>;
  fragments: FragmentCombinationSnapshot;
  locker: ReturnType<PasswordLocker['serialize']>;
  drawers: unknown;
  inventory: InventoryItem[];
}

const LOCK_IDS: readonly LockId[] = ['lock_1', 'lock_2', 'lock_3'];

function isRuntimeConfig(
  arg: FacilityPuzzleDeps | FacilityPuzzleRuntimeConfig,
): arg is FacilityPuzzleRuntimeConfig {
  return 'player' in arg && 'locker' in arg;
}

function grantToInventory(inv: IPuzzleInventory, item: InventoryItem): void {
  if (typeof inv.grant === 'function') {
    inv.grant(item);
  } else if (typeof inv.add === 'function') {
    inv.add(item);
  }
}

function serializeInventory(inv: IPuzzleInventory): InventoryItem[] {
  if (typeof inv.serialize === 'function') return inv.serialize();
  if (typeof inv.snapshot === 'function') return inv.snapshot();
  if (typeof inv.items === 'function') return [...inv.items()];
  if (typeof inv.getAll === 'function') return [...inv.getAll()];
  return [];
}

function readDrawerKeys(drawers: IDrawerSystem): readonly DrawerKeyId[] {
  if (typeof drawers.keysFound === 'function') return drawers.keysFound();
  if (typeof drawers.getFoundKeys === 'function') return drawers.getFoundKeys();
  return [];
}

function hasAllDrawerKeys(drawers: IDrawerSystem): boolean {
  if (typeof drawers.allKeysFound === 'function') return drawers.allKeysFound();
  return readDrawerKeys(drawers).length >= KEY_COUNT;
}

function serializeDrawers(drawers: IDrawerSystem): unknown {
  if (typeof drawers.serialize === 'function') return drawers.serialize();
  if (typeof drawers.snapshot === 'function') return drawers.snapshot();
  return null;
}

/**
 * Central orchestrator for the facility's escape-room progression:
 *   drawers -> keys -> locks -> fragments -> combine -> box -> room key
 *     -> keycard-room door -> papers -> password -> locker -> keycard -> exit.
 *
 * Owns no meshes. All world access, UI, sound and inventory effects go through
 * injected dependencies so this class stays fully testable headlessly while
 * also integrating seamlessly with GameController and PlayerController.
 */
export class FacilityPuzzleSystem {
  private readonly log = new Logger({ namespace: 'facility-puzzle' });
  readonly events = new EventBus<PuzzleEventPayloadMap>();

  private readonly deps: FacilityPuzzleDeps;
  private readonly liveWorld: LiveWorldAdapter | null;
  private readonly livePlayer: LivePlayerAdapter | null;
  private readonly appEvents: LiveEventBusAdapter | null;

  private readonly fragments: FragmentCombinationSystem;
  private readonly locker: PasswordLocker;

  private readonly locks = new Map<LockId, boolean>(
    LOCK_IDS.map((id): [LockId, boolean] => [id, false]),
  );
  private progress: PuzzleProgress = { ...DEFAULT_PUZZLE_PROGRESS };
  private stage: PuzzleStage = 'explore';
  private readonly interactDistance: number;
  private currentSeed = 0;

  constructor(config: FacilityPuzzleDeps | FacilityPuzzleRuntimeConfig) {
    if (isRuntimeConfig(config)) {
      this.liveWorld = config.world;
      this.livePlayer = config.player;
      this.appEvents = config.events;
      this.currentSeed = config.seed;
      this.interactDistance = config.interactDistance ?? PUZZLE_INTERACT_DISTANCE ?? 2.2;

      const worldAccess: FacilityWorldAccess = {
        getPlayerPosition: (): Vector3 => config.player.position,
        distanceToObject: (objectId: PuzzleObjectId): number | null => {
          const item = config.world.getPuzzleInteractable(objectId);
          if (!item) return null;
          return config.player.position.distanceTo(item.position);
        },
      };

      const emitNoise = (position: Vector3, loudness: number): void => {
        config.events.emit('sound', {
          position: position.clone(),
          loudness,
          radius: Math.max(4, loudness * 18),
          source: 'puzzle',
        });
      };

      this.deps = {
        world: worldAccess,
        inventory: config.inventory,
        drawers: config.drawers,
        onNoise: emitNoise,
        ui: {
          setObjective: (): void => undefined,
          showPrompt: (text: string): void => {
            if (text) config.events.emit('message', text);
          },
          showFailure: (text: string): void => {
            if (text) config.events.emit('message', text);
          },
        },
        hasReadDocument: (documentId: string): boolean =>
          documentId === PAPER_PASSWORD_ID && this.progress.passwordFound,
        interactDistance: this.interactDistance,
      };

      this.fragments = new FragmentCombinationSystem({
        events: this.events,
        onNoise: emitNoise,
        grantItem: (item: InventoryItem): void => grantToInventory(config.inventory, item),
        isWithinInteractionRange: (fragmentId: FragmentId): boolean =>
          this.inRange(fragmentId),
      });

      this.locker = config.locker;
      this.locker.configureHooks({
        events: this.events,
        world: config.world,
        onNoise: emitNoise,
        grantItem: (item: InventoryItem): void => grantToInventory(config.inventory, item),
        hasReadPasswordClue: (): boolean => this.progress.passwordFound,
        isWithinInteractionRange: (): boolean => this.inRange('password_locker'),
      });
    } else {
      this.liveWorld = null;
      this.livePlayer = null;
      this.appEvents = null;

      if (
        config.drawers.drawerCount !== undefined &&
        config.drawers.drawerCount !== DRAWER_COUNT
      ) {
        throw new Error(
          `FacilityPuzzleSystem: expected exactly ${DRAWER_COUNT} drawers, got ${config.drawers.drawerCount}.`,
        );
      }

      this.deps = config;
      this.interactDistance = config.interactDistance ?? 2.2;

      this.fragments = new FragmentCombinationSystem({
        events: this.events,
        onNoise: config.onNoise,
        grantItem: (item: InventoryItem): void => grantToInventory(config.inventory, item),
        isWithinInteractionRange: (fragmentId: FragmentId): boolean =>
          this.inRange(fragmentId),
      });

      this.locker = new PasswordLocker({
        events: this.events,
        onNoise: config.onNoise,
        grantItem: (item: InventoryItem): void => grantToInventory(config.inventory, item),
        hasReadPasswordClue: (): boolean => config.hasReadDocument(PAPER_PASSWORD_ID),
        isWithinInteractionRange: (): boolean => this.inRange('password_locker'),
      });
    }

    this.wireProgressionEvents();
    this.refreshObjectiveText();
  }

  /* ---------------------------------------------------------------------
   * Public progress queries & PlayerController / GameController host hooks
   * --------------------------------------------------------------------- */

  getProgress(): Readonly<PuzzleProgress> {
    return { ...this.progress };
  }

  getStage(): PuzzleStage {
    return this.stage;
  }

  hasItem(itemId: InventoryItem['id']): boolean {
    return this.deps.inventory.has(itemId);
  }

  keysFoundCount(): number {
    return this.progress.drawerKeysCollected;
  }

  locksOpenedCount(): number {
    return this.progress.locksUnlocked;
  }

  fragmentsFoundCount(): number {
    return this.fragments.collectedCount;
  }

  hasRoomKey(): boolean {
    return this.progress.hasRoomKey;
  }

  /** Called by GameController when the player presses [Q] to combine fragments. */
  combineFragments(): PuzzleActionResult {
    const result = this.fragments.combine();
    if (!result.ok) {
      const msg =
        this.fragments.describeIncomplete() ??
        (this.fragments.isComplete
          ? 'The fragments are already combined.'
          : 'You need all 3 fragments first.');
      this.deps.ui.showFailure(msg);
      return result;
    }

    this.progress.fragmentsCombined = true;
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.box ?? 0.3);
    this.deps.ui.showPrompt('Assembled the three fragments into a solid relic.');
    this.advanceStageIfReady();
    return result;
  }

  /** Alias called by GameController when PAPER_PASSWORD_ID is collected/read. */
  notePasswordDiscovered(): void {
    this.notifyDocumentRead(PAPER_PASSWORD_ID);
  }

  /** Call from PaperReader / GameController when any document is read. */
  notifyDocumentRead(documentId: string): void {
    this.progress.papersRead += 1;
    this.deps.onDocumentRead?.(documentId);

    if (documentId === PAPER_PASSWORD_ID) {
      this.progress.passwordFound = true;
      this.locker.markClueDiscovered(true);
      this.advanceStageIfReady();
    }
  }

  /** Alias for PlayerController PuzzleHost compatibility if called as `handleInteract`. */
  handleInteract(objectId: PuzzleObjectId, extra?: { entry?: string }): PuzzleActionResult {
    return this.interact(objectId, extra);
  }

  /* ---------------------------------------------------------------------
   * Player-facing interactions.
   * --------------------------------------------------------------------- */

  interact(objectId: PuzzleObjectId, extra?: { entry?: string }): PuzzleActionResult {
    switch (true) {
      case objectId.startsWith('drawer_'):
        return this.openDrawer(objectId as DrawerId);

      case objectId.startsWith('lock_'):
        return this.unlockLock(objectId as LockId);

      case objectId.startsWith('fragment_'):
        return this.collectFragment(objectId as FragmentId);

      case objectId === 'combination_box':
        return this.combineAndOpenBox();

      case objectId === 'access_door':
        return this.openAccessDoor();

      case objectId === 'keycard_room_door':
        return this.openKeycardRoomDoor();

      case objectId === 'password_locker': {
        const entry = extra?.entry ?? '';
        const result = this.locker.attempt(entry, this.deps.world.getPlayerPosition());
        if (!result.ok) {
          this.deps.ui.showFailure(result.message);
          return { ok: false, reason: this.mapLockerReason(result.reason) };
        }
        this.deps.ui.showPrompt(result.message);
        return { ok: true };
      }

      case objectId === 'keycard': {
        if (!this.locker.isUnlocked) {
          this.fail('keycard', 'not_ready');
          return { ok: false, reason: 'not_ready' };
        }
        this.progress.hasKeycard = true;
        this.progress.keycardState = 'collected';
        if (this.livePlayer) this.livePlayer.hasKeycard = true;
        this.liveWorld?.setKeycardVisible(false);
        this.advanceStageIfReady();
        return { ok: true };
      }

      case objectId === 'exit_door':
        return this.attemptExit();

      default:
        return { ok: false, reason: 'disabled' };
    }
  }

  private openDrawer(drawerId: DrawerId): PuzzleActionResult {
    if (!this.inRange(drawerId)) {
      this.fail(drawerId, 'out_of_range');
      return { ok: false, reason: 'out_of_range' };
    }

    const result = this.deps.drawers.open(drawerId);
    if (!result.ok) {
      this.fail(drawerId, result.reason);
      return result;
    }

    this.liveWorld?.setDrawerOpen(drawerId, true);
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.drawer ?? 0.35);
    this.syncKeyProgress();
    this.advanceStageIfReady();
    return { ok: true };
  }

  private unlockLock(lockId: LockId): PuzzleActionResult {
    if (this.locks.get(lockId)) {
      this.fail(lockId, 'already_unlocked');
      return { ok: false, reason: 'already_unlocked' };
    }

    if (!this.inRange(lockId)) {
      this.fail(lockId, 'out_of_range');
      return { ok: false, reason: 'out_of_range' };
    }

    if (!hasAllDrawerKeys(this.deps.drawers)) {
      this.liveWorld?.playLockFeedback(lockId, false);
      this.deps.ui.showFailure('Locked. Find all 3 drawer keys first.');
      this.fail(lockId, 'missing_item');
      return { ok: false, reason: 'missing_item' };
    }

    this.locks.set(lockId, true);
    this.liveWorld?.setLockUnlocked(lockId, true);
    this.progress.locksUnlocked = Array.from(this.locks.values()).filter(Boolean).length;
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.lock ?? 0.5);
    this.events.emit('puzzle:lock-unlocked', { lockId });

    if (this.progress.locksUnlocked >= this.progress.requiredLocks) {
      this.progress.accessDoorUnlocked = true;
      this.deps.ui.showPrompt('All three locks released. Decontamination is open.');
    }

    this.advanceStageIfReady();
    return { ok: true };
  }

  private collectFragment(fragmentId: FragmentId): PuzzleActionResult {
    if (puzzleStageIndex(this.stage) < puzzleStageIndex('collect_fragments')) {
      this.fail(fragmentId, 'not_ready');
      return { ok: false, reason: 'not_ready' };
    }

    const result = this.fragments.collect(fragmentId, this.deps.world.getPlayerPosition());
    if (result.ok) {
      this.liveWorld?.setFragmentVisible(fragmentId, false);
      this.progress.fragmentsCollected = this.fragments.collectedCount;
      this.deps.ui.showPrompt(
        `Collected fragment (${this.fragments.collectedCount}/${FRAGMENT_COUNT}).`,
      );
      this.advanceStageIfReady();
    }
    return result;
  }

  private combineAndOpenBox(): PuzzleActionResult {
    if (!this.inRange('combination_box')) {
      this.fail('combination_box', 'out_of_range');
      return { ok: false, reason: 'out_of_range' };
    }

    if (!this.fragments.isComplete) {
      const combineResult = this.fragments.combine();
      if (!combineResult.ok) {
        const message =
          this.fragments.describeIncomplete() ?? 'This needs something else first.';
        this.deps.ui.showFailure(message);
        return combineResult;
      }
      this.progress.fragmentsCombined = true;
    }

    if (this.progress.boxOpened) {
      this.fail('combination_box', 'already_open');
      return { ok: false, reason: 'already_open' };
    }

    this.progress.boxOpened = true;
    this.liveWorld?.setBoxOpen(true);
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.box ?? 0.45);
    this.events.emit('puzzle:box-opened', { itemId: 'room_key' });
    grantToInventory(this.deps.inventory, {
      id: 'room_key',
      name: 'Room Key',
      type: 'key',
      description: 'A small physical key. It opens the Records Archive.',
      collected: true,
      puzzleId: 'room_key',
    });
    this.progress.roomKeyTaken = true;
    this.progress.hasRoomKey = true;
    this.events.emit('puzzle:room-key-taken', { itemId: 'room_key' });
    this.deps.ui.showPrompt('Combination box opened: acquired Archive Room Key.');
    this.advanceStageIfReady();
    return { ok: true };
  }

  private openAccessDoor(): PuzzleActionResult {
    if (!this.inRange('access_door')) {
      this.fail('access_door', 'out_of_range');
      return { ok: false, reason: 'out_of_range' };
    }
    if (this.progress.locksUnlocked < this.progress.requiredLocks) {
      this.fail('access_door', 'missing_item');
      return { ok: false, reason: 'missing_item' };
    }
    this.progress.accessDoorUnlocked = true;
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.door ?? 0.65);
    this.advanceStageIfReady();
    return { ok: true };
  }

  private openKeycardRoomDoor(): PuzzleActionResult {
    if (!this.inRange('keycard_room_door')) {
      this.fail('keycard_room_door', 'out_of_range');
      return { ok: false, reason: 'out_of_range' };
    }
    if (!this.progress.roomKeyTaken) {
      this.deps.ui.showFailure('Archive door locked. Requires the Box Key.');
      this.fail('keycard_room_door', 'missing_item');
      return { ok: false, reason: 'missing_item' };
    }
    this.progress.keycardRoomDoorUnlocked = true;
    this.liveWorld?.setKeyedDoorOpen(true);
    this.deps.onNoise(this.deps.world.getPlayerPosition(), PUZZLE_NOISE.door ?? 0.65);
    this.locker.spawnKeycard();
    this.deps.ui.showPrompt('Records Archive unlocked.');
    this.advanceStageIfReady();
    return { ok: true };
  }

  private attemptExit(): PuzzleActionResult {
    if (!this.progress.hasKeycard) {
      this.fail('exit_door', 'missing_item');
      return { ok: false, reason: 'missing_item' };
    }
    this.progress.escaped = true;
    this.stage = 'complete';
    this.refreshObjectiveText();
    return { ok: true };
  }

  update(_delta: number): void {
    // Event-driven progression; WorldManager owns smooth mesh animations.
  }

  /* ---------------------------------------------------------------------
   * Progression bookkeeping
   * --------------------------------------------------------------------- */

  private wireProgressionEvents(): void {
    this.events.on('puzzle:keycard-collected', () => {
      this.progress.hasKeycard = true;
      this.progress.keycardState = 'collected';
      if (this.livePlayer) this.livePlayer.hasKeycard = true;
      this.advanceStageIfReady();
    });

    this.events.on('puzzle:locker-unlocked', () => {
      this.progress.lockerUnlocked = true;
    });
  }

  private syncKeyProgress(): void {
    const found = readDrawerKeys(this.deps.drawers);
    this.progress.drawerKeysCollected = found.length;
    for (const keyId of found) {
      this.events.emit('puzzle:key-collected', { keyId });
    }
  }

  private advanceStageIfReady(): void {
    const from = this.stage;
    const next = this.computeStage();

    if (next !== from) {
      this.stage = next;
      this.progress.stage = next;
      const objectiveMsg = this.objectiveTextFor(next);
      this.events.emit('puzzle:stage', { from, to: next });
      this.appEvents?.emit('puzzle:stage', { from, to: objectiveMsg || next });
      this.refreshObjectiveText();
      this.log.info('stage advanced', { from, to: next });
    }
  }

  /** Pure function of current progress -> stage. Never regresses (compares by stage order). */
  private computeStage(): PuzzleStage {
    const p = this.progress;
    const currentIndex = puzzleStageIndex(this.stage);

    const candidates: Array<[PuzzleStage, boolean]> = [
      ['explore', true],
      ['find_keys', true],
      ['unlock_access_door', p.drawerKeysCollected >= KEY_COUNT],
      ['collect_fragments', p.accessDoorUnlocked],
      ['combine_and_open_box', p.fragmentsCollected >= FRAGMENT_COUNT],
      ['take_room_key', p.boxOpened],
      ['search_papers', p.roomKeyTaken && p.keycardRoomDoorUnlocked],
      ['unlock_locker', p.passwordFound],
      ['escape', p.hasKeycard],
      ['complete', p.escaped],
    ];

    let resolved: PuzzleStage = this.stage;
    for (const [stage, met] of candidates) {
      if (met && puzzleStageIndex(stage) >= currentIndex) {
        resolved = stage;
      }
    }
    return resolved;
  }

  private refreshObjectiveText(): void {
    const text = this.objectiveTextFor(this.stage);
    this.deps.ui.setObjective(text);
  }

  private objectiveTextFor(stage: PuzzleStage): string {
    switch (stage) {
      case 'explore':
        return 'Explore the facility.';
      case 'find_keys':
        return `Find the 3 drawer keys (${this.progress.drawerKeysCollected}/${KEY_COUNT}).`;
      case 'unlock_access_door':
        return 'Use the keys to unlock the restricted-room door.';
      case 'collect_fragments':
        return `Collect the hidden fragments (${this.fragments.collectedCount}/${FRAGMENT_COUNT}).`;
      case 'combine_and_open_box':
        return 'Combine the fragments and open the box.';
      case 'take_room_key':
        return 'Take the key from the box.';
      case 'search_papers':
        return 'Find the password among the facility papers.';
      case 'unlock_locker':
        return 'Enter the password on the locker.';
      case 'escape':
        return 'Use the keycard to escape.';
      case 'complete':
        return 'You escaped.';
      default:
        return '';
    }
  }

  private inRange(objectId: PuzzleObjectId): boolean {
    const distance = this.deps.world.distanceToObject(objectId);
    if (distance === null) return true;
    return distance <= this.interactDistance;
  }

  private fail(objectId: PuzzleObjectId, reason: PuzzleFailureReason): void {
    this.events.emit('puzzle:failed', { objectId, reason });
  }

  private mapLockerReason(
    reason: 'locked_clue_unread' | 'out_of_range' | 'already_unlocked' | 'wrong_password',
  ): PuzzleFailureReason {
    return reason === 'locked_clue_unread' ? 'not_ready' : reason;
  }

  /* ---------------------------------------------------------------------
   * Persistence (supports both .serialize() and GameController .snapshot())
   * --------------------------------------------------------------------- */

  serialize(): FacilityPuzzleSnapshot {
    return {
      version: 1,
      seed: this.currentSeed,
      progress: { ...this.progress },
      stage: this.stage,
      locks: Object.fromEntries(this.locks) as Record<LockId, boolean>,
      fragments: this.fragments.serialize(),
      locker: this.locker.serialize(),
      drawers: serializeDrawers(this.deps.drawers),
      inventory: serializeInventory(this.deps.inventory),
    };
  }

  /** Alias expected by GameController.persistPuzzle(). */
  snapshot(): FacilityPuzzleSnapshot {
    return this.serialize();
  }

  restore(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object') return;
    const data = snapshot as Partial<FacilityPuzzleSnapshot>;

    if (typeof data.seed === 'number') {
      this.currentSeed = data.seed;
    }

    if (data.progress) {
      this.progress = { ...DEFAULT_PUZZLE_PROGRESS, ...data.progress };
    }
    if (data.stage) {
      this.stage = data.stage;
    }

    for (const id of LOCK_IDS) {
      const unlocked = data.locks?.[id] ?? false;
      this.locks.set(id, unlocked);
      this.liveWorld?.setLockUnlocked(id, unlocked);
    }

    if (data.fragments) {
      this.fragments.restore(data.fragments);
      for (const fragId of FRAGMENT_IDS) {
        this.liveWorld?.setFragmentVisible(fragId, !this.fragments.isCollected(fragId));
      }
    }

    if (data.locker) {
      this.locker.restore(data.locker);
    }
    this.locker.markClueDiscovered(this.progress.passwordFound);

    if (data.drawers !== undefined) {
      this.deps.drawers.restore(data.drawers);
    }

    if (Array.isArray(data.inventory)) {
      this.deps.inventory.restore(data.inventory);
    }

    this.liveWorld?.setBoxOpen(this.progress.boxOpened);
    this.liveWorld?.setKeyedDoorOpen(this.progress.keycardRoomDoorUnlocked);
    if (this.livePlayer) {
      this.livePlayer.hasKeycard = this.progress.hasKeycard;
    }

    this.refreshObjectiveText();
  }

  reset(seed?: number): void {
    if (typeof seed === 'number') {
      this.currentSeed = seed;
    }
    this.progress = { ...DEFAULT_PUZZLE_PROGRESS };
    this.stage = 'explore';
    for (const id of LOCK_IDS) {
      this.locks.set(id, false);
      this.liveWorld?.setLockUnlocked(id, false);
    }
    this.fragments.reset();
    for (const fragId of FRAGMENT_IDS) {
      this.liveWorld?.setFragmentVisible(fragId, true);
    }
    this.locker.reset();
    this.deps.drawers.reset(seed);
    this.deps.inventory.reset();
    this.liveWorld?.setBoxOpen(false);
    this.liveWorld?.setKeyedDoorOpen(false);
    if (this.livePlayer) {
      this.livePlayer.hasKeycard = false;
    }
    this.refreshObjectiveText();
  }

  dispose(): void {
    this.fragments.dispose();
    this.locker.dispose();
    this.deps.drawers.dispose?.();
    this.events.dispose();
  }
}