import type { PaperPlacement } from './PaperPickups';
import { DOCUMENTS } from './DocumentRegistry';
import { createRng } from '../core/Random';

/**
 * Validated physical surface anchor inside the Chapter 1 facility (LevelLayout.ts).
 * Every slot sits on top of an actual prop (table, desk/counter, lab bench, crate,
 * bed, console, planter, drawer top, or accessible shelf tier), clear of:
 * - WALLS (0.8 m thickness), CLOSET_WALLS, CAGE_WALLS, and EXIT_SOLIDS
 * - DOORS (3.0 m doorways) and CRAWLSPACES (0.88 m gaps)
 * - LOCKERS, NOTES, PUZZLE_FRAGMENTS, PUZZLE_BOX, and PASSWORD_LOCKER
 * - PATROL_POINTS_XZ (Subject 09 spawn & patrol waypoints)
 *
 * Explicit `surfaceY` prevents PaperPickups.resolveY() from accidentally snapping
 * papers onto ceiling geometry or 2.4 m shelf roofs out of the 1.7 m read range.
 */
interface SurfaceSlot {
  readonly roomId: string;
  readonly surfaceLabel: string;
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly rotationY: number;
}

const SURFACE_SLOTS: readonly SurfaceSlot[] = [
  // =========================================================================
  // 1. RECOVERY WARD (5 slots — beds, counter, medical console)
  // Player spawns at (-20, 18); early stealth/hiding story docs sit right nearby.
  // =========================================================================
  {
    roomId: 'ward',
    surfaceLabel: 'Ward east nurse counter (north end)',
    x: -13.35,
    z: 19.0,
    surfaceY: 1.0,
    rotationY: -0.35
  },
  {
    roomId: 'ward',
    surfaceLabel: 'Ward inner recovery bed mattress',
    x: -24.25,
    z: 20.1,
    surfaceY: 0.55,
    rotationY: 0.42
  },
  {
    roomId: 'ward',
    surfaceLabel: 'Ward west bed #1 foot-end',
    x: -28.15,
    z: 12.3,
    surfaceY: 0.55,
    rotationY: 0.28
  },
  {
    roomId: 'ward',
    surfaceLabel: 'Ward west bed #2 centre',
    x: -28.15,
    z: 16.2,
    surfaceY: 0.55,
    rotationY: -0.65
  },
  {
    roomId: 'ward',
    surfaceLabel: 'Ward east nurse counter (south end)',
    x: -13.35,
    z: 21.0,
    surfaceY: 1.0,
    rotationY: 0.85
  },

  // =========================================================================
  // 2. MESS HALL (6 slots — 4 dining tables + long serving counter)
  // =========================================================================
  {
    roomId: 'mess',
    surfaceLabel: 'Mess NW dining table (west seat)',
    x: -3.9,
    z: 13.5,
    surfaceY: 0.9,
    rotationY: -0.45
  },
  {
    roomId: 'mess',
    surfaceLabel: 'Mess NE dining table (east seat)',
    x: 5.8,
    z: 13.4,
    surfaceY: 0.9,
    rotationY: 0.55
  },
  {
    roomId: 'mess',
    surfaceLabel: 'Mess SW dining table',
    x: -2.3,
    z: 18.1,
    surfaceY: 0.9,
    rotationY: 0.18
  },
  {
    roomId: 'mess',
    surfaceLabel: 'Mess SE dining table',
    x: 4.3,
    z: 17.9,
    surfaceY: 0.9,
    rotationY: -0.75
  },
  {
    roomId: 'mess',
    surfaceLabel: 'Mess south serving counter (west section)',
    x: 0.4,
    z: 22.85,
    surfaceY: 1.0,
    rotationY: 0.32
  },
  {
    roomId: 'mess',
    surfaceLabel: 'Mess south serving counter (east section)',
    x: 5.6,
    z: 22.85,
    surfaceY: 1.0,
    rotationY: -0.52
  },

  // =========================================================================
  // 3. EXIT HALL (3 slots — supply crates & cabinet top, clear of exit & crawl)
  // =========================================================================
  {
    roomId: 'exit',
    surfaceLabel: 'Exit Hall SW supply crate',
    x: 14.0,
    z: 22.1,
    surfaceY: 1.2,
    rotationY: 0.38
  },
  {
    roomId: 'exit',
    surfaceLabel: 'Exit Hall SE supply crate (north edge)',
    x: 22.2,
    z: 21.95,
    surfaceY: 1.2,
    rotationY: -0.68
  },
  {
    roomId: 'exit',
    surfaceLabel: 'Mess east wall drawer cabinet top (near Exit doorway)',
    x: 9.45,
    z: 15.5,
    surfaceY: 1.165,
    rotationY: -1.15
  },

  // =========================================================================
  // 4. STORAGE (5 slots — crates, shelving lower ledge, drawer cabinet top)
  // =========================================================================
  {
    roomId: 'storage',
    surfaceLabel: 'Storage SE shipping crate',
    x: -14.0,
    z: 4.95,
    surfaceY: 1.2,
    rotationY: 0.44
  },
  {
    roomId: 'storage',
    surfaceLabel: 'Storage NE shipping crate',
    x: -17.0,
    z: -4.75,
    surfaceY: 1.2,
    rotationY: -0.88
  },
  {
    roomId: 'storage',
    surfaceLabel: 'Storage north-central shipping crate',
    x: -20.5,
    z: -4.25,
    surfaceY: 1.2,
    rotationY: 0.62
  },
  {
    roomId: 'storage',
    surfaceLabel: 'Storage central shelf accessible mid-ledge',
    x: -19.5,
    z: -0.82,
    surfaceY: 1.05,
    rotationY: 0.12
  },
  {
    roomId: 'storage',
    surfaceLabel: 'Storage south shelf accessible mid-ledge',
    x: -22.0,
    z: 4.82,
    surfaceY: 1.05,
    rotationY: -0.29
  },

  // =========================================================================
  // 5. CENTRAL ATRIUM (4 slots — four sides of the central 3x3 planter ledge)
  // =========================================================================
  {
    roomId: 'atrium',
    surfaceLabel: 'Atrium central planter (north rim)',
    x: 0.0,
    z: -1.22,
    surfaceY: 1.0,
    rotationY: 0.25
  },
  {
    roomId: 'atrium',
    surfaceLabel: 'Atrium central planter (south rim)',
    x: -0.2,
    z: 1.22,
    surfaceY: 1.0,
    rotationY: -0.55
  },
  {
    roomId: 'atrium',
    surfaceLabel: 'Atrium central planter (west rim)',
    x: -1.22,
    z: 0.15,
    surfaceY: 1.0,
    rotationY: 1.18
  },
  {
    roomId: 'atrium',
    surfaceLabel: 'Atrium central planter (east rim)',
    x: 1.22,
    z: -0.15,
    surfaceY: 1.0,
    rotationY: -1.08
  },

  // =========================================================================
  // 6. SECURITY OFFICE (6 slots — main desk, south desk, monitor console, crate)
  // =========================================================================
  {
    roomId: 'security',
    surfaceLabel: 'Security main desk (west wing)',
    x: 17.2,
    z: -4.25,
    surfaceY: 1.3,
    rotationY: 0.22
  },
  {
    roomId: 'security',
    surfaceLabel: 'Security main desk (east wing)',
    x: 20.8,
    z: -4.25,
    surfaceY: 1.3,
    rotationY: -0.48
  },
  {
    roomId: 'security',
    surfaceLabel: 'Security south briefing counter (west)',
    x: 21.1,
    z: 3.25,
    surfaceY: 0.9,
    rotationY: 0.74
  },
  {
    roomId: 'security',
    surfaceLabel: 'Security south briefing counter (east)',
    x: 22.9,
    z: 3.75,
    surfaceY: 0.9,
    rotationY: -0.33
  },
  {
    roomId: 'security',
    surfaceLabel: 'Security central equipment crate',
    x: 23.65,
    z: 0.0,
    surfaceY: 1.4,
    rotationY: 0.92
  },
  {
    roomId: 'security',
    surfaceLabel: 'Security monitor bank console ledge',
    x: 28.68,
    z: 0.2,
    surfaceY: 1.4,
    rotationY: -1.42
  },

  // =========================================================================
  // 7. RESEARCH LAB (5 slots — two 6m lab benches + wall drawer cabinet top)
  // =========================================================================
  {
    roomId: 'lab',
    surfaceLabel: 'Lab west bench (west end)',
    x: -26.1,
    z: -13.75,
    surfaceY: 0.95,
    rotationY: 0.31
  },
  {
    roomId: 'lab',
    surfaceLabel: 'Lab west bench (east end)',
    x: -21.9,
    z: -14.25,
    surfaceY: 0.95,
    rotationY: -0.62
  },
  {
    roomId: 'lab',
    surfaceLabel: 'Lab east bench (west end)',
    x: -19.2,
    z: -17.75,
    surfaceY: 0.95,
    rotationY: 0.84
  },
  {
    roomId: 'lab',
    surfaceLabel: 'Lab east bench (east end)',
    x: -14.8,
    z: -18.25,
    surfaceY: 0.95,
    rotationY: -0.39
  },
  {
    roomId: 'lab',
    surfaceLabel: 'Lab north drawer cabinet top',
    x: -18.5,
    z: -22.85,
    surfaceY: 1.165,
    rotationY: 0.14
  },

  // =========================================================================
  // 8. CONTAINMENT HALL (3 slots — three hallway crates around Cage 09)
  // =========================================================================
  {
    roomId: 'hall',
    surfaceLabel: 'Containment Hall west crate',
    x: -8.0,
    z: -13.75,
    surfaceY: 1.2,
    rotationY: 0.67
  },
  {
    roomId: 'hall',
    surfaceLabel: 'Containment Hall SE crate',
    x: 8.5,
    z: -11.25,
    surfaceY: 1.2,
    rotationY: -0.44
  },
  {
    roomId: 'hall',
    surfaceLabel: 'Containment Hall NE crate',
    x: 7.5,
    z: -19.25,
    surfaceY: 1.2,
    rotationY: 1.12
  },

  // =========================================================================
  // 9. RECORDS ARCHIVE (5 slots — serpentine shelf ledges & archive drawers)
  // Clear of PASSWORD_LOCKER (29.2, -9.5) and KEYCARD_REWARD (28.6, -9.5).
  // =========================================================================
  {
    roomId: 'records',
    surfaceLabel: 'Archive shelf row 1 mid-ledge',
    x: 17.5,
    z: -20.82,
    surfaceY: 1.05,
    rotationY: 0.24
  },
  {
    roomId: 'records',
    surfaceLabel: 'Archive shelf row 2 mid-ledge',
    x: 24.2,
    z: -17.82,
    surfaceY: 1.05,
    rotationY: -0.58
  },
  {
    roomId: 'records',
    surfaceLabel: 'Archive shelf row 3 mid-ledge',
    x: 18.2,
    z: -14.82,
    surfaceY: 1.05,
    rotationY: 0.46
  },
  {
    roomId: 'records',
    surfaceLabel: 'Archive shelf row 4 mid-ledge',
    x: 21.0,
    z: -11.82,
    surfaceY: 1.05,
    rotationY: -0.31
  },
  {
    roomId: 'records',
    surfaceLabel: 'Archive east drawer cabinet top',
    x: 29.15,
    z: -16.0,
    surfaceY: 1.165,
    rotationY: -1.28
  },

  // =========================================================================
  // 10. GENERATOR ROOM (4 slots — workbench, control console, crates)
  // =========================================================================
  {
    roomId: 'generator',
    surfaceLabel: 'Generator south workbench (west end)',
    x: -22.1,
    z: 36.25,
    surfaceY: 0.95,
    rotationY: 0.53
  },
  {
    roomId: 'generator',
    surfaceLabel: 'Generator south workbench (east end)',
    x: -17.9,
    z: 36.25,
    surfaceY: 0.95,
    rotationY: -0.47
  },
  {
    roomId: 'generator',
    surfaceLabel: 'Generator west wall control console',
    x: -28.72,
    z: 28.4,
    surfaceY: 1.4,
    rotationY: 1.35
  },
  {
    roomId: 'generator',
    surfaceLabel: 'Generator NE maintenance crate',
    x: -13.0,
    z: 26.75,
    surfaceY: 1.2,
    rotationY: -0.76
  },

  // =========================================================================
  // 11. DECONTAMINATION (1 slot — counter west end, clear of fragment_1 at 7.5)
  // Avoids fragment_1 (7.5, 26.5), fragment_2 (9.2, 37.4), fragment_3 (-10.1, 27.0)
  // =========================================================================
  {
    roomId: 'decon',
    surfaceLabel: 'Decontamination counter (west edge, clear of fragment)',
    x: 6.3,
    z: 26.5,
    surfaceY: 1.0,
    rotationY: 0.29
  },

  // =========================================================================
  // 12. SPECIMEN STORAGE (3 slots — workbench, crate, shelf mid-ledge)
  // =========================================================================
  {
    roomId: 'specimen',
    surfaceLabel: 'Specimen workbench (west end)',
    x: 22.8,
    z: 27.25,
    surfaceY: 0.95,
    rotationY: 0.64
  },
  {
    roomId: 'specimen',
    surfaceLabel: 'Specimen NW supply crate',
    x: 13.5,
    z: 26.25,
    surfaceY: 1.2,
    rotationY: -0.82
  },
  {
    roomId: 'specimen',
    surfaceLabel: 'Specimen north shelf accessible mid-ledge',
    x: 19.5,
    z: 29.18,
    surfaceY: 1.05,
    rotationY: 0.37
  }
];

/**
 * Explicit mapping of Story + Clue documents to thematically matching rooms
 * so environmental storytelling aligns with LevelLayout:
 * - Ward / Mess: Chapter 1 stealth & hiding docs
 * - Generator / Storage: Chapter 2 generator & backordered exciter docs
 * - Lab / Containment Hall: Chapter 3 acoustic observation & behavioural docs
 * - Security / Records Archive: Chapter 4 credentials, classified memo & locker password note
 * - Specimen / Containment: Chapter 5 feeding log & hatch incident
 * Remaining 39 facility/decoy documents fill every remaining surface slot deterministically.
 */
const ORDERED_DOCUMENT_IDS: readonly string[] = [
  // Recovery Ward (5)
  'doc_containment_warning',
  'doc_hiding_protocol',
  'doc_scattered_01',
  'doc_scattered_02',
  'doc_scattered_03',

  // Mess Hall (6)
  'doc_scattered_04',
  'doc_scattered_05',
  'doc_scattered_06',
  'doc_scattered_07',
  'doc_scattered_08',
  'doc_scattered_09',

  // Exit Hall (3)
  'doc_scattered_10',
  'doc_scattered_11',
  'doc_scattered_12',

  // Storage (5)
  'doc_power_component',
  'doc_scattered_13',
  'doc_scattered_14',
  'doc_scattered_15',
  'doc_scattered_16',

  // Central Atrium (4)
  'doc_scattered_17',
  'doc_scattered_18',
  'doc_scattered_19',
  'doc_scattered_20',

  // Security Office (6) — houses the Security Access Note (0917) for the Archive locker
  'doc_security_password',
  'doc_final_credentials',
  'doc_scattered_21',
  'doc_scattered_22',
  'doc_scattered_23',
  'doc_scattered_24',

  // Research Lab (5)
  'doc_observation_transcript',
  'doc_behavioural_note',
  'doc_scattered_25',
  'doc_scattered_26',
  'doc_scattered_27',

  // Containment Hall (3)
  'doc_containment_incident',
  'doc_scattered_28',
  'doc_scattered_29',

  // Records Archive (5)
  'doc_classified_summary',
  'doc_scattered_30',
  'doc_scattered_31',
  'doc_scattered_32',
  'doc_scattered_33',

  // Generator Room (4)
  'doc_maintenance_log',
  'doc_scattered_34',
  'doc_scattered_35',
  'doc_scattered_36',

  // Decontamination (1)
  'doc_scattered_37',

  // Specimen Storage (3)
  'doc_feeding_log',
  'doc_scattered_38',
  'doc_scattered_39'
];

function validatePlacements(
  docIds: readonly string[],
  slots: readonly SurfaceSlot[]
): readonly PaperPlacement[] {
  if (docIds.length !== slots.length) {
    throw new Error(
      `[PaperPlacements] Count mismatch: ${docIds.length} document IDs vs ${slots.length} surface slots.`
    );
  }

  const registeredIds = new Set<string>(DOCUMENTS.map((doc) => doc.id));
  const seenDocIds = new Set<string>();
  const seenCoords = new Set<string>();
  const out: PaperPlacement[] = [];

  for (let i = 0; i < docIds.length; i += 1) {
    const docId = docIds[i];
    const slot = slots[i];

    if (docId === undefined || slot === undefined) {
      throw new Error(`[PaperPlacements] Missing entry at index ${i}.`);
    }

    if (!registeredIds.has(docId)) {
      throw new Error(
        `[PaperPlacements] Document ID "${docId}" does not exist in DocumentRegistry.`
      );
    }

    if (seenDocIds.has(docId)) {
      throw new Error(`[PaperPlacements] Duplicate document ID "${docId}".`);
    }
    seenDocIds.add(docId);

    const coordKey = `${slot.x.toFixed(2)},${slot.z.toFixed(2)}`;
    if (seenCoords.has(coordKey)) {
      throw new Error(
        `[PaperPlacements] Duplicate XZ coordinate (${coordKey}) at ${slot.surfaceLabel}.`
      );
    }
    seenCoords.add(coordKey);

    out.push({
      docId,
      x: slot.x,
      z: slot.z,
      rotationY: slot.rotationY,
      surfaceY: slot.surfaceY
    });
  }

  return Object.freeze(out);
}

/**
 * Default deterministic placement table of all 50 unique facility papers.
 * Fixed across reloads, save/load, and headless tests.
 */
export const PAPER_PLACEMENTS: readonly PaperPlacement[] = validatePlacements(
  ORDERED_DOCUMENT_IDS,
  SURFACE_SLOTS
);

/**
 * Optional deterministic seeded shuffling of which document sits on which
 * pre-validated furniture surface slot. Given the same run `seed`, a saved game
 * restores the exact same paper locations without ever moving papers off valid props.
 */
export function getSeededPaperPlacements(seed: number): readonly PaperPlacement[] {
  const rng = createRng(seed >>> 0);
  const shuffledIds: string[] = [...ORDERED_DOCUMENT_IDS];

  for (let i = shuffledIds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = shuffledIds[i];
    const b = shuffledIds[j];
    if (a !== undefined && b !== undefined) {
      shuffledIds[i] = b;
      shuffledIds[j] = a;
    }
  }

  return shuffledIds.map((docId, index): PaperPlacement => {
    const slot = SURFACE_SLOTS[index];
    if (slot === undefined) {
      throw new Error(`[PaperPlacements] Missing slot at index ${index}.`);
    }
    return {
      docId,
      x: slot.x,
      z: slot.z,
      rotationY: slot.rotationY,
      surfaceY: slot.surfaceY
    };
  });
}