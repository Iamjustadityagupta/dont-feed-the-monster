import * as THREE from 'three';
import { Logger } from '../core/Logger';
import { createRng, type Rng } from '../core/Random';
import { PUZZLE_DRAWERS, PUZZLE_KEYS } from '../world/LevelLayout';
import type { WorldManager } from './../world/WorldManager';
import { EventBus } from '../core/EventBus';
import {
  PUZZLE_INTERACT_DISTANCE,
  PUZZLE_NOISE,
  type DrawerContent,
  type DrawerId,
  type DrawerKeyId,
  type DrawerStateRecord,
  type InventoryItem,
  type PuzzleActionResult,
  type PuzzleFailureReason,
} from '../core/types';

/**
 * Minimal surface DrawerSystem needs from the puzzle inventory. Kept narrow and
 * structural (not a direct class import) so DrawerSystem never depends on
 * PuzzleInventory's internals beyond "it can receive a collected key".
 */
export interface DrawerInventorySink {
  addItem(item: InventoryItem): void;
  hasItem?(id: DrawerKeyId): boolean;
}

/** Position-only lookup so DrawerSystem does not need the full WorldManager type surface at call sites that only read positions. */
export interface DrawerWorldAdapter {
  setDrawerOpen(id: DrawerId, open: boolean): void;
}

export interface DrawerSystemOptions {
  /** Defaults to PUZZLE_INTERACT_DISTANCE from core/types. */
  interactDistance?: number;
}

/**
 * Owns the 20 searchable drawer units: seeded key placement (exactly 3 of 20,
 * never doubled up), open/close animation delegation to WorldManager, search
 * state, sound-event emission, interaction-range validation, reset and
 * serialize/restore. Drawers are a distinct interactable category from the
 * monster-hiding lockers in HidingSystem/LOCKERS — they are never a hiding
 * spot and never occupy a doorway or corridor footprint (LevelLayout keeps
 * their solids shallow and placed only along room walls).
 */
export class DrawerSystem {
  private readonly log = new Logger({ namespace: 'drawers' });
  private readonly interactDistance: number;

  /** Stable per-run state for every drawer id, in LevelLayout declaration order. */
  private readonly drawers = new Map<DrawerId, DrawerStateRecord>();
  /** drawerId -> key id, only for the 3 seeded drawers. Assigned once per seed/reset. */
  private readonly keyAssignment = new Map<DrawerId, DrawerKeyId>();
  /** Keys already collected this run; guards against re-collecting from a reopened drawer. */
  private readonly collectedKeys = new Set<DrawerKeyId>();

  constructor(
    private readonly world: WorldManager | DrawerWorldAdapter,
    private readonly rng: Rng,
    private readonly inventory: DrawerInventorySink,
    private readonly events: EventBus,
  ) {
    this.interactDistance = PUZZLE_INTERACT_DISTANCE;
    this.initDrawers();
    this.assignKeys(this.rng);
  }

  // ---- Setup -----------------------------------------------------------------------------------------------

  private initDrawers(): void {
    for (const spec of PUZZLE_DRAWERS) {
      this.drawers.set(spec.id, { state: 'closed', content: null, searched: false });
    }
  }

  /**
   * Deterministic key placement: forks the supplied Rng on a fixed salt so a
   * separately-seeded drawer pass never perturbs other systems' draws from the
   * same root Rng, then performs a seeded Fisher-Yates shuffle of the 20 drawer
   * ids and assigns the first KEY_COUNT shuffled ids one key each, one-to-one
   * with PUZZLE_KEYS. The same seed always reproduces the same layout, which is
   * what makes `restore()` exact after a save/load.
   */
  private assignKeys(rng: Rng): void {
    const keyRng = rng.fork('drawer-keys');
    const ids: DrawerId[] = PUZZLE_DRAWERS.map((d) => d.id);
    const shuffled = this.shuffle(ids, keyRng);

    this.keyAssignment.clear();
    PUZZLE_KEYS.forEach((key, index) => {
      const drawerId = shuffled[index];
      if (!drawerId) return;
      // Guard: a drawer id can only ever receive one key (loop index is unique per shuffled slot).
      this.keyAssignment.set(drawerId, key.id);
    });

    for (const spec of PUZZLE_DRAWERS) {
      const record = this.drawers.get(spec.id);
      if (!record) continue;
      record.content = this.keyAssignment.get(spec.id) ?? null;
    }

    this.log.debug('keys assigned', {
      count: this.keyAssignment.size,
      drawers: Array.from(this.keyAssignment.entries()),
    });
  }

  /** Seeded Fisher-Yates; never mutates the input array. */
  private shuffle<T>(input: readonly T[], rng: Rng): T[] {
    const out = input.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // ---- Queries -----------------------------------------------------------------------------------------------

  /** Read-only state for a single drawer, or undefined if the id is unknown. */
  getState(id: DrawerId): Readonly<DrawerStateRecord> | undefined {
    return this.drawers.get(id);
  }

  isOpen(id: DrawerId): boolean {
    return this.drawers.get(id)?.state === 'open';
  }

  isSearched(id: DrawerId): boolean {
    return this.drawers.get(id)?.searched ?? false;
  }

  /** True while the given drawer still holds an uncollected key. */
  hasUncollectedKey(id: DrawerId): boolean {
    const record = this.drawers.get(id);
    if (!record || !record.content) return false;
    return !this.collectedKeys.has(record.content);
  }

  /** Every drawer id that currently holds a key (for debugging/tests only; never surfaced to the player). */
  drawerIdsWithKeys(): DrawerId[] {
    return Array.from(this.keyAssignment.keys());
  }

  get keysCollected(): number {
    return this.collectedKeys.size;
  }

  /** Contextual prompt text for HUD/InteractionPrompt. Null when nothing useful to say. */
  getPrompt(id: DrawerId): string | null {
    const record = this.drawers.get(id);
    if (!record) return null;
    if (record.state === 'closed') return 'Search drawer';
    if (!record.searched) return 'Search drawer';
    return null;
  }

  // ---- Interaction ---------------------------------------------------------------------------------------------

  /**
   * Attempts to open/search a drawer from the player's current position.
   * Validates range, then opens (if closed) and marks it searched, collecting
   * its key into the inventory exactly once. A drawer that is already open and
   * already searched can still be toggled closed/open again for flavour, but
   * never yields a second key.
   */
  interact(id: DrawerId, playerPosition: THREE.Vector3): PuzzleActionResult {
    const record = this.drawers.get(id);
    if (!record) return { ok: false, reason: 'disabled' };

    const spec = PUZZLE_DRAWERS.find((d) => d.id === id);
    if (!spec) return { ok: false, reason: 'disabled' };

    const dx = playerPosition.x - spec.x;
    const dz = playerPosition.z - spec.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.interactDistance) {
      return { ok: false, reason: 'out_of_range' };
    }

    if (record.state === 'closed') {
      this.open(id, record);
      return { ok: true };
    }

    // Already open: re-searching an empty/already-collected drawer is a harmless no-op,
    // not a failure, so the player is never told "already open" for simply looking again.
    if (!record.searched) {
      this.search(id, record);
      return { ok: true };
    }

    return { ok: false, reason: 'already_searched' };
  }

  private open(id: DrawerId, record: DrawerStateRecord): void {
    record.state = 'open';
    this.setWorldDrawerOpen(id, true);
    this.emitSound(id);
    this.search(id, record);
  }

  private search(id: DrawerId, record: DrawerStateRecord): void {
    const hadKeyBefore = record.content !== null && !this.collectedKeys.has(record.content);
    record.searched = true;

    if (record.content && !this.collectedKeys.has(record.content)) {
      const keySpec = PUZZLE_KEYS.find((k) => k.id === record.content);
      this.collectedKeys.add(record.content);
      if (keySpec) {
        this.inventory.addItem({
          id: keySpec.id,
          name: keySpec.label,
          type: 'key',
          description: `Opens ${keySpec.lockId.replace('_', ' ')}.`,
          collected: true,
          puzzleId: keySpec.id,
        });
        this.events.emit('puzzle:key-collected', { keyId: keySpec.id });
      }
    }

    this.events.emit('puzzle:drawer-opened', { drawerId: id, hadKey: hadKeyBefore });
    this.log.debug('drawer searched', { id, hadKey: hadKeyBefore });
  }

  private emitSound(id: DrawerId): void {
    const spec = PUZZLE_DRAWERS.find((d) => d.id === id);
    if (!spec) return;
    this.events.emit('sound', {
      position: new THREE.Vector3(spec.x, 0.6, spec.z),
      loudness: PUZZLE_NOISE.drawer,
      kind: 'impact',
      time: performance.now() / 1000,
    });
  }

  private setWorldDrawerOpen(id: DrawerId, open: boolean): void {
    this.world.setDrawerOpen(id, open);
  }

  /** Explicitly closes a drawer (not currently exposed to the player, kept for completeness/tests). */
  close(id: DrawerId): PuzzleActionResult {
    const record = this.drawers.get(id);
    if (!record) return { ok: false, reason: 'disabled' as PuzzleFailureReason };
    if (record.state === 'closed') return { ok: false, reason: 'disabled' as PuzzleFailureReason };
    record.state = 'closed';
    this.setWorldDrawerOpen(id, false);
    return { ok: true };
  }

  // ---- Reset / persistence --------------------------------------------------------------------------------------

  /**
   * Full reset for a new run: every drawer closes, unsearched, collected-key
   * tracking clears, and keys are reassigned from the given Rng (a fresh
   * per-run fork, so a new seed produces a new — but still seed-reproducible —
   * layout). WorldManager's own resetPuzzle()/animatePuzzle() handle the visual
   * close; this only drives logical state and tells the world to snap shut.
   */
  reset(rngOrSeed: Rng | number = this.rng): void {
    this.collectedKeys.clear();
    for (const record of this.drawers.values()) {
      record.state = 'closed';
      record.searched = false;
      record.content = null;
    }

    // FacilityPuzzleSystem passes a numeric run seed; other callers may pass an Rng.
    const rng = typeof rngOrSeed === 'number'
      ? createRng(rngOrSeed)
      : rngOrSeed;

    this.assignKeys(rng);
    for (const id of this.drawers.keys()) this.setWorldDrawerOpen(id, false);
  }

  /** Snapshot for SaveManager; order follows LevelLayout's PUZZLE_DRAWERS. */
  snapshot(): Record<DrawerId, DrawerStateRecord> {
    const out = {} as Record<DrawerId, DrawerStateRecord>;
    for (const [id, record] of this.drawers) {
      out[id] = { state: record.state, content: record.content, searched: record.searched };
    }
    return out;
  }

  /**
   * Restores exact drawer state from a save: open/closed, searched flag, which
   * drawer held which key, and which keys were already collected (inferred:
   * a searched drawer whose content key is not re-added to the inventory here
   * — SaveManager restores the inventory separately — but collectedKeys must
   * still reflect "already taken" so a reopened drawer can never re-grant it).
   */
  restore(snapshot: Readonly<Record<DrawerId, DrawerStateRecord>>): void {
    this.collectedKeys.clear();
    this.keyAssignment.clear();

    for (const spec of PUZZLE_DRAWERS) {
      const saved = snapshot[spec.id];
      const record = this.drawers.get(spec.id);
      if (!record) continue;

      if (saved) {
        record.state = saved.state;
        record.searched = saved.searched;
        record.content = saved.content;
      } else {
        record.state = 'closed';
        record.searched = false;
        record.content = null;
      }

      if (record.content) {
        this.keyAssignment.set(spec.id, record.content);
        if (record.searched) this.collectedKeys.add(record.content);
      }

      this.setWorldDrawerOpen(spec.id, record.state === 'open');
    }

    this.log.debug('drawers restored', { keys: this.collectedKeys.size });
  }

  /** Validates a loaded snapshot has exactly 3 keyed drawers and no duplicate key assignment, before trusting it. */
  static validateSnapshot(snapshot: Readonly<Record<DrawerId, DrawerStateRecord>>): boolean {
    const seenKeys = new Set<DrawerContent>();
    let keyedDrawerCount = 0;
    for (const id of Object.keys(snapshot) as DrawerId[]) {
      const content = snapshot[id].content;
      if (!content) continue;
      keyedDrawerCount += 1;
      if (seenKeys.has(content)) return false;
      seenKeys.add(content);
    }
    return keyedDrawerCount === PUZZLE_KEYS.length;
  }

  /** No GPU/DOM resources of its own (meshes/animation belong to WorldManager); state-only cleanup. */
  dispose(): void {
    this.drawers.clear();
    this.keyAssignment.clear();
    this.collectedKeys.clear();
  }
}