/**
 * Versioned, validated save/load. Persists the active run seed (so the keycard position
 * is stable across a load), which chapters are completed / unlocked, and the full puzzle
 * state. Never stores personal data. Fails safe: any corruption just yields a fresh save.
 *
 * v2 adds `puzzle`. v1 payloads migrate in place and are never rejected.
 * The storage key stays `dftm.save.v1`; the format version lives in the payload.
 */

import {
  DRAWER_COUNT, FRAGMENT_COUNT, KEY_COUNT,
  type DrawerContent, type DrawerId, type DrawerKeyId, type DrawerState,
  type FragmentId, type KeycardState, type LockId, type LockState, type PuzzleStage,
} from '../core/types';

const SAVE_KEY = 'dftm.save.v1';
const SAVE_VERSION = 2;

const pad = (n: number): string => String(n).padStart(2, '0');
const drawerIdAt = (n: number): DrawerId => `drawer_${pad(n)}` as DrawerId;
const lockIdAt = (n: number): LockId => `lock_${n}` as LockId;
const fragmentIdAt = (n: number): FragmentId => `fragment_${n}` as FragmentId;
const keyIdAt = (n: number): DrawerKeyId => `drawer_key_${n}` as DrawerKeyId;

const DRAWER_IDS: readonly DrawerId[] = Array.from({ length: DRAWER_COUNT }, (_, i) => drawerIdAt(i + 1));
const LOCK_IDS: readonly LockId[] = Array.from({ length: KEY_COUNT }, (_, i) => lockIdAt(i + 1));
const FRAGMENT_IDS: readonly FragmentId[] = Array.from({ length: FRAGMENT_COUNT }, (_, i) => fragmentIdAt(i + 1));
const KEY_IDS: readonly DrawerKeyId[] = Array.from({ length: KEY_COUNT }, (_, i) => keyIdAt(i + 1));

const DRAWER_STATES: readonly DrawerState[] = ['closed', 'open'];
const LOCK_STATES: readonly LockState[] = ['locked', 'unlocked'];
const KEYCARD_STATES: readonly KeycardState[] = ['in_locker', 'collected', 'used'];

export interface DrawerSave {
  state: DrawerState;
  content: DrawerContent;
  searched: boolean;
}

export interface PuzzleSaveData {
  /** Layout has been generated from `seed`; when true it must never be re-rolled. */
  initialized: boolean;
  drawers: Record<DrawerId, DrawerSave>;
  /** Where each key sits. Mirrors drawer contents; stored so a mismatch is detectable. */
  keyLocations: Record<DrawerKeyId, DrawerId | null>;
  fragments: Record<FragmentId, boolean>;
  locks: Record<LockId, LockState>;
  fragmentsCombined: boolean;
  boxOpened: boolean;
  roomKeyTaken: boolean;
  accessDoorUnlocked: boolean;
  keycardRoomDoorUnlocked: boolean;
  passwordFound: boolean;
  locker: { unlocked: boolean; attempts: number };
  keycard: { state: KeycardState; spawned: boolean };
  stage: PuzzleStage;
  objectiveText: string;
  drawersSearched: number;
  papersRead: number;
}

export interface SaveData {
  version: number;
  runSeed: number;
  currentChapterId: string;
  completedChapterIds: string[];
  unlockedChapterIds: string[];
  updatedAt: number;
  puzzle: PuzzleSaveData;
}

const STAGES: readonly PuzzleStage[] = [
  'explore', 'find_keys', 'unlock_access_door', 'collect_fragments',
  'combine_and_open_box', 'take_room_key', 'search_papers', 'unlock_locker',
  'escape', 'complete',
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const isKeyId = (v: unknown): v is DrawerKeyId =>
  typeof v === 'string' && (KEY_IDS as readonly string[]).includes(v);

/** Empty, ungenerated puzzle state. `initialized: false` lets the system roll the layout once. */
export function emptyPuzzle(): PuzzleSaveData {
  const drawers = {} as Record<DrawerId, DrawerSave>;
  for (const id of DRAWER_IDS) drawers[id] = { state: 'closed', content: null, searched: false };

  const keyLocations = {} as Record<DrawerKeyId, DrawerId | null>;
  for (const id of KEY_IDS) keyLocations[id] = null;

  const fragments = {} as Record<FragmentId, boolean>;
  for (const id of FRAGMENT_IDS) fragments[id] = false;

  const locks = {} as Record<LockId, LockState>;
  for (const id of LOCK_IDS) locks[id] = 'locked';

  return {
    initialized: false,
    drawers,
    keyLocations,
    fragments,
    locks,
    fragmentsCombined: false,
    boxOpened: false,
    roomKeyTaken: false,
    accessDoorUnlocked: false,
    keycardRoomDoorUnlocked: false,
    passwordFound: false,
    locker: { unlocked: false, attempts: 0 },
    keycard: { state: 'in_locker', spawned: false },
    stage: 'explore',
    objectiveText: '',
    drawersSearched: 0,
    papersRead: 0,
  };
}

/**
 * Rebuilds a puzzle state from untrusted input. Every field falls back to the empty
 * default, ids not in the current layout are dropped, and a key set that does not
 * match the drawers forces `initialized: false` so the layout is regenerated once.
 */
export function sanitizePuzzle(raw: unknown): PuzzleSaveData {
  const base = emptyPuzzle();
  if (!isRecord(raw)) return base;

  const drawersRaw = isRecord(raw.drawers) ? raw.drawers : {};
  let placedKeys = 0;

  for (const id of DRAWER_IDS) {
    const entry = drawersRaw[id];
    if (!isRecord(entry)) continue;
    const content: DrawerContent = isKeyId(entry.content) ? entry.content : null;
    if (content) placedKeys += 1;
    base.drawers[id] = {
      state: oneOf(entry.state, DRAWER_STATES, 'closed'),
      content,
      searched: entry.searched === true,
    };
  }

  // Cross-check key locations against the drawers that actually hold keys.
  for (const keyId of KEY_IDS) {
    const holder = DRAWER_IDS.find((d) => base.drawers[d].content === keyId) ?? null;
    base.keyLocations[keyId] = holder;
  }

  const fragmentsRaw = isRecord(raw.fragments) ? raw.fragments : {};
  for (const id of FRAGMENT_IDS) base.fragments[id] = fragmentsRaw[id] === true;

  const locksRaw = isRecord(raw.locks) ? raw.locks : {};
  for (const id of LOCK_IDS) base.locks[id] = oneOf(locksRaw[id], LOCK_STATES, 'locked');

  base.fragmentsCombined = raw.fragmentsCombined === true;
  base.boxOpened = raw.boxOpened === true;
  base.roomKeyTaken = raw.roomKeyTaken === true;
  base.accessDoorUnlocked = raw.accessDoorUnlocked === true;
  base.keycardRoomDoorUnlocked = raw.keycardRoomDoorUnlocked === true;
  base.passwordFound = raw.passwordFound === true;

  const lockerRaw = isRecord(raw.locker) ? raw.locker : {};
  base.locker = {
    unlocked: lockerRaw.unlocked === true,
    attempts: clampInt(lockerRaw.attempts, 0, 999, 0),
  };

  const keycardRaw = isRecord(raw.keycard) ? raw.keycard : {};
  base.keycard = {
    state: oneOf(keycardRaw.state, KEYCARD_STATES, 'in_locker'),
    spawned: keycardRaw.spawned === true,
  };

  base.stage = oneOf(raw.stage, STAGES, 'explore');
  base.objectiveText = typeof raw.objectiveText === 'string' ? raw.objectiveText.slice(0, 240) : '';
  base.drawersSearched = clampInt(raw.drawersSearched, 0, DRAWER_COUNT, 0);
  base.papersRead = clampInt(raw.papersRead, 0, 9999, 0);

  // A partial or duplicated key set cannot be trusted; regenerate on next load.
  base.initialized = raw.initialized === true && placedKeys === KEY_COUNT;

  return base;
}

function isBaseValid(data: unknown): data is Record<string, unknown> {
  if (!isRecord(data)) return false;
  return (
    typeof data.version === 'number' &&
    typeof data.runSeed === 'number' &&
    typeof data.currentChapterId === 'string' &&
    Array.isArray(data.completedChapterIds) &&
    Array.isArray(data.unlockedChapterIds) &&
    typeof data.updatedAt === 'number'
  );
}

/** Normalises any supported payload version to the current shape. */
function migrate(data: Record<string, unknown>): SaveData {
  const runSeed = typeof data.runSeed === 'number' ? data.runSeed >>> 0 : 0;
  return {
    version: SAVE_VERSION,
    runSeed,
    currentChapterId: typeof data.currentChapterId === 'string' ? data.currentChapterId : '',
    completedChapterIds: asStringArray(data.completedChapterIds),
    unlockedChapterIds: asStringArray(data.unlockedChapterIds),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    // v1 has no puzzle block: sanitizePuzzle(undefined) yields an ungenerated default.
    puzzle: sanitizePuzzle(data.puzzle),
  };
}

export function createNewSave(firstChapterId: string, seed: number): SaveData {
  return {
    version: SAVE_VERSION,
    runSeed: seed >>> 0,
    currentChapterId: firstChapterId,
    completedChapterIds: [],
    unlockedChapterIds: [firstChapterId],
    updatedAt: Date.now(),
    puzzle: emptyPuzzle(),
  };
}

/** True when the layout for this save has already been generated and must not be re-rolled. */
export function hasGeneratedPuzzle(data: SaveData): boolean {
  return data.puzzle.initialized;
}

export class SaveManager {
  /** Returns a valid, migrated save, or null if none exists / it is corrupted beyond use. */
  load(): SaveData | null {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(SAVE_KEY);
    } catch {
      return null; // storage unavailable (private mode, disabled, etc.)
    }
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null; // corrupted JSON
    }

    if (!isBaseValid(parsed)) return null;
    if (typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) return null; // newer format

    return migrate(parsed);
  }

  save(data: SaveData): boolean {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        ...data,
        version: SAVE_VERSION,
        updatedAt: Date.now(),
      }));
      return true;
    } catch {
      return false; // quota exceeded or storage unavailable; caller should warn, not crash
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Attaches a puzzle snapshot, sanitising it on the way in so a bad write cannot poison the save. */
  withPuzzle(data: SaveData, puzzle: PuzzleSaveData): SaveData {
    return { ...data, puzzle: sanitizePuzzle(puzzle), updatedAt: Date.now() };
  }

  markChapterCompleted(data: SaveData, chapterId: string, nextChapterId: string | null): SaveData {
    const completed = data.completedChapterIds.includes(chapterId)
      ? data.completedChapterIds
      : [...data.completedChapterIds, chapterId];
    const unlocked = nextChapterId && !data.unlockedChapterIds.includes(nextChapterId)
      ? [...data.unlockedChapterIds, nextChapterId]
      : data.unlockedChapterIds;
    return {
      ...data,
      completedChapterIds: completed,
      unlockedChapterIds: unlocked,
      currentChapterId: nextChapterId ?? data.currentChapterId,
      updatedAt: Date.now(),
    };
  }

  isUnlocked(data: SaveData, chapterId: string): boolean {
    return data.unlockedChapterIds.includes(chapterId);
  }
}