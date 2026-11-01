/**
 * Versioned, validated save/load. Persists the active run seed (so the keycard position
 * is stable across a load), and which chapters are completed / unlocked.
 * Never stores personal data. Fails safe: any corruption just yields a fresh save.
 */

const SAVE_KEY = 'dftm.save.v1';
const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  runSeed: number;
  currentChapterId: string;
  completedChapterIds: string[];
  unlockedChapterIds: string[];
  updatedAt: number;
}

function isValid(data: unknown): data is SaveData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.version === 'number' &&
    typeof d.runSeed === 'number' &&
    typeof d.currentChapterId === 'string' &&
    Array.isArray(d.completedChapterIds) &&
    d.completedChapterIds.every((x) => typeof x === 'string') &&
    Array.isArray(d.unlockedChapterIds) &&
    d.unlockedChapterIds.every((x) => typeof x === 'string') &&
    typeof d.updatedAt === 'number'
  );
}

export function createNewSave(firstChapterId: string, seed: number): SaveData {
  return {
    version: SAVE_VERSION,
    runSeed: seed >>> 0,
    currentChapterId: firstChapterId,
    completedChapterIds: [],
    unlockedChapterIds: [firstChapterId],
    updatedAt: Date.now(),
  };
}

export class SaveManager {
  /** Returns a valid save, or null if none exists / it is corrupted beyond use. */
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

    if (!isValid(parsed)) return null;
    if (parsed.version !== SAVE_VERSION) return null; // future format: don't guess-migrate silently
    return parsed;
  }

  save(data: SaveData): boolean {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }));
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
