/**
 * PasswordLocker.ts
 *
 * Password-gated locker for the keycard room. Requires the password
 * revealed by a specific facility paper (tracked via DocumentRegistry's
 * clue-read event, routed in through markClueRead()). Grants a one-time
 * keycard reward on correct entry.
 *
 * Does not create or reference any Three.js mesh/material directly. The
 * keycard pickup mesh must be created by your existing asset pipeline
 * using a matte, non-emissive material (no emissive map / emissiveIntensity).
 *
 * The password value itself is never read from PasswordLocker's own
 * properties by callers other than internal validation — see
 * isPasswordKnownToPlayer() / getHudSafePasswordHint() for HUD-safe access.
 */

/**
 * Facility-specific password configuration.
 *
 * This module intentionally owns the real password and validation helpers so it
 * cannot import itself via a circular alias.
 */
export const FACILITY_PASSWORD = "F4CILITY-7" as const;
export const CLUE_PAPER_ID = "facility_keycard_clue" as const;

export function normalizePasswordInput(value: string): string {
  return value.trim().toUpperCase();
}

export function isCorrectPassword(input: string): boolean {
  return normalizePasswordInput(input) === normalizePasswordInput(FACILITY_PASSWORD);
}

/** Fixed identifier for the one-time keycard reward item. */
export const KEYCARD_ITEM_ID = "keycard_room_keycard" as const;
export type KeycardItemId = typeof KEYCARD_ITEM_ID;

/** Result of a submitted password attempt. */
export interface PasswordAttemptResult {
  success: boolean;
  message: string;
  lockedOut: boolean;
  keycardGranted?: KeycardItemId;
}

/** Serializable snapshot of locker state for save/load. */
export interface PasswordLockerState {
  unlocked: boolean;
  keycardGranted: boolean;
  cluePaperRead: boolean;
  failedAttempts: number;
  lockoutUntilMs: number; // epoch ms; 0 means not locked out
  version: 1;
}

export type WrongPasswordCallback = (message: string, attemptsRemaining: number) => void;
export type UnlockedCallback = (keycardItemId: KeycardItemId) => void;
export type LockedOutCallback = (message: string, lockoutRemainingMs: number) => void;
export type InvalidInputCallback = (message: string) => void;

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 3;
const LOCKOUT_DURATION_MS = 30_000; // 30s cooldown to avoid spam/noisy feedback
const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 64;

export class PasswordLocker {
  private unlocked: boolean = false;
  private keycardGranted: boolean = false;
  private cluePaperRead: boolean = false;
  private failedAttempts: number = 0;
  private lockoutUntilMs: number = 0;

  private onWrongPassword: WrongPasswordCallback | null = null;
  private onUnlocked: UnlockedCallback | null = null;
  private onLockedOut: LockedOutCallback | null = null;
  private onInvalidInput: InvalidInputCallback | null = null;

  /** Injectable clock for deterministic testing; defaults to Date.now. */
  constructor(private readonly now: () => number = () => Date.now()) {}

  // ---------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------

  public setOnWrongPassword(cb: WrongPasswordCallback | null): void {
    this.onWrongPassword = cb;
  }

  public setOnUnlocked(cb: UnlockedCallback | null): void {
    this.onUnlocked = cb;
  }

  public setOnLockedOut(cb: LockedOutCallback | null): void {
    this.onLockedOut = cb;
  }

  public setOnInvalidInput(cb: InvalidInputCallback | null): void {
    this.onInvalidInput = cb;
  }

  // ---------------------------------------------------------------------
  // Clue wiring — call this from DocumentRegistry's "paper read" event
  // when the paper with id === CLUE_PAPER_ID is read for the first time.
  // ---------------------------------------------------------------------

  /**
   * Call with the id of the paper the player just read. If it matches
   * CLUE_PAPER_ID, the locker records that the player now legitimately
   * knows the password. This does NOT display the password itself —
   * your DocumentRegistry/HUD is responsible for rendering the paper's
   * own text, which separately contains the password.
   */
  public markClueRead(paperId: string): void {
    if (paperId === CLUE_PAPER_ID) {
      this.cluePaperRead = true;
    }
  }

  public isClueRead(): boolean {
    return this.cluePaperRead;
  }

  // ---------------------------------------------------------------------
  // HUD-safe accessors — password is never exposed before the clue is read
  // ---------------------------------------------------------------------

  /**
   * Returns true only once the player has read the clue paper. Use this
   * to gate any HUD element that might otherwise reveal or hint at the
   * password (e.g. an "notes" journal entry referencing the locker).
   */
  public isPasswordKnownToPlayer(): boolean {
    return this.cluePaperRead;
  }

  /**
   * HUD-safe hint string. Returns null (render nothing) until the clue
   * has been read, preventing any premature leak in UI or debug logs.
   * Intentionally does NOT return the raw FACILITY_PASSWORD even after
   * the clue is read — the paper's own text (rendered by DocumentRegistry)
   * is the sole in-fiction source; this is only a locker-state hint.
   */
  public getHudSafePasswordHint(): string | null {
    if (!this.cluePaperRead) {
      return null;
    }
    return "Locker code known (see notes).";
  }

  // ---------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public isKeycardGranted(): boolean {
    return this.keycardGranted;
  }

  public isLockedOut(): boolean {
    return this.unlocked ? false : this.now() < this.lockoutUntilMs;
  }

  public getLockoutRemainingMs(): number {
    const remaining = this.lockoutUntilMs - this.now();
    return remaining > 0 ? remaining : 0;
  }

  // ---------------------------------------------------------------------
  // Password submission
  // ---------------------------------------------------------------------

  /**
   * Call this from your interaction/UI code when the player submits a
   * password string at the keypad. Validates input, checks lockout,
   * compares against the authoritative FACILITY_PASSWORD, and grants the
   * one-time keycard on first correct entry.
   */
  public submitPassword(rawInput: string): PasswordAttemptResult {
    if (this.unlocked) {
      const message = "The locker is already unlocked.";
      return { success: true, message, lockedOut: false };
    }

    // --- Input validation ---
    if (typeof rawInput !== "string") {
      const message = "Invalid input.";
      this.fireInvalid(message);
      return { success: false, message, lockedOut: false };
    }

    const trimmed = rawInput.trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH || trimmed.length > MAX_PASSWORD_LENGTH) {
      const message = `Enter a code between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
      this.fireInvalid(message);
      return { success: false, message, lockedOut: false };
    }

    // Only allow alphanumeric input to match the keypad's expected charset.
    if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
      const message = "The keypad only accepts letters and numbers.";
      this.fireInvalid(message);
      return { success: false, message, lockedOut: false };
    }

    // --- Lockout check ---
    if (this.isLockedOut()) {
      const remaining = this.getLockoutRemainingMs();
      const message = `The keypad is disabled. Try again in ${Math.ceil(remaining / 1000)}s.`;
      if (this.onLockedOut) {
        this.onLockedOut(message, remaining);
      }
      return { success: false, message, lockedOut: true };
    }

    // --- Correctness check ---
    if (isCorrectPassword(trimmed)) {
      return this.unlock();
    }

    // --- Wrong password path ---
    this.failedAttempts += 1;

    if (this.failedAttempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
      this.lockoutUntilMs = this.now() + LOCKOUT_DURATION_MS;
      this.failedAttempts = 0; // reset counter for the next lockout cycle
      const message = `Incorrect code. Keypad locked for ${Math.ceil(LOCKOUT_DURATION_MS / 1000)}s.`;
      if (this.onLockedOut) {
        this.onLockedOut(message, LOCKOUT_DURATION_MS);
      }
      return { success: false, message, lockedOut: true };
    }

    const attemptsRemaining = MAX_ATTEMPTS_BEFORE_LOCKOUT - this.failedAttempts;
    const message = "Incorrect code.";
    if (this.onWrongPassword) {
      this.onWrongPassword(message, attemptsRemaining);
    }
    return { success: false, message, lockedOut: false };
  }

  private unlock(): PasswordAttemptResult {
    this.unlocked = true;
    this.failedAttempts = 0;
    this.lockoutUntilMs = 0;

    let keycardGranted: KeycardItemId | undefined = undefined;
    if (!this.keycardGranted) {
      this.keycardGranted = true;
      keycardGranted = KEYCARD_ITEM_ID;
      if (this.onUnlocked) {
        this.onUnlocked(KEYCARD_ITEM_ID);
      }
    }

    return {
      success: true,
      message: "Correct. The locker unlocks.",
      lockedOut: false,
      keycardGranted,
    };
  }

  private fireInvalid(message: string): void {
    if (this.onInvalidInput) {
      this.onInvalidInput(message);
    }
  }

  // ---------------------------------------------------------------------
  // Serialize / Restore / Reset
  // ---------------------------------------------------------------------

  public serialize(): PasswordLockerState {
    return {
      unlocked: this.unlocked,
      keycardGranted: this.keycardGranted,
      cluePaperRead: this.cluePaperRead,
      failedAttempts: this.failedAttempts,
      lockoutUntilMs: this.lockoutUntilMs,
      version: 1,
    };
  }

  public restore(state: PasswordLockerState | null | undefined): void {
    this.reset();
    if (!state) {
      return;
    }
    this.unlocked = state.unlocked === true;
    this.keycardGranted = state.keycardGranted === true;
    this.cluePaperRead = state.cluePaperRead === true;
    this.failedAttempts =
      typeof state.failedAttempts === "number" && state.failedAttempts >= 0
        ? state.failedAttempts
        : 0;
    this.lockoutUntilMs =
      typeof state.lockoutUntilMs === "number" && state.lockoutUntilMs >= 0
        ? state.lockoutUntilMs
        : 0;

    // Invariant: an unlocked locker always implies the clue was known.
    if (this.unlocked) {
      this.cluePaperRead = true;
    }
  }

  /** Clears all progress. Does not touch scene meshes/materials. */
  public reset(): void {
    this.unlocked = false;
    this.keycardGranted = false;
    this.cluePaperRead = false;
    this.failedAttempts = 0;
    this.lockoutUntilMs = 0;
  }
}

