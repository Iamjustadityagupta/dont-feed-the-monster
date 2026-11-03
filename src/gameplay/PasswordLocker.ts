import type { Vector3 } from 'three';
import { Logger } from '../core/Logger';
import type { EventBus } from '../core/EventBus';
import type {
  InventoryItem,
  KeycardStateRecord,
  PasswordLockerStateRecord,
  PuzzleActionResult,
  PuzzleEventPayloadMap,
} from '../core/types';
import { PUZZLE_NOISE } from '../core/types';
import { PASSWORD_LOCKER_CONFIG } from '../Documents/DocumentRegistry';

export const KEYCARD_ITEM: Readonly<InventoryItem> = Object.freeze({
  id: 'keycard',
  name: 'Keycard',
  type: 'keycard',
  description: 'Matte security keycard. No markings beyond a magnetic strip.',
  collected: false,
  puzzleId: 'keycard',
});

/** Hard ceiling on wrong-password UI feedback so a bot-mashing player can't spam noise/UI. */
const MAX_TRACKED_ATTEMPTS = 99;

export interface LockerWorldController {
  setLockerOpen(open: boolean): void;
  setKeycardVisible(visible: boolean): void;
}

export interface LockerEventEmitter {
  emit<K extends keyof PuzzleEventPayloadMap>(
    event: K,
    payload: PuzzleEventPayloadMap[K],
  ): void;
}

export interface PasswordLockerDeps {
  readonly events: EventBus<PuzzleEventPayloadMap> | LockerEventEmitter;
  readonly onNoise?: (position: Vector3, loudness: number) => void;
  readonly grantItem: (item: InventoryItem) => void;
  /** True once the player has actually read the clue paper (DocumentRegistry.PASSWORD_DOCUMENT). */
  readonly hasReadPasswordClue: () => boolean;
  readonly isWithinInteractionRange?: () => boolean;
  readonly world?: LockerWorldController;
}

export type PasswordAttemptResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason: 'locked_clue_unread' | 'out_of_range' | 'already_unlocked' | 'wrong_password';
      message: string;
    };

function isPasswordLockerDeps(
  arg: PasswordLockerDeps | LockerWorldController,
): arg is PasswordLockerDeps {
  return typeof (arg as PasswordLockerDeps).grantItem === 'function' && 'events' in arg;
}

/**
 * The keypad locker in the keycard room. The unlock code is never read from anywhere
 * except PASSWORD_LOCKER_CONFIG (shared with DocumentRegistry's clue paper), so the
 * keypad and the readable clue can never diverge.
 */
export class PasswordLocker {
  private readonly log = new Logger({ namespace: 'password-locker' });
  private state: PasswordLockerStateRecord = { unlocked: false, attempts: 0, lastEntry: '' };
  private keycard: KeycardStateRecord = { state: 'in_locker', spawned: false };
  private clueDiscoveredFlag = false;
  private deps: PasswordLockerDeps;

  constructor(deps: PasswordLockerDeps);
  constructor(world: LockerWorldController, events: LockerEventEmitter);
  constructor(
    first: PasswordLockerDeps | LockerWorldController,
    second?: LockerEventEmitter,
  ) {
    if (isPasswordLockerDeps(first)) {
      this.deps = first;
    } else {
      const worldCtrl = first;
      const fallbackEvents: LockerEventEmitter = second ?? {
        emit: (): void => undefined,
      };
      this.deps = {
        events: fallbackEvents,
        world: worldCtrl,
        grantItem: (): void => undefined,
        hasReadPasswordClue: (): boolean => this.clueDiscoveredFlag,
      };
    }
  }

  /** Allows FacilityPuzzleSystem to wire inventory/clue/range/noise callbacks after construction. */
  configureHooks(hooks: {
    readonly events?: EventBus<PuzzleEventPayloadMap> | LockerEventEmitter;
    readonly onNoise?: (position: Vector3, loudness: number) => void;
    readonly grantItem?: (item: InventoryItem) => void;
    readonly hasReadPasswordClue?: () => boolean;
    readonly isWithinInteractionRange?: () => boolean;
    readonly world?: LockerWorldController;
  }): void {
    this.deps = {
      events: hooks.events ?? this.deps.events,
      onNoise: hooks.onNoise ?? this.deps.onNoise,
      grantItem: hooks.grantItem ?? this.deps.grantItem,
      hasReadPasswordClue: hooks.hasReadPasswordClue ?? this.deps.hasReadPasswordClue,
      isWithinInteractionRange:
        hooks.isWithinInteractionRange ?? this.deps.isWithinInteractionRange,
      world: hooks.world ?? this.deps.world,
    };
  }

  markClueDiscovered(discovered = true): void {
    this.clueDiscoveredFlag = discovered;
  }

  get isUnlocked(): boolean {
    return this.state.unlocked;
  }

  get attempts(): number {
    return this.state.attempts;
  }

  get keycardState(): KeycardStateRecord['state'] {
    return this.keycard.state;
  }

  /**
   * Call once when the keycard room door opens and the locker prop spawns.
   * Does not reveal the code; only marks the physical keycard as present.
   */
  spawnKeycard(): void {
    if (this.keycard.spawned) return;
    this.keycard = { state: 'in_locker', spawned: true };
  }

  /**
   * Attempts to unlock with the given entry. Never logs or surfaces the real code —
   * only whether the attempt matched. The clue-unread gate keeps the password itself
   * out of reach of any HUD/log path before the player has actually read the paper.
   */
  attempt(entry: string, worldPosition?: Vector3): PasswordAttemptResult {
    if (this.state.unlocked) {
      return this.fail('already_unlocked', 'Already unlocked.');
    }

    if (
      this.deps.isWithinInteractionRange &&
      !this.deps.isWithinInteractionRange()
    ) {
      this.deps.events.emit('puzzle:failed', {
        objectId: 'password_locker',
        reason: 'out_of_range',
      });
      return { ok: false, reason: 'out_of_range', message: 'Too far away.' };
    }

    if (!this.clueDiscoveredFlag && !this.deps.hasReadPasswordClue()) {
      this.deps.events.emit('puzzle:failed', {
        objectId: 'password_locker',
        reason: 'not_ready',
      });
      return {
        ok: false,
        reason: 'locked_clue_unread',
        message: 'The keypad needs a code you don\u2019t have yet.',
      };
    }

    const normalized = entry.trim();
    this.state = {
      ...this.state,
      attempts: Math.min(this.state.attempts + 1, MAX_TRACKED_ATTEMPTS),
      lastEntry: normalized.replace(/./g, '*'),
    };

    if (
      normalized.length !== PASSWORD_LOCKER_CONFIG.digits ||
      normalized !== PASSWORD_LOCKER_CONFIG.code
    ) {
      this.log.info('wrong password attempt', { attempts: this.state.attempts });

      if (worldPosition && this.deps.onNoise) {
        this.deps.onNoise(worldPosition, PUZZLE_NOISE.locker ?? 0.4);
      }

      this.deps.events.emit('puzzle:failed', {
        objectId: 'password_locker',
        reason: 'wrong_password',
      });
      return this.fail('wrong_password', 'Incorrect code.');
    }

    this.state = { ...this.state, unlocked: true };
    this.log.info('locker unlocked');

    if (worldPosition && this.deps.onNoise) {
      this.deps.onNoise(worldPosition, PUZZLE_NOISE.locker ?? 0.4);
    }

    this.deps.world?.setLockerOpen(true);
    this.deps.events.emit('puzzle:locker-unlocked', { objectId: 'password_locker' });
    this.rewardKeycard();

    return { ok: true, message: 'The lock clicks open.' };
  }

  private rewardKeycard(): void {
    if (this.keycard.state !== 'in_locker') {
      return;
    }

    this.keycard = { state: 'collected', spawned: true };
    this.deps.world?.setKeycardVisible(false);
    this.deps.grantItem({ ...KEYCARD_ITEM, collected: true });
    this.deps.events.emit('puzzle:keycard-collected', { itemId: 'keycard' });
  }

  /** Marks the keycard as consumed on the exit door, if your exit system wants a one-way state transition. */
  markKeycardUsed(): PuzzleActionResult {
    if (this.keycard.state !== 'collected') {
      return { ok: false, reason: 'missing_item' };
    }
    this.keycard = { ...this.keycard, state: 'used' };
    return { ok: true };
  }

  private fail(
    reason: 'locked_clue_unread' | 'out_of_range' | 'already_unlocked' | 'wrong_password',
    message: string,
  ): PasswordAttemptResult {
    return { ok: false, reason, message };
  }

  serialize(): { locker: PasswordLockerStateRecord; keycard: KeycardStateRecord } {
    return {
      locker: { ...this.state },
      keycard: { ...this.keycard },
    };
  }

  restore(snapshot: { locker: PasswordLockerStateRecord; keycard: KeycardStateRecord }): void {
    this.state = { ...snapshot.locker };
    this.keycard = { ...snapshot.keycard };
    this.deps.world?.setLockerOpen(this.state.unlocked);
    this.deps.world?.setKeycardVisible(
      this.state.unlocked && this.keycard.state === 'in_locker',
    );
  }

  reset(): void {
    this.state = { unlocked: false, attempts: 0, lastEntry: '' };
    this.keycard = { state: 'in_locker', spawned: false };
    this.clueDiscoveredFlag = false;
    this.deps.world?.setLockerOpen(false);
    this.deps.world?.setKeycardVisible(false);
  }

  dispose(): void {
    // No meshes, timers or listeners owned by this system.
  }
}