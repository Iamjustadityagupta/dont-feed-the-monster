
import type { ChapterDefinition, ChapterRegion } from './chapterdefinition';
import type {
  RawLevelLayout,
  RawSegment,
} from '../world/geometryFromLayout';

const WALL = 0.3;

const seg = (
  id: string,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): RawSegment => ({
  id,
  x1,
  z1,
  x2,
  z2,
  thickness: WALL,
});

/**
 * Chapter 1: Containment
 *
 * The player must explore the facility to locate the security keycard.
 * No objective text reveals its location.
 */
const layout: RawLevelLayout = {
  BOUNDS: {
    minX: -1,
    maxX: 35,
    minZ: -5,
    maxZ: 13,
  },

  WALLS: [
    // Containment room
    seg('w-c-1', 0, 0, 6, 0),
    seg('w-c-2', 0, 6, 6, 6),
    seg('w-c-3', 0, 0, 0, 6),
    seg('w-c-4', 6, 0, 6, 2),
    seg('w-c-5', 6, 5, 6, 6),

    // Main corridor
    seg('w-k-1', 6, 2, 22, 2),
    seg('w-k-2', 6, 5, 22, 5),

    // Storage room
    seg('w-s-1', 8, 5, 8, 11),
    seg('w-s-2', 14, 5, 14, 11),
    seg('w-s-3', 8, 11, 14, 11),

    // Security Office
    seg('w-sec-1', 16, 5, 16, 11),
    seg('w-sec-2', 22, 5, 22, 11),
    seg('w-sec-3', 16, 11, 22, 11),

    // Optional Records room
    seg('w-r-1', 8, -4, 8, 2),
    seg('w-r-2', 14, -4, 14, 2),
    seg('w-r-3', 8, -4, 14, -4),

    // Junction and exit hall
    seg('w-j-1', 22, 0, 28, 0),
    seg('w-j-2', 28, 0, 28, 2),
    seg('w-j-3', 28, 6, 28, 8),
    seg('w-j-4', 22, 8, 28, 8),

    // Exit hall
    seg('w-e-1', 28, 2, 34, 2),
    seg('w-e-2', 28, 6, 34, 6),
    seg('w-e-3', 34, 2, 34, 6),
  ],

  DOORS: [
    {
      id: 'door-storage',
      x1: 10,
      z1: 5,
      x2: 12,
      z2: 5,
      thickness: WALL,
      isOpen: () => true,
    },
    {
      id: 'door-security',
      x1: 18,
      z1: 5,
      x2: 20,
      z2: 5,
      thickness: WALL,
      isOpen: () => true,
    },
    {
      id: 'door-records',
      x1: 10,
      z1: 2,
      x2: 12,
      z2: 2,
      thickness: WALL,
      isOpen: () => true,
    },
    {
      id: 'door-exit',
      x1: 28,
      z1: 4,
      x2: 28,
      z2: 6,
      thickness: WALL,
      label: 'Facility exit',
    },
  ],

  CRAWLSPACES: [
    {
      id: 'crawl-maint',
      minX: 14,
      maxX: 16,
      minZ: 8,
      maxZ: 10,
      minHeight: 0.95,
      isOpen: () => true,
    },
  ],

  LOCKERS: [
    {
      id: 'locker-storage-a',
      minX: 8.2,
      maxX: 8.9,
      minZ: 8,
      maxZ: 9.2,
      label: 'Storage locker',
    },
    {
      id: 'locker-security-a',
      minX: 21.1,
      maxX: 21.8,
      minZ: 7,
      maxZ: 8.2,
      label: 'Security locker',
    },
  ],

  INTERACTABLES: [
    {
      id: 'note-containment',
      x: 4.5,
      z: 4.5,
      kind: 'note',
      label: 'Breach log',
      radius: 1.8,
    },
    {
      id: 'keycard-security',
      x: 20.4,
      z: 8.4,
      kind: 'pickup',
      label: 'Security keycard',
      radius: 1.6,
    },
    {
      id: 'console-security',
      x: 18.5,
      z: 10.4,
      kind: 'console',
      label: 'Monitor feed',
      radius: 1.8,
    },
    {
      id: 'exit-door',
      x: 28.6,
      z: 5,
      kind: 'exit',
      label: 'Locked exit',
      radius: 2,
    },
  ],
};

export const CHAPTER_01: ChapterDefinition = {
  id: 'chapter-01',
  title: 'Chapter 1 — Containment',
  layout,

  playerSpawn: {
    x: 2.5,
    z: 3,
  },

  playerSpawnYaw: -Math.PI / 2,

  keycardInteractableId: 'keycard-security',
  keycardRegionId: 'room-security',
  exitInteractableId: 'exit-door',

  objectiveSteps: [
    {
      id: 'step-wake',
      text: 'Get your bearings.',
    },
    {
      id: 'step-corridor',
      text: 'Reach the corridor.',
      hint: 'Look for the open containment doorway.',
    },
    {
      id: 'step-hide',
      text: 'Find a hiding place in the storage room.',
    },
    {
      id: 'step-keycard',
      text: 'Search the facility and find the security keycard.',
    },
    {
      id: 'step-exit',
      text: 'Return to the exit and use the keycard.',
    },
  ],

  monsterSpawn: {
    x: 26,
    z: 4,
  },

  monsterIntroduction: {
    atPosition: {
      x: 22,
      z: 4,
    },
    triggerZone: {
      x: 9,
      z: 5,
      radius: 5,
    },
    firstContactGrace: 3.5,
  },

  targetDurationSeconds: 240,

  endingText:
    'The exit seals behind you. On the security monitor, the corridor lights fail one by one — Subject 09 has moved deeper into the facility.',
};

/**
 * Region bounds used by chapter validation and tests.
 */
export const CHAPTER_01_REGIONS: Readonly<
  Record<string, ChapterRegion>
> = {
  'room-security': {
    minX: 16,
    maxX: 22,
    minZ: 5,
    maxZ: 11,
  },

  'room-records': {
    minX: 8,
    maxX: 14,
    minZ: -4,
    maxZ: 2,
  },

  'room-storage': {
    minX: 8,
    maxX: 14,
    minZ: 5,
    maxZ: 11,
  },
};

/**
 * Legacy chapter-data validation for the separately defined ChapterRuntime layout.
 */
export function validateChapter01KeycardLocation(): string[] {
  const problems: string[] = [];

  const keycard = layout.INTERACTABLES?.find(
    (item) => item.id === CHAPTER_01.keycardInteractableId,
  );

  if (!keycard) {
    return [
      `Keycard interactable not found: ${CHAPTER_01.keycardInteractableId}`,
    ];
  }

  const security = CHAPTER_01_REGIONS[CHAPTER_01.keycardRegionId];

  if (!security) {
    problems.push(
      `Unknown keycard region: ${CHAPTER_01.keycardRegionId}`,
    );
  } else {
    const insideSecurity =
      keycard.x >= security.minX &&
      keycard.x <= security.maxX &&
      keycard.z >= security.minZ &&
      keycard.z <= security.maxZ;

    if (!insideSecurity) {
      problems.push('Keycard is outside its configured legacy test region');
    }
  }

  const records = CHAPTER_01_REGIONS['room-records'];

  const insideRecords =
    keycard.x >= records.minX &&
    keycard.x <= records.maxX &&
    keycard.z >= records.minZ &&
    keycard.z <= records.maxZ;

  if (insideRecords) {
    problems.push('Keycard must remain outside the excluded legacy test region');
  }

  return problems;
}
