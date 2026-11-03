/**
 * FragmentCombinationSystem.ts
 *
 * Manages collection and combination of three hidden object fragments into
 * a single completed object item. Framework-agnostic: does not touch Three.js
 * scene graph, meshes, or materials directly. Integrate via the public
 * callbacks and methods documented below.
 *
 * No glowing/emissive collectible materials are created or referenced here.
 */

/** Unique identifiers for the three fragments. Extend/rename as needed. */
export enum FragmentId {
  Fragment_A = "fragment_a",
  Fragment_B = "fragment_b",
  Fragment_C = "fragment_c",
}

/** Identifier for the item produced once all fragments are combined. */
export const COMPLETED_OBJECT_ID = "completed_object" as const;

export type CompletedObjectId = typeof COMPLETED_OBJECT_ID;

/** Result of a combine attempt, with a human-readable reason on failure. */
export interface CombineResult {
  success: boolean;
  message: string;
  completedObjectId?: CompletedObjectId;
}

/** Serializable snapshot of system state for save/load. */
export interface FragmentCombinationState {
  collected: FragmentId[];
  combined: boolean;
  version: 1;
}

/** Callback fired when a fragment is newly collected (not a duplicate). */
export type FragmentCollectedCallback = (fragmentId: FragmentId) => void;

/** Callback fired when all fragments combine into the completed object. */
export type CombinationCompleteCallback = (
  completedObjectId: CompletedObjectId
) => void;

/** Callback fired on any failed combine attempt, with the reason. */
export type CombinationFailedCallback = (message: string) => void;

const ALL_FRAGMENT_IDS: readonly FragmentId[] = [
  FragmentId.Fragment_A,
  FragmentId.Fragment_B,
  FragmentId.Fragment_C,
];

export class FragmentCombinationSystem {
  private collected: Set<FragmentId> = new Set();
  private combined: boolean = false;

  private onFragmentCollected: FragmentCollectedCallback | null = null;
  private onCombinationComplete: CombinationCompleteCallback | null = null;
  private onCombinationFailed: CombinationFailedCallback | null = null;

  constructor() {}

  // ---------------------------------------------------------------------
  // Event wiring (call these once during setup, e.g. in your game init)
  // ---------------------------------------------------------------------

  public setOnFragmentCollected(cb: FragmentCollectedCallback | null): void {
    this.onFragmentCollected = cb;
  }

  public setOnCombinationComplete(cb: CombinationCompleteCallback | null): void {
    this.onCombinationComplete = cb;
  }

  public setOnCombinationFailed(cb: CombinationFailedCallback | null): void {
    this.onCombinationFailed = cb;
  }

  // ---------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------

  /**
   * Call this when the player picks up a fragment (after your pickup/
   * interaction logic confirms the pickup). Collection is idempotent:
   * collecting an already-held fragment is a no-op and returns false.
   */
  public collectFragment(fragmentId: FragmentId): boolean {
    if (this.combined) {
      // Fragments are irrelevant after combination; ignore silently.
      return false;
    }
    if (this.collected.has(fragmentId)) {
      return false;
    }
    this.collected.add(fragmentId);
    if (this.onFragmentCollected) {
      this.onFragmentCollected(fragmentId);
    }
    return true;
  }

  public hasFragment(fragmentId: FragmentId): boolean {
    return this.collected.has(fragmentId);
  }

  public getCollectedFragments(): FragmentId[] {
    return Array.from(this.collected);
  }

  public getMissingFragments(): FragmentId[] {
    return ALL_FRAGMENT_IDS.filter((id) => !this.collected.has(id));
  }

  public isSetComplete(): boolean {
    return ALL_FRAGMENT_IDS.every((id) => this.collected.has(id));
  }

  public isCombined(): boolean {
    return this.combined;
  }

  // ---------------------------------------------------------------------
  // Combination
  // ---------------------------------------------------------------------

  /**
   * Call this from your interaction handler when the player uses the
   * fragment set on the combination box. Returns a CombineResult the
   * caller can use to drive UI feedback (e.g. subtitle/toast text).
   */
  public attemptCombine(): CombineResult {
    if (this.combined) {
      const message = "The object is already whole. There is nothing left to combine.";
      this.fireFailure(message);
      return { success: false, message };
    }

    const missing = this.getMissingFragments();
    if (missing.length > 0) {
      const missingNames = missing.map((id) => this.describeFragment(id)).join(", ");
      const message =
        missing.length === ALL_FRAGMENT_IDS.length
          ? "You have no fragments to combine yet."
          : `The combination is incomplete. Missing: ${missingNames}.`;
      this.fireFailure(message);
      return { success: false, message };
    }

    // All fragments present — combine.
    this.combined = true;
    this.collected.clear(); // fragments are consumed into the completed object

    const message = "The fragments lock together, forming the completed object.";
    if (this.onCombinationComplete) {
      this.onCombinationComplete(COMPLETED_OBJECT_ID);
    }

    return {
      success: true,
      message,
      completedObjectId: COMPLETED_OBJECT_ID,
    };
  }

  private fireFailure(message: string): void {
    if (this.onCombinationFailed) {
      this.onCombinationFailed(message);
    }
  }

  private describeFragment(id: FragmentId): string {
    switch (id) {
      case FragmentId.Fragment_A:
        return "first fragment";
      case FragmentId.Fragment_B:
        return "second fragment";
      case FragmentId.Fragment_C:
        return "third fragment";
      default:
        return id;
    }
  }

  // ---------------------------------------------------------------------
  // Serialize / Restore / Reset
  // ---------------------------------------------------------------------

  public serialize(): FragmentCombinationState {
    return {
      collected: Array.from(this.collected),
      combined: this.combined,
      version: 1,
    };
  }

  /**
   * Restores state from a save file. Validates fragment IDs defensively
   * in case the save was tampered with or comes from an older version;
   * unknown IDs are dropped rather than throwing, to avoid corrupting a
   * load for an otherwise-valid save.
   */
  public restore(state: FragmentCombinationState | null | undefined): void {
    this.reset();
    if (!state) {
      return;
    }

    if (Array.isArray(state.collected)) {
      for (const id of state.collected) {
        if (ALL_FRAGMENT_IDS.includes(id)) {
          this.collected.add(id);
        }
      }
    }

    this.combined = state.combined === true;

    // If restored as combined, fragments should not also be present
    // (they are consumed on combination). Enforce that invariant.
    if (this.combined) {
      this.collected.clear();
    }
  }

  /** Clears all progress. Does not touch scene meshes/materials. */
  public reset(): void {
    this.collected.clear();
    this.combined = false;
  }
}

// =============================================================================
// Deterministic seeded placement utility
// =============================================================================

/**
 * mulberry32 — small, fast, deterministic PRNG. Given the same seed, it
 * always produces the same sequence, so a saved run can restore the exact
 * same fragment placement layout.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A candidate spawn location your scene code already knows about. */
export interface FragmentSpawnCandidate<T = unknown> {
  id: string;
  data: T;
}

/**
 * Deterministically assigns each FragmentId to one spawn candidate, given a
 * numeric seed (e.g. derived from the save slot or a fixed run seed).
 * Pure function: given the same seed and candidate list (same order), the
 * assignment is always identical, which is what makes it save/load-safe.
 *
 * This does NOT create meshes, materials, or geometry — call it from your
 * existing spawn system, which is responsible for actually instantiating
 * pickups at the returned candidate.
 */
export function assignFragmentSpawnPoints<T>(
  candidates: ReadonlyArray<FragmentSpawnCandidate<T>>,
  seed: number
): Map<FragmentId, FragmentSpawnCandidate<T>> {
  if (candidates.length < ALL_FRAGMENT_IDS.length) {
    throw new Error(
      `assignFragmentSpawnPoints requires at least ${ALL_FRAGMENT_IDS.length} candidates, got ${candidates.length}`
    );
  }

  const rng = mulberry32(seed);

  // Fisher-Yates shuffle using the seeded RNG, deterministic for a given seed.
  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  const result = new Map<FragmentId, FragmentSpawnCandidate<T>>();
  ALL_FRAGMENT_IDS.forEach((fragmentId, index) => {
    result.set(fragmentId, pool[index]);
  });

  return result;
}