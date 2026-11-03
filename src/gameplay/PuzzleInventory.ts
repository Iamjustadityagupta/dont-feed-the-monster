/**
 * PuzzleInventory
 * ----------------
 * Pure data/state owner for the facility's physical puzzle items:
 *   - 3 drawer keys   (drawer_key_1 .. drawer_key_3)
 *   - 3 fragments     (fragment_1 .. fragment_3)
 *   - 1 box key       (room_key — the key taken from the opened combination box,
 *                       see `LevelLayout.ts`: "Records Archive ... opened by the box key")
 *   - 1 keycard       (keycard)
 *
 * Combining all 3 fragments yields a single composite item (`combined_object`).
 *
 * This class intentionally owns NO Three.js objects, NO DOM/UI and NO meshes — callers
 * (DrawerSystem, FragmentCombinationSystem, FacilityPuzzleSystem, HUD/JournalUI, etc.)
 * read state from here and render it themselves. All collectible identifiers are drawn
 * from the project's existing `PuzzleItemId` union in `core/types.ts`; no new item ids
 * are invented here.
 *
 * Determinism / save compatibility:
 *   - Internal storage is an insertion-ordered Map, so `list()`/`serialize()` order is
 *     stable for a given sequence of `add()`/`combine()` calls, which in turn is driven
 *     by the project's seeded `Rng` (see `core/Random.ts`) elsewhere in the puzzle stack.
 *   - `serialize()`/`restore()` round-trip a plain, JSON-safe snapshot
 *     (`PuzzleInventorySnapshot`). `restore()` validates every field defensively and
 *     never throws; unknown or malformed entries are dropped and logged.
 *   - Combining fragments removes the 3 fragment entries and inserts `combined_object`
 *     in a single atomic step, so a snapshot taken immediately after combine is always
 *     self-consistent (never "has fragments and has combined_object" at once).
 */

import type { Disposable } from '../core/Disposable';
import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import type {
  DrawerKeyId,
  FragmentId,
  InventoryItem,
  InventoryItemType,
} from '../core/types';

const log = new Logger({ namespace: 'puzzle-inventory' });

/* ==========================================================================
 * Identifiers
 * ========================================================================== */

/** The box key is the project's existing `room_key` puzzle item id. */
export const BOX_KEY_ITEM_ID = 'room_key' as const;
export const KEYCARD_ITEM_ID = 'keycard' as const;
export const COMBINED_ITEM_ID = 'combined_object' as const;

export type BoxKeyItemId = typeof BOX_KEY_ITEM_ID;
export type KeycardItemId = typeof KEYCARD_ITEM_ID;
export type CombinedItemId = typeof COMBINED_ITEM_ID;

/** Every id this inventory is allowed to hold directly via `add()`. */
export type CollectibleItemId = DrawerKeyId | FragmentId | BoxKeyItemId | KeycardItemId;

/** Every id this inventory can ever contain, including the combine result. */
export type PuzzleInventoryItemId = CollectibleItemId | CombinedItemId;

const DRAWER_KEY_IDS: readonly DrawerKeyId[] = ['drawer_key_1', 'drawer_key_2', 'drawer_key_3'];
const FRAGMENT_IDS: readonly FragmentId[] = ['fragment_1', 'fragment_2', 'fragment_3'];

interface ItemDefinition {
  readonly id: PuzzleInventoryItemId;
  readonly name: string;
  readonly type: InventoryItemType;
  readonly description: string;
}

const ITEM_DEFINITIONS: Readonly<Record<PuzzleInventoryItemId, ItemDefinition>> = {
  drawer_key_1: { id: 'drawer_key_1', name: 'Drawer Key I', type: 'key', description: 'A small brass key. Fits one of the filing drawers.' },
  drawer_key_2: { id: 'drawer_key_2', name: 'Drawer Key II', type: 'key', description: 'A small brass key. Fits one of the filing drawers.' },
  drawer_key_3: { id: 'drawer_key_3', name: 'Drawer Key III', type: 'key', description: 'A small brass key. Fits one of the filing drawers.' },
  fragment_1: { id: 'fragment_1', name: 'Fragment I', type: 'fragment', description: 'A broken piece. It looks like it belongs with the others.' },
  fragment_2: { id: 'fragment_2', name: 'Fragment II', type: 'fragment', description: 'A broken piece. It looks like it belongs with the others.' },
  fragment_3: { id: 'fragment_3', name: 'Fragment III', type: 'fragment', description: 'A broken piece. It looks like it belongs with the others.' },
  room_key: { id: 'room_key', name: 'Box Key', type: 'key', description: 'Taken from the combination box. Opens a door somewhere in the facility.' },
  keycard: { id: 'keycard', name: 'Keycard', type: 'keycard', description: 'An access keycard.' },
  combined_object: { id: 'combined_object', name: 'Combined Object', type: 'composite', description: 'The three fragments, assembled into one piece.' },
} as const;

const COLLECTIBLE_IDS: readonly CollectibleItemId[] = [
  ...DRAWER_KEY_IDS,
  ...FRAGMENT_IDS,
  BOX_KEY_ITEM_ID,
  KEYCARD_ITEM_ID,
];

const isCollectibleId = (value: unknown): value is CollectibleItemId =>
  typeof value === 'string' && (COLLECTIBLE_IDS as readonly string[]).includes(value);

const isInventoryItemId = (value: unknown): value is PuzzleInventoryItemId =>
  typeof value === 'string' && (value in ITEM_DEFINITIONS);

/* ==========================================================================
 * Snapshot (serialize / restore)
 * ========================================================================== */

export const PUZZLE_INVENTORY_SNAPSHOT_VERSION = 1;

/** Minimal, JSON-safe, order-preserving record of held items. */
export interface PuzzleInventorySnapshot {
  readonly version: typeof PUZZLE_INVENTORY_SNAPSHOT_VERSION;
  /** Ids in collection order. No meshes, no transient state — safe to persist. */
  readonly items: readonly PuzzleInventoryItemId[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* ==========================================================================
 * Events
 * ========================================================================== */

export interface PuzzleInventoryItemEvent {
  readonly id: PuzzleInventoryItemId;
  readonly item: InventoryItem;
}

export interface PuzzleInventoryDuplicateEvent {
  readonly id: PuzzleInventoryItemId;
}

export interface PuzzleInventoryCombinedEvent {
  readonly removed: readonly FragmentId[];
  readonly created: InventoryItem;
}

export interface PuzzleInventoryRestoredEvent {
  readonly count: number;
  readonly rejected: number;
}

/** Typed event map for this inventory's own `EventBus`. */
export interface PuzzleInventoryEventMap {
  'item-added': PuzzleInventoryItemEvent;
  'item-removed': PuzzleInventoryItemEvent;
  'duplicate-rejected': PuzzleInventoryDuplicateEvent;
  'fragments-combined': PuzzleInventoryCombinedEvent;
  cleared: Record<string, never>;
  restored: PuzzleInventoryRestoredEvent;
}

export type PuzzleInventoryEventName = keyof PuzzleInventoryEventMap;
export type PuzzleInventoryListener<K extends PuzzleInventoryEventName> = (
  payload: PuzzleInventoryEventMap[K],
) => void;

/* ==========================================================================
 * PuzzleInventory
 * ========================================================================== */

export class PuzzleInventory implements Disposable {
  /** Insertion-ordered storage; Map preserves insertion order for `list()`/`serialize()`. */
  private readonly items = new Map<PuzzleInventoryItemId, InventoryItem>();

  private readonly bus = new EventBus<PuzzleInventoryEventMap>();

  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }

  /* ---------------------------------------------------------------------
   * Subscription API
   * ------------------------------------------------------------------- */

  /** Subscribe to a typed inventory event. Returns an unsubscribe function. */
  on<K extends PuzzleInventoryEventName>(type: K, listener: PuzzleInventoryListener<K>): () => void {
    return this.bus.on(type, listener);
  }

  /** Subscribe once; automatically unsubscribes after the first emission. */
  once<K extends PuzzleInventoryEventName>(type: K, listener: PuzzleInventoryListener<K>): () => void {
    return this.bus.once(type, listener);
  }

  off<K extends PuzzleInventoryEventName>(type: K, listener: PuzzleInventoryListener<K>): void {
    this.bus.off(type, listener);
  }

  /* ---------------------------------------------------------------------
   * Core API: add / remove / has / count / list / clear
   * ------------------------------------------------------------------- */

  /**
   * Adds a collectible item. Returns `false` (without mutating state) when the id is
   * unknown, is the combine-only `combined_object` id, or is already held — duplicate
   * collection is a no-op, not an error.
   */
  add(id: CollectibleItemId): boolean {
    if (this._disposed) return false;

    if (!isCollectibleId(id)) {
      log.warn('rejected add() for non-collectible id', { id: String(id) });
      return false;
    }

    if (this.items.has(id)) {
      this.bus.emit('duplicate-rejected', { id });
      return false;
    }

    const item = this.instantiate(id);
    this.items.set(id, item);
    this.bus.emit('item-added', { id, item });
    return true;
  }

  /** Removes an item (any id this inventory can hold, including `combined_object`). */
  remove(id: PuzzleInventoryItemId): boolean {
    if (this._disposed) return false;

    const item = this.items.get(id);
    if (!item) return false;

    this.items.delete(id);
    this.bus.emit('item-removed', { id, item });
    return true;
  }

  has(id: PuzzleInventoryItemId): boolean {
    return this.items.has(id);
  }

  /** True only when all 3 drawer keys are held. */
  hasAllDrawerKeys(): boolean {
    return DRAWER_KEY_IDS.every((id) => this.items.has(id));
  }

  /** True only when all 3 fragments are held (and not yet combined). */
  hasAllFragments(): boolean {
    return FRAGMENT_IDS.every((id) => this.items.has(id));
  }

  /** Total item count, or the count for a single `InventoryItemType` category. */
  count(type?: InventoryItemType): number {
    if (type === undefined) return this.items.size;

    let total = 0;
    for (const item of this.items.values()) {
      if (item.type === type) total += 1;
    }
    return total;
  }

  /** Snapshot list of currently held items, in collection order. */
  list(): readonly InventoryItem[] {
    return Array.from(this.items.values());
  }

  /** Removes every held item (does not reset anything outside this class). */
  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.bus.emit('cleared', {});
  }

  /* ---------------------------------------------------------------------
   * Fragment combination
   * ------------------------------------------------------------------- */

  /**
   * Combines the 3 fragments into `combined_object`. Requires all 3 fragments to be
   * present and the combined object to not already exist; otherwise this is a no-op
   * that returns `false`. The removal of the fragments and insertion of the combined
   * object happen atomically from the caller's perspective (a single synchronous
   * block), so no intermediate, inconsistent state is ever observable or persisted.
   */
  combineFragments(): boolean {
    if (this._disposed) return false;
    if (this.items.has(COMBINED_ITEM_ID)) return false;
    if (!this.hasAllFragments()) return false;

    for (const id of FRAGMENT_IDS) this.items.delete(id);

    const created = this.instantiate(COMBINED_ITEM_ID);
    this.items.set(COMBINED_ITEM_ID, created);

    this.bus.emit('fragments-combined', { removed: FRAGMENT_IDS, created });
    return true;
  }

  /* ---------------------------------------------------------------------
   * Serialize / restore
   * ------------------------------------------------------------------- */

  /** Produces a plain, JSON-safe snapshot suitable for `SaveManager`. */
  serialize(): PuzzleInventorySnapshot {
    return {
      version: PUZZLE_INVENTORY_SNAPSHOT_VERSION,
      items: Array.from(this.items.keys()),
    };
  }

  /**
   * Restores from a snapshot produced by `serialize()`. Fully validates the input:
   * malformed payloads, unknown ids, and duplicate ids are dropped rather than
   * throwing, so a corrupted save degrades to an empty/partial inventory instead of
   * crashing load. Existing contents are replaced, not merged.
   */
  restore(snapshot: unknown): boolean {
    if (this._disposed) return false;

    const validated = PuzzleInventory.validateSnapshot(snapshot);
    if (validated === null) {
      log.warn('rejected restore(): malformed snapshot', {});
      return false;
    }

    this.items.clear();

    for (const id of validated.accepted) {
      this.items.set(id, this.instantiate(id));
    }

    this.bus.emit('restored', { count: this.items.size, rejected: validated.rejected });
    return true;
  }

  /**
   * Validates a snapshot without mutating any instance. Returns the de-duplicated,
   * known-id list plus a rejected count, or `null` if the payload shape itself is
   * invalid (not an object, wrong version, `items` not an array).
   */
  private static validateSnapshot(
    snapshot: unknown,
  ): { accepted: PuzzleInventoryItemId[]; rejected: number } | null {
    if (!isPlainObject(snapshot)) return null;
    if (snapshot.version !== PUZZLE_INVENTORY_SNAPSHOT_VERSION) return null;
    if (!Array.isArray(snapshot.items)) return null;

    const seen = new Set<PuzzleInventoryItemId>();
    const accepted: PuzzleInventoryItemId[] = [];
    let rejected = 0;

    for (const raw of snapshot.items) {
      if (!isInventoryItemId(raw) || seen.has(raw)) {
        rejected += 1;
        continue;
      }
      seen.add(raw);
      accepted.push(raw);
    }

    // A restored inventory must still obey "3 unique fragments -> at most one
    // combined object": if a corrupt save somehow carries both, prefer the
    // combined object and drop the stale fragments rather than reject the load.
    if (seen.has(COMBINED_ITEM_ID)) {
      for (const fragmentId of FRAGMENT_IDS) {
        const index = accepted.indexOf(fragmentId);
        if (index !== -1) {
          accepted.splice(index, 1);
          rejected += 1;
        }
      }
    }

    return { accepted, rejected };
  }

  /* ---------------------------------------------------------------------
   * Internal helpers
   * ------------------------------------------------------------------- */

  private instantiate(id: PuzzleInventoryItemId): InventoryItem {
    const def = ITEM_DEFINITIONS[id];
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      description: def.description,
      collected: true,
      puzzleId: def.id,
    };
  }

  /* ---------------------------------------------------------------------
   * Disposable
   * ------------------------------------------------------------------- */

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.items.clear();
    this.bus.dispose();
  }
}