import type { Vector3 } from 'three';
import { Logger } from '../core/Logger';
import type { EventBus } from '../core/EventBus';
import type {
  FragmentId,
  FragmentStateRecord,
  InventoryItem,
  PuzzleActionResult,
  PuzzleEventPayloadMap,
} from '../core/types';
import { FRAGMENT_COUNT, PUZZLE_NOISE } from '../core/types';

/** Ordered, authoritative list of fragment ids. Do not reorder — save data indexes by id, not position. */
export const FRAGMENT_IDS: readonly FragmentId[] = ['fragment_1', 'fragment_2', 'fragment_3'];

export const COMBINED_OBJECT_ITEM: Readonly<InventoryItem> = Object.freeze({
  id: 'combined_object',
  name: 'Assembled Relic',
  type: 'composite',
  description: 'Three fragments, fitted together. It feels complete now — and heavier than it should.',
  collected: false,
  puzzleId: 'combined_object',
});

export interface FragmentCombinationDeps {
  readonly events: EventBus<PuzzleEventPayloadMap>;
  /** Pushes a world-space noise event into SoundEventSystem so MonsterPerception can react. */
  readonly onNoise?: (position: Vector3, loudness: number) => void;
  /** Adds the completed object to the player's inventory. Called exactly once, on successful combine. */
  readonly grantItem: (item: InventoryItem) => void;
  /** True once a fragment mesh/pickup has actually been collected in the world (collision/raycast gate). */
  readonly isWithinInteractionRange?: (fragmentId: FragmentId) => boolean;
}

export interface FragmentCombinationSnapshot {
  fragments: Record<FragmentId, FragmentStateRecord>;
  combined: boolean;
}

/**
 * Tracks the three hidden-object fragments, combines them once all three are collected,
 * and grants the completed object item used on the combination box.
 *
 * Does not own any mesh/material — pickup visuals are the caller's responsibility
 * (per instruction: no glowing collectible materials are created here).
 */
export class FragmentCombinationSystem {
  private readonly log = new Logger({ namespace: 'fragment-combo' });
  private readonly fragments = new Map<FragmentId, FragmentStateRecord>(
    FRAGMENT_IDS.map((id): [FragmentId, FragmentStateRecord] => [id, { collected: false }]),
  );
  private combined = false;

  constructor(private readonly deps: FragmentCombinationDeps) {}

  get isComplete(): boolean {
    return this.combined;
  }

  get collectedCount(): number {
    let count = 0;
    for (const record of this.fragments.values()) {
      if (record.collected) count += 1;
    }
    return count;
  }

  get requiredCount(): number {
    return FRAGMENT_COUNT;
  }

  isCollected(fragmentId: FragmentId): boolean {
    return this.fragments.get(fragmentId)?.collected ?? false;
  }

  /** Call when the player interacts with a fragment pickup in the world. */
  collect(fragmentId: FragmentId, worldPosition?: Vector3): PuzzleActionResult {
    const record = this.fragments.get(fragmentId);

    if (!record) {
      this.log.warn('unknown fragment id', { fragmentId });
      this.deps.events.emit('puzzle:failed', { objectId: fragmentId, reason: 'disabled' });
      return { ok: false, reason: 'disabled' };
    }

    if (this.combined) {
      this.deps.events.emit('puzzle:failed', { objectId: fragmentId, reason: 'already_unlocked' });
      return { ok: false, reason: 'already_unlocked' };
    }

    if (record.collected) {
      this.deps.events.emit('puzzle:failed', { objectId: fragmentId, reason: 'already_searched' });
      return { ok: false, reason: 'already_searched' };
    }

    if (this.deps.isWithinInteractionRange && !this.deps.isWithinInteractionRange(fragmentId)) {
      this.deps.events.emit('puzzle:failed', { objectId: fragmentId, reason: 'out_of_range' });
      return { ok: false, reason: 'out_of_range' };
    }

    record.collected = true;
    this.log.info('fragment collected', { fragmentId, total: this.collectedCount });

    if (worldPosition && this.deps.onNoise) {
      this.deps.onNoise(worldPosition, PUZZLE_NOISE.fragment ?? 0.15);
    }

    this.deps.events.emit('puzzle:fragment-collected', { fragmentId });

    return { ok: true };
  }

  /**
   * Attempts to combine all three fragments into the completed object.
   * Fails with a clear reason when the set is incomplete.
   */
  combine(): PuzzleActionResult {
    if (this.combined) {
      return { ok: false, reason: 'already_unlocked' };
    }

    const missing = FRAGMENT_IDS.filter((id) => !this.isCollected(id));

    if (missing.length > 0) {
      this.log.info('combine rejected: incomplete set', { missing });
      this.deps.events.emit('puzzle:failed', { objectId: 'combination_box', reason: 'missing_item' });
      return { ok: false, reason: 'missing_item' };
    }

    this.combined = true;
    this.deps.grantItem({ ...COMBINED_OBJECT_ITEM, collected: true });
    this.deps.events.emit('puzzle:fragments-combined', { itemId: 'combined_object' });
    this.log.info('fragments combined into completed object');

    return { ok: true };
  }

  /**
   * Human-readable reason for a failed combine attempt, for UI prompts.
   * Does not mutate state or emit events — pure query.
   */
  describeIncomplete(): string | null {
    if (this.combined) return null;

    const missing = FRAGMENT_IDS.filter((id) => !this.isCollected(id));
    if (missing.length === 0) return null;

    const have = this.collectedCount;
    return `You need all 3 fragments to combine this. You have ${have} of ${FRAGMENT_COUNT}.`;
  }

  serialize(): FragmentCombinationSnapshot {
    const fragments = {} as Record<FragmentId, FragmentStateRecord>;
    for (const [id, record] of this.fragments) {
      fragments[id] = { collected: record.collected };
    }
    return { fragments, combined: this.combined };
  }

  restore(snapshot: FragmentCombinationSnapshot): void {
    for (const id of FRAGMENT_IDS) {
      const saved = snapshot.fragments[id];
      this.fragments.set(id, { collected: saved?.collected ?? false });
    }
    this.combined = snapshot.combined ?? false;
  }

  reset(): void {
    for (const id of FRAGMENT_IDS) {
      this.fragments.set(id, { collected: false });
    }
    this.combined = false;
  }

  dispose(): void {
    // No meshes, timers or listeners owned by this system — nothing to clean up.
    // Present for interface symmetry with other puzzle systems.
  }
}