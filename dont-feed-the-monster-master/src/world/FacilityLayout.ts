/**
 * FacilityLayout is the shape every chapter's map data must provide.
 *
 * This file defines the INTERFACE ONLY and introduces no behaviour change to Chapter 1.
 * `LevelLayout.ts` is untouched: all of its existing module-level exports (WALLS, ROOMS,
 * DOORS, PROPS, LOCKERS, SIGNS, NOTES, CRAWLSPACES, PATROL_POINTS_XZ, EXIT_POSITION,
 * KEYCARD_POSITION, PLAYER_START, WORLD_BOUNDS, getSolids(), crawlspaceAt(), etc.) keep
 * working exactly as before, and every existing consumer (WorldManager, FacilityBuilder,
 * NavigationGraph, Monster, MonsterNavigation, PlayerController, GameController, the
 * testing specs) keeps importing from `./LevelLayout` unchanged.
 *
 * `CHAPTER_01_LAYOUT`, exported from LevelLayout.ts alongside everything else, packages
 * those SAME existing arrays/functions (no copies, no re-authoring) into one object that
 * satisfies this interface. It exists so a future ChapterLoader can select between chapter
 * layouts by reference instead of every module importing chapter-specific names directly.
 * Nothing reads from it yet; it is purely additive.
 *
 * Chapters 2–5 are NOT implemented by this file. Each will eventually need its own real,
 * authored, reachability-tested room/wall/door/prop/sign/patrol data satisfying this same
 * interface — that is future work, not represented here as a placeholder.
 */

import type {
  CrawlspaceSpec,
  DoorSpec,
  LockerSpec,
  NoteSpec,
  Point2,
  PropSpec,
  RoomSpec,
  SignSpec,
  SolidSpec,
  WallSpec,
} from './LevelLayout';

export interface FacilityLayout {
  /** Stable chapter identifier, matching the campaign chapter id (e.g. 'chapter-01'). */
  readonly id: string;

  /** World extents used for boundary collision. */
  readonly worldBounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };

  readonly playerStart: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly exitPosition: Point2;
  /** Default/initial keycard position before per-run randomisation relocates it. */
  readonly keycardPosition: Point2;

  readonly walls: readonly WallSpec[];
  readonly doors: readonly DoorSpec[];
  readonly crawlspaces: readonly CrawlspaceSpec[];
  readonly rooms: readonly RoomSpec[];
  readonly props: readonly PropSpec[];
  readonly lockers: readonly LockerSpec[];
  readonly notes: readonly NoteSpec[];
  readonly signs: readonly SignSpec[];
  readonly patrolPointsXZ: readonly Point2[];

  /** Every footprint that blocks walking/sight — same contract as LevelLayout's getSolids(). */
  getSolids(): SolidSpec[];
  /** Which crawlspace interior (if any) contains this point — same contract as crawlspaceAt(). */
  crawlspaceAt(x: number, z: number): CrawlspaceSpec | null;
}
