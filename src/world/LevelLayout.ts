/**
 * Chapter 1 layout as pure data (no three.js) so the game, the A* navigation graph and the headless tests all
 * read the SAME geometry. Coordinates are metres on the XZ plane; boxes are centred on (x, z).
 *
 * The facility is a 3x4 block of rooms (60 x 64 m). Every neighbouring pair of rooms in the original 3x3 block is
 * joined by a doorway, so the rooms form many loops (Granny-style): you can always run around a block instead of
 * getting cornered. The south service wing (row 4) adds a second big loop and a restricted dead end.
 *
 *            x: -30 ........ -11 ........ 11 ........ 30
 *   z -24  |  Research Lab  | Containment | Records     |
 *   z  -8  |  Storage       | Atrium      | Security    |
 *   z   8  |  Recovery Ward | Mess Hall   | Exit Hall   |
 *   z  24  |  Generator     | Decon       | Specimen    |   <- south service wing (new)
 *   z  40
 *
 * South wing routes:
 *   Ward  -> Generator (door x=-18)      Mess -> Decon (door x=-3.5)
 *   Generator <-> Decon (door z=32)      Decon <-> Specimen (door z=34)   (Specimen is a restricted dead end)
 *   Exit Hall -> Specimen: player-only crawl gap at x=24.5 (a shortcut Subject 09 cannot follow)
 *
 * Crawlspaces: seven tiny closets whose only entrance is a 0.88 m gap. The player (radius 0.35) fits; Subject 09
 * (radius 0.45) physically does not, and the navigation graph uses the same radius, so it can never path inside.
 * Five "service gaps" in room walls work the same way as player-only shortcuts.
 */
import type { FacilityLayout } from './FacilityLayout';

export interface Point2 { x: number; z: number }
export type Facing = '+z' | '-z' | '+x' | '-x';
export interface WallSpec { x: number; z: number; w: number; d: number; h?: number; color?: number }
export interface SolidSpec { x: number; z: number; w: number; d: number; /** default true; low furniture sets false */ blocksSight?: boolean }
export type PropKind = 'shelf' | 'crate' | 'table' | 'bed' | 'bench' | 'counter' | 'console' | 'pillar' | 'planter' | 'hood';
export interface PropSpec extends SolidSpec { h: number; kind: PropKind; color: number }
export interface LockerSpec extends Point2 { label: string; facing: Facing }
export interface DoorSpec { x: number; z: number; /** axis the wall runs along */ axis: 'x' | 'z'; width: number; crawl: boolean }
export interface CrawlspaceSpec {
  id: string;
  label: string;
  /** centre of the 0.88 m entrance gap */
  gap: Point2;
  /** direction from the gap out into the room */
  facing: Facing;
  interior: { minX: number; maxX: number; minZ: number; maxZ: number };
}
export interface RoomSpec { id: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number; floor: number; lamp: { x: number; z: number; color: number } }
/** The optional fields mirror SignFactory's WallSignSpec, so a SignSpec can be passed straight to SignFactory.create(). */
export interface SignSpec {
  text: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  color: number;
  subtitle?: string;
  code?: string;
  arrow?: 'left' | 'right' | 'up';
  tone?: 'clinical' | 'restricted' | 'danger' | 'safe';
  width?: number;
  height?: number;
}
export interface NoteSpec extends Point2 { label: string; text: string }

export const WALL_T = 0.8;
export const DOOR_WIDTH = 3;
export const CRAWL_GAP = 0.88;

export const WORLD_BOUNDS = { minX: -30.4, maxX: 30.4, minZ: -24.4, maxZ: 40.4 } as const;
export const PLAYER_START = { x: -20, z: 18, yaw: -Math.PI / 2 } as const;
export const EXIT_POSITION: Point2 = { x: 29.2, z: 14 };
export const KEYCARD_POSITION: Point2 = { x: 28.3, z: -22.5 };

interface Gap { c: number; w: number }
const door = (c: number): Gap => ({ c, w: DOOR_WIDTH });
const crawl = (c: number): Gap => ({ c, w: CRAWL_GAP });

/** Wall running along X at depth z, from x0 to x1, with gaps. */
function hWall(z: number, x0: number, x1: number, gaps: Gap[], h?: number, color?: number): WallSpec[] {
  const out: WallSpec[] = [];
  let cursor = x0;
  for (const g of [...gaps].sort((a, b) => a.c - b.c)) {
    const a = g.c - g.w / 2;
    if (a > cursor) out.push({ x: (cursor + a) / 2, z, w: a - cursor, d: WALL_T, h, color });
    cursor = g.c + g.w / 2;
  }
  if (x1 > cursor) out.push({ x: (cursor + x1) / 2, z, w: x1 - cursor, d: WALL_T, h, color });
  return out;
}
/** Wall running along Z at x, from z0 to z1, with gaps. */
function vWall(x: number, z0: number, z1: number, gaps: Gap[], h?: number, color?: number): WallSpec[] {
  const out: WallSpec[] = [];
  let cursor = z0;
  for (const g of [...gaps].sort((a, b) => a.c - b.c)) {
    const a = g.c - g.w / 2;
    if (a > cursor) out.push({ x, z: (cursor + a) / 2, w: WALL_T, d: a - cursor, h, color });
    cursor = g.c + g.w / 2;
  }
  if (z1 > cursor) out.push({ x, z: (cursor + z1) / 2, w: WALL_T, d: z1 - cursor, h, color });
  return out;
}

// ---- Room boundaries and doorways -------------------------------------------------------------------------------
const X_WALL_GAPS: Record<string, Gap[]> = {
  // x = -11 (west | centre), gaps measured along z
  '-11': [door(-18), crawl(-6), door(2), door(14)],
  // x = 11 (centre | east)
  '11': [crawl(-20), door(-14), door(-2), door(18)],
};
/** Same two walls, south wing (z 24..40). */
const SOUTH_X_WALL_GAPS: Record<string, Gap[]> = {
  '-11': [door(32)],
  '11': [door(34)],
};
const Z_WALL_GAPS: Record<string, Gap[]> = {
  // z = -8 (north | middle), gaps measured along x
  '-8': [door(-22), door(0), crawl(17), door(22)],
  // z = 8 (middle | south)
  '8': [crawl(-25), door(-18), door(4), door(25)],
  // z = 24 (middle | south wing): Ward->Generator, Mess->Decon, Exit Hall->Specimen (player-only crawl shortcut)
  '24': [door(-18), door(-3.5), crawl(24.5)],
};

const CAGE_COLOR = 0x2d5560;
const CLOSET_COLOR = 0x45515a;

const CLOSET_WALLS: WallSpec[] = [
  // Lab corner (NW)
  ...vWall(-26, -24, -20, [], undefined, CLOSET_COLOR), ...hWall(-20, -30, -26, [crawl(-28)], undefined, CLOSET_COLOR),
  // Storage corner (W room, north-west)
  ...vWall(-26, -8, -4, [], undefined, CLOSET_COLOR), ...hWall(-4, -30, -26, [crawl(-28)], undefined, CLOSET_COLOR),
  // Mess hall corner (south-west)
  ...vWall(-7, 20, 24, [], undefined, CLOSET_COLOR), ...hWall(20, -11, -7, [crawl(-9)], undefined, CLOSET_COLOR),
  // Security corner (north-east)
  ...vWall(26, -8, -4, [], undefined, CLOSET_COLOR), ...hWall(-4, 26, 30, [crawl(28)], undefined, CLOSET_COLOR),
  // Exit hall corner (south-east)
  ...vWall(26, 20, 24, [], undefined, CLOSET_COLOR), ...hWall(20, 26, 30, [crawl(28)], undefined, CLOSET_COLOR),
  // Generator room corner (south-west of the facility)
  ...vWall(-26, 36, 40, [], undefined, CLOSET_COLOR), ...hWall(36, -30, -26, [crawl(-28)], undefined, CLOSET_COLOR),
  // Specimen storage corner (south-east of the facility)
  ...vWall(26, 36, 40, [], undefined, CLOSET_COLOR), ...hWall(36, 26, 30, [crawl(28)], undefined, CLOSET_COLOR),
];

/** The broken containment cell in the middle of the north hall: walk through it or around it. */
const CAGE_WALLS: WallSpec[] = [
  ...hWall(-20, -4, 4, [], 3.4, CAGE_COLOR),
  ...vWall(-4, -20, -13, [], 3.4, CAGE_COLOR),
  ...vWall(4, -20, -13, [{ c: -17.3, w: 2.4 }], 3.4, CAGE_COLOR),
  ...hWall(-13, -4, 4, [{ c: 0, w: 4 }], 3.4, CAGE_COLOR),
];

export const WALLS: WallSpec[] = [
  // Outer shell
  ...hWall(-24, -30.4, 30.4, []), ...hWall(40, -30.4, 30.4, []),
  ...vWall(-30, -24, 40, []), ...vWall(30, -24, 40, []),
  // Room boundaries
  ...vWall(-11, -24, 24, X_WALL_GAPS['-11']), ...vWall(11, -24, 24, X_WALL_GAPS['11']),
  ...vWall(-11, 24, 40, SOUTH_X_WALL_GAPS['-11']), ...vWall(11, 24, 40, SOUTH_X_WALL_GAPS['11']),
  ...hWall(-8, -30, 30, Z_WALL_GAPS['-8']), ...hWall(8, -30, 30, Z_WALL_GAPS['8']),
  ...hWall(24, -30.4, 30.4, Z_WALL_GAPS['24']),
  ...CLOSET_WALLS,
  ...CAGE_WALLS,
];

export const DOORS: DoorSpec[] = [
  ...Object.entries(X_WALL_GAPS).flatMap(([x, gaps]) => gaps.map((g): DoorSpec => ({ x: Number(x), z: g.c, axis: 'z', width: g.w, crawl: g.w < 1.5 }))),
  ...Object.entries(SOUTH_X_WALL_GAPS).flatMap(([x, gaps]) => gaps.map((g): DoorSpec => ({ x: Number(x), z: g.c, axis: 'z', width: g.w, crawl: g.w < 1.5 }))),
  ...Object.entries(Z_WALL_GAPS).flatMap(([z, gaps]) => gaps.map((g): DoorSpec => ({ x: g.c, z: Number(z), axis: 'x', width: g.w, crawl: g.w < 1.5 }))),
];

export const CRAWLSPACES: CrawlspaceSpec[] = [
  { id: 'lab', label: 'Lab crawlspace', gap: { x: -28, z: -20 }, facing: '+z', interior: { minX: -29.6, maxX: -26.4, minZ: -23.6, maxZ: -20.4 } },
  { id: 'storage', label: 'Storage crawlspace', gap: { x: -28, z: -4 }, facing: '+z', interior: { minX: -29.6, maxX: -26.4, minZ: -7.6, maxZ: -4.4 } },
  { id: 'mess', label: 'Mess hall crawlspace', gap: { x: -9, z: 20 }, facing: '-z', interior: { minX: -10.6, maxX: -7.4, minZ: 20.4, maxZ: 23.6 } },
  { id: 'security', label: 'Security crawlspace', gap: { x: 28, z: -4 }, facing: '+z', interior: { minX: 26.4, maxX: 29.6, minZ: -7.6, maxZ: -4.4 } },
  { id: 'exit', label: 'Exit hall crawlspace', gap: { x: 28, z: 20 }, facing: '-z', interior: { minX: 26.4, maxX: 29.6, minZ: 20.4, maxZ: 23.6 } },
  { id: 'generator', label: 'Generator crawlspace', gap: { x: -28, z: 36 }, facing: '-z', interior: { minX: -29.6, maxX: -26.4, minZ: 36.4, maxZ: 39.6 } },
  { id: 'specimen', label: 'Specimen crawlspace', gap: { x: 28, z: 36 }, facing: '-z', interior: { minX: 26.4, maxX: 29.6, minZ: 36.4, maxZ: 39.6 } },
];

export const ROOMS: RoomSpec[] = [
  { id: 'lab', name: 'Research Lab', minX: -30, maxX: -11, minZ: -24, maxZ: -8, floor: 0x2a3a40, lamp: { x: -20, z: -16, color: 0x6fb5cf } },
  { id: 'hall', name: 'Containment Hall', minX: -11, maxX: 11, minZ: -24, maxZ: -8, floor: 0x33262a, lamp: { x: 0, z: -10, color: 0xb04036 } },
  { id: 'records', name: 'Records Archive', minX: 11, maxX: 30, minZ: -24, maxZ: -8, floor: 0x30352a, lamp: { x: 20, z: -16, color: 0x6fb5cf } },
  { id: 'storage', name: 'Storage', minX: -30, maxX: -11, minZ: -8, maxZ: 8, floor: 0x2c3036, lamp: { x: -20, z: 0, color: 0x6fb5cf } },
  { id: 'atrium', name: 'Central Atrium', minX: -11, maxX: 11, minZ: -8, maxZ: 8, floor: 0x252f38, lamp: { x: 0, z: 0, color: 0x8fd0e6 } },
  { id: 'security', name: 'Security Office', minX: 11, maxX: 30, minZ: -8, maxZ: 8, floor: 0x2a2f3a, lamp: { x: 20, z: 2, color: 0x6fb5cf } },
  { id: 'ward', name: 'Recovery Ward', minX: -30, maxX: -11, minZ: 8, maxZ: 24, floor: 0x2d3a36, lamp: { x: -20, z: 16, color: 0x7fc9b4 } },
  { id: 'mess', name: 'Mess Hall', minX: -11, maxX: 11, minZ: 8, maxZ: 24, floor: 0x3a3328, lamp: { x: 0, z: 16, color: 0x6fb5cf } },
  { id: 'exit', name: 'Exit Hall', minX: 11, maxX: 30, minZ: 8, maxZ: 24, floor: 0x3a2a2a, lamp: { x: 20, z: 16, color: 0xb04036 } },
  // South service wing
  { id: 'generator', name: 'Generator Room', minX: -30, maxX: -11, minZ: 24, maxZ: 40, floor: 0x2b2d2a, lamp: { x: -20, z: 32, color: 0xe0b060 } },
  { id: 'decon', name: 'Decontamination', minX: -11, maxX: 11, minZ: 24, maxZ: 40, floor: 0x24343a, lamp: { x: 0, z: 32, color: 0x8fd0e6 } },
  { id: 'specimen', name: 'Specimen Storage', minX: 11, maxX: 30, minZ: 24, maxZ: 40, floor: 0x2a2f3a, lamp: { x: 20, z: 32, color: 0x6fb5cf } },
];

// ---- Furniture and cover ----------------------------------------------------------------------------------------
export const PROPS: PropSpec[] = [
  // Recovery Ward: beds, cabinet, terminal console
  { kind: 'bed', x: -28.4, z: 12, w: 1.0, d: 2.2, h: 0.55, color: 0x5a6b66, blocksSight: false },
  { kind: 'bed', x: -28.4, z: 16, w: 1.0, d: 2.2, h: 0.55, color: 0x5a6b66, blocksSight: false },
  { kind: 'bed', x: -28.4, z: 20, w: 1.0, d: 2.2, h: 0.55, color: 0x5a6b66, blocksSight: false },
  { kind: 'bed', x: -24.4, z: 20.5, w: 1.0, d: 2.2, h: 0.55, color: 0x5a6b66, blocksSight: false },
  { kind: 'counter', x: -13.2, z: 20, w: 1.0, d: 3, h: 1.0, color: 0x4a5258, blocksSight: false },
  { kind: 'console', x: -22.5, z: 9.4, w: 1.6, d: 0.8, h: 1.1, color: 0x2f3a42, blocksSight: false },
  // Storage: shelving aisles and crates
  { kind: 'shelf', x: -24, z: -1, w: 3, d: 0.6, h: 2.2, color: 0x3a444c },
  { kind: 'shelf', x: -19.5, z: -1, w: 3, d: 0.6, h: 2.2, color: 0x3a444c },
  { kind: 'shelf', x: -15, z: -1, w: 3, d: 0.6, h: 2.2, color: 0x3a444c },
  { kind: 'shelf', x: -27.5, z: 3.5, w: 0.6, d: 3.2, h: 2.2, color: 0x3a444c },
  { kind: 'shelf', x: -22, z: 5, w: 3, d: 0.6, h: 2.2, color: 0x3a444c },
  { kind: 'crate', x: -14, z: 5.2, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: -17, z: -5, w: 1.2, d: 1.2, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: -20.5, z: -4.5, w: 1.2, d: 1.2, h: 1.2, color: 0x6a5a40, blocksSight: false },
  // Central Atrium: four pillars around a low display, so you can circle forever
  { kind: 'pillar', x: -5, z: -3, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'pillar', x: 5, z: -3, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'pillar', x: -5, z: 3, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'pillar', x: 5, z: 3, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'planter', x: 0, z: 0, w: 3, d: 3, h: 1.0, color: 0x2f4a44, blocksSight: false },
  // Containment Hall clutter
  { kind: 'crate', x: -8, z: -14, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: 8.5, z: -11, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: 7.5, z: -19.5, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  // Research Lab: benches and fume hoods
  { kind: 'bench', x: -24, z: -14, w: 6, d: 1.2, h: 0.95, color: 0x56626a, blocksSight: false },
  { kind: 'bench', x: -17, z: -18, w: 6, d: 1.2, h: 0.95, color: 0x56626a, blocksSight: false },
  { kind: 'hood', x: -14, z: -22, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'hood', x: -22, z: -22.8, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  // Records Archive: serpentine shelf rows (aisles 2.4 m wide)
  { kind: 'shelf', x: 20, z: -21, w: 10, d: 0.6, h: 2.4, color: 0x4a4a3c },
  { kind: 'shelf', x: 22, z: -18, w: 10, d: 0.6, h: 2.4, color: 0x4a4a3c },
  { kind: 'shelf', x: 20, z: -15, w: 10, d: 0.6, h: 2.4, color: 0x4a4a3c },
  { kind: 'shelf', x: 22, z: -12, w: 10, d: 0.6, h: 2.4, color: 0x4a4a3c },
  // Security Office: desks, monitor bank, cabinets
  { kind: 'counter', x: 19, z: -4.5, w: 5, d: 1.2, h: 1.3, color: 0x2a3138, blocksSight: false },
  { kind: 'counter', x: 22, z: 3.5, w: 3, d: 1.1, h: 0.9, color: 0x2a3138, blocksSight: false },
  { kind: 'console', x: 29, z: 1.5, w: 0.9, d: 7, h: 1.4, color: 0x20282e, blocksSight: false },
  { kind: 'crate', x: 24, z: 0, w: 1.6, d: 1.6, h: 1.4, color: 0x4a5258, blocksSight: false },
  // Mess Hall: tables and a serving counter
  { kind: 'table', x: -3, z: 13.5, w: 3.4, d: 1.2, h: 0.9, color: 0x6a5a48, blocksSight: false },
  { kind: 'table', x: 5, z: 13.5, w: 3.4, d: 1.2, h: 0.9, color: 0x6a5a48, blocksSight: false },
  { kind: 'table', x: -3, z: 18, w: 3.4, d: 1.2, h: 0.9, color: 0x6a5a48, blocksSight: false },
  { kind: 'table', x: 5, z: 18, w: 3.4, d: 1.2, h: 0.9, color: 0x6a5a48, blocksSight: false },
  { kind: 'counter', x: 3, z: 23.1, w: 8, d: 1, h: 1.0, color: 0x4a5258, blocksSight: false },
  // Exit Hall: pillars and crates
  { kind: 'pillar', x: 17, z: 12.5, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'pillar', x: 17, z: 20, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'crate', x: 14, z: 22.5, w: 1.8, d: 1.8, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: 22.5, z: 22.5, w: 1.8, d: 1.8, h: 1.2, color: 0x6a5a40, blocksSight: false },

  // Generator Room: two big generator units with a 2 m aisle between them, control panel, workbench
  { kind: 'counter', x: -23, z: 29, w: 4, d: 2, h: 1.7, color: 0x4a4f3c },
  { kind: 'counter', x: -17, z: 29, w: 4, d: 2, h: 1.7, color: 0x4a4f3c },
  { kind: 'console', x: -29, z: 28, w: 0.9, d: 4, h: 1.4, color: 0x20282e, blocksSight: false },
  { kind: 'bench', x: -20, z: 36.5, w: 6, d: 1.2, h: 0.95, color: 0x56626a, blocksSight: false },
  { kind: 'crate', x: -13, z: 26.5, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'crate', x: -14, z: 38.6, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
  { kind: 'shelf', x: -12.4, z: 36.5, w: 0.6, d: 3.2, h: 2.2, color: 0x3a444c },

  // Decontamination: three shower stalls on the south wall, pillars to circle, counter and wall console
  { kind: 'hood', x: -6, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'hood', x: 0, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'hood', x: 6, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'pillar', x: -5, z: 31, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'pillar', x: 5, z: 31, w: 1.4, d: 1.4, h: 4, color: 0x3d4850 },
  { kind: 'counter', x: 7.5, z: 26.5, w: 3, d: 1, h: 1.0, color: 0x4a5258, blocksSight: false },
  { kind: 'console', x: -10.1, z: 27, w: 0.9, d: 3, h: 1.2, color: 0x2f3a42, blocksSight: false },
  { kind: 'crate', x: 9.2, z: 37.4, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },

  // Specimen Storage: cold cabinets on the south wall, two offset shelf rows, workbench
  { kind: 'hood', x: 15, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'hood', x: 19, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'hood', x: 23, z: 39.1, w: 2.5, d: 1, h: 2.6, color: 0x40505a },
  { kind: 'shelf', x: 18, z: 29, w: 8, d: 0.6, h: 2.2, color: 0x4a4a3c },
  { kind: 'shelf', x: 22, z: 33, w: 8, d: 0.6, h: 2.2, color: 0x4a4a3c },
  { kind: 'bench', x: 25, z: 27.5, w: 6, d: 1.2, h: 0.95, color: 0x56626a, blocksSight: false },
  { kind: 'crate', x: 13.5, z: 26, w: 1.3, d: 1.3, h: 1.2, color: 0x6a5a40, blocksSight: false },
];

export const LOCKERS: LockerSpec[] = [
  { x: -14, z: 8.85, facing: '+z', label: 'Ward locker' },
  { x: -15, z: 23.15, facing: '-z', label: 'Ward locker' },
  { x: -15, z: -7.15, facing: '+z', label: 'Storage locker' },
  { x: 10.15, z: 5, facing: '-x', label: 'Atrium locker' },
  { x: -8, z: -23.05, facing: '+z', label: 'Hall locker' },
  { x: 8, z: -23.05, facing: '+z', label: 'Hall locker' },
  { x: -17, z: -23.05, facing: '+z', label: 'Lab locker' },
  { x: 29.15, z: -14, facing: '-x', label: 'Archive locker' },
  { x: 11.85, z: 5, facing: '+x', label: 'Security locker' },
  { x: 15, z: 7.15, facing: '-z', label: 'Security locker' },
  { x: -8, z: 8.85, facing: '+z', label: 'Mess locker' },
  { x: 10.15, z: 12.5, facing: '-x', label: 'Mess locker' },
  { x: 14, z: 8.85, facing: '+z', label: 'Exit hall locker' },
  { x: 18.5, z: 23.15, facing: '-z', label: 'Exit hall locker' },
  // South service wing
  { x: -29.15, z: 32, facing: '+x', label: 'Generator locker' },
  { x: -27.5, z: 24.85, facing: '+z', label: 'Generator locker' },
  { x: 10.15, z: 27, facing: '-x', label: 'Decon locker' },
  { x: 6, z: 24.85, facing: '+z', label: 'Decon locker' },
  { x: 11.85, z: 28, facing: '+x', label: 'Specimen locker' },
  { x: 29.15, z: 30, facing: '-x', label: 'Specimen locker' },
];
export const LOCKER_SIZE = { long: 1.2, short: 0.8 } as const;

export function lockerSolid(l: LockerSpec): SolidSpec {
  const alongX = l.facing === '+z' || l.facing === '-z';
  return { x: l.x, z: l.z, w: alongX ? LOCKER_SIZE.long : LOCKER_SIZE.short, d: alongX ? LOCKER_SIZE.short : LOCKER_SIZE.long };
}

export const NOTES: NoteSpec[] = [
  { x: -22.5, z: 10.8, label: 'Damaged terminal', text: 'TERMINAL: “…BREACH IN CONTAINMENT 09. SUBJECT RESPONDS TO SOUND. WALK SLOWLY. DO NOT RUN. DO NOT THROW THINGS TWICE.”' },
  { x: -15, z: -12.5, label: 'Lab notebook', text: 'LAB NOTE: “It learns which noises are bait. The service crawlspaces are narrower than its shoulders — the old team used them.”' },
  { x: 0, z: -16.5, label: 'Cell log', text: 'CELL LOG: “Subject 09 has no eyes. It does not need any. It remembers every place you hid.”' },
  { x: 19, z: -2.8, label: 'Researcher’s note', text: 'NOTE: “We were told Subject 09 was stable. The logs say otherwise. Security clearance is required to reach the surface.”' },
  { x: -20, z: 26.5, label: 'Generator terminal', text: 'TERMINAL: “BACKUP POWER HOLDING. THE EAST WING EMERGENCY LIGHTS ARE DRAWING EVERYTHING. IF THE HALL LIGHTS FAIL, DO NOT WAIT IN THE DARK.”' },
  { x: 0, z: 28, label: 'Decon log', text: 'DECON LOG: “Cycle 14 aborted. Staff left through the narrow service gap in the south wall of the Exit Hall. Too tight for anything bigger than a person.”' },
  { x: 15, z: 31, label: 'Specimen tag', text: 'SPECIMEN TAG: “09-A through 09-F removed from cold storage. Release form unsigned. Nobody admits to opening the cabinets.”' },
];

export const SECURITY_DESK: SolidSpec = { x: 19, z: -4.5, w: 5, d: 1.2, blocksSight: false };

/** Door frame posts and the exit panel on the east wall. These block movement at player height. */
export const EXIT_SOLIDS: SolidSpec[] = [
  { x: 29.7, z: 12.35, w: 0.6, d: 0.3 },
  { x: 29.7, z: 15.65, w: 0.6, d: 0.3 },
  { x: 29.55, z: 14, w: 0.25, d: 3.0 },
];

/** (x, z) is the point on the wall face; rotY is the direction the sign faces (0 = +z, PI = -z, PI/2 = +x, -PI/2 = -x). */
export const SIGNS: SignSpec[] = [
  { text: 'RECOVERY WARD', code: 'B2-W', tone: 'safe', x: -20, y: 3.0, z: 8.45, rotY: 0, color: 0x9fe0cc },
  { text: 'STORAGE', code: 'B2-S', tone: 'clinical', x: -20, y: 3.0, z: -7.55, rotY: 0, color: 0xcfd8dc },
  { text: 'RESEARCH LAB', code: 'B2-L', tone: 'clinical', x: -20, y: 3.0, z: -23.55, rotY: 0, color: 0x8dc4d6 },
  { text: 'CONTAINMENT 09', code: 'C-09', tone: 'danger', x: 0, y: 3.0, z: -23.55, rotY: 0, color: 0xffa58f },
  { text: 'RECORDS ARCHIVE', code: 'B2-R', tone: 'restricted', x: 20, y: 3.0, z: -23.55, rotY: 0, color: 0xe6e0a8 },
  { text: 'SECURITY', code: 'SEC', tone: 'restricted', x: 20, y: 3.0, z: -7.55, rotY: 0, color: 0x8dc4d6 },
  { text: 'CENTRAL ATRIUM', code: 'B2-A', tone: 'clinical', x: 0, y: 3.0, z: 7.55, rotY: Math.PI, color: 0xcfe9f2 },
  { text: 'MESS HALL', code: 'B2-M', tone: 'clinical', x: 0, y: 3.0, z: 23.55, rotY: Math.PI, color: 0xffcf9b },
  { text: 'EXIT HALL', code: 'EXIT', tone: 'danger', x: 20, y: 3.0, z: 23.55, rotY: Math.PI, color: 0xffa58f },
  { text: 'ACCESS DENIED — SECURITY KEYCARD REQUIRED', tone: 'danger', width: 3.6, x: 29.55, y: 3.2, z: 14, rotY: -Math.PI / 2, color: 0xffd0c0 },
  // South service wing (signs sit on the south face of the z = 24 wall, clear of the doorways)
  { text: 'GENERATOR ROOM', code: 'PWR', tone: 'restricted', x: -24, y: 3.0, z: 24.45, rotY: 0, color: 0xe0b060 },
  { text: 'DECONTAMINATION', code: 'DEC', tone: 'clinical', x: 2, y: 3.0, z: 24.45, rotY: 0, color: 0x8dd6e6 },
  { text: 'SPECIMEN STORAGE', code: 'SPC', tone: 'danger', x: 18, y: 3.0, z: 24.45, rotY: 0, color: 0xffa58f },
];

/** Patrol route through every room, authored as data. Each leg is validated with the navigation graph. */
export const PATROL_POINTS_XZ: Point2[] = [
  { x: 0, z: -16.5 }, { x: 8, z: -13 }, { x: 14, z: -14 }, { x: 20, z: -9.8 }, { x: 22, z: -5.5 },
  { x: 14, z: 2 }, { x: 0, z: 5.5 }, { x: 7, z: 12 }, { x: 19, z: 16.5 }, { x: 8, z: 20.5 },
  { x: -6, z: 13 },
  // South service wing loop: Mess -> Decon -> Specimen -> back through Decon -> Generator -> Ward
  { x: 0, z: 28 }, { x: 15, z: 32 }, { x: 22, z: 36 }, { x: -20, z: 33 }, { x: -20, z: 26.5 },
  { x: -16, z: 15 }, { x: -20, z: 4 }, { x: -23, z: -5 }, { x: -8, z: 0 },
  { x: -20, z: -12 }, { x: -8, z: -18 },
];

/** Every footprint that blocks walking, for the game's collision, the nav graph and headless tests. */
export function getSolids(): SolidSpec[] {
  return [
    ...WALLS.map((w): SolidSpec => ({ x: w.x, z: w.z, w: w.w, d: w.d, blocksSight: true })),
    ...PROPS.map((p): SolidSpec => ({ x: p.x, z: p.z, w: p.w, d: p.d, blocksSight: p.blocksSight ?? true })),
    ...LOCKERS.map((l): SolidSpec => ({ ...lockerSolid(l), blocksSight: true })),
    ...EXIT_SOLIDS.map((s): SolidSpec => ({ ...s, blocksSight: true })),
  ];
}

/** Which crawlspace interior (if any) contains this point. */
export function crawlspaceAt(x: number, z: number): CrawlspaceSpec | null {
  for (const c of CRAWLSPACES) {
    const i = c.interior;
    if (x >= i.minX && x <= i.maxX && z >= i.minZ && z <= i.maxZ) return c;
  }
  return null;
}

/**
 * CHAPTER_01_LAYOUT — additive only. Packages the existing arrays/functions above (no
 * copies, no new data) into the FacilityLayout shape for future chapter-selection code.
 * Nothing in this file above this point changed, and nothing elsewhere needs to switch to
 * reading this object: every existing import of the named exports above still works
 * exactly as before. See world/FacilityLayout.ts for the interface this satisfies.
 */
export const CHAPTER_01_LAYOUT: FacilityLayout = {
  id: 'chapter-01',
  worldBounds: WORLD_BOUNDS,
  playerStart: PLAYER_START,
  exitPosition: EXIT_POSITION,
  keycardPosition: KEYCARD_POSITION,
  walls: WALLS,
  doors: DOORS,
  crawlspaces: CRAWLSPACES,
  rooms: ROOMS,
  props: PROPS,
  lockers: LOCKERS,
  notes: NOTES,
  signs: SIGNS,
  patrolPointsXZ: PATROL_POINTS_XZ,
  getSolids,
  crawlspaceAt,
};