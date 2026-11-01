import type { PlayerController } from '../player/PlayerController';
import type { WorldManager } from '../world/WorldManager';
import type { ChapterMissionSpec } from '../chapters/ChapterMissionConfig';
import { CONFIG } from '../app/GameConfig';

export type StepStatus = 'in_progress' | 'completed' | 'locked';

export interface ObjectiveEntry {
  readonly number: number;
  readonly title: string;
  readonly status: StepStatus;
  readonly progressText: string;
}

export interface MissionSnapshot {
  readonly chapterTitle: string;
  readonly mainMission: string;
  readonly currentDirective: string;
  readonly entries: readonly ObjectiveEntry[];
  readonly collectedObjects: readonly string[];
  readonly remainingObjectCount: number;
  readonly clues: readonly string[];
  readonly unlockedAreas: readonly string[];
  readonly lockedAreas: readonly string[];
  readonly finalRequirements: readonly { label: string; met: boolean }[];
  readonly canActivateExit: boolean;
}

export class ChapterProgressionState {
  readonly collectedInitialIds = new Set<string>();
  readonly collectedEscapeIds = new Set<string>();
  readonly clues: string[] = [];
  readonly readNoteIds = new Set<string>();

  keyUnlocked = false;
  hasRoomKey = false;
  roomUnlocked = false;
  passwordDiscovered = false;
  lockerUnlocked = false;
  hasKeycard = false;
  exitGateActivated = false;
  elapsedSeconds = 0;

  constructor(public spec: ChapterMissionSpec) {}

  reset(spec: ChapterMissionSpec = this.spec): void {
    this.spec = spec;
    this.collectedInitialIds.clear();
    this.collectedEscapeIds.clear();
    this.clues.length = 0;
    this.readNoteIds.clear();
    this.keyUnlocked = false;
    this.hasRoomKey = false;
    this.roomUnlocked = false;
    this.passwordDiscovered = false;
    this.lockerUnlocked = false;
    this.hasKeycard = false;
    this.exitGateActivated = false;
    this.elapsedSeconds = 0;
  }

  addClue(summary: string, revealsPassword = false): void {
    if (!this.clues.includes(summary)) {
      this.clues.push(summary);
    }
    if (revealsPassword) {
      this.passwordDiscovered = true;
    }
  }

  collectInitial(id: string): boolean {
    if (this.collectedInitialIds.has(id)) return false;
    this.collectedInitialIds.add(id);
    if (this.collectedInitialIds.size >= 3) {
      this.keyUnlocked = true;
    }
    return true;
  }

  collectEscape(id: string): boolean {
    if (this.collectedEscapeIds.has(id)) return false;
    this.collectedEscapeIds.add(id);
    return true;
  }

  get totalCollectedCount(): number {
    return (
      this.collectedInitialIds.size +
      (this.hasRoomKey ? 1 : 0) +
      (this.hasKeycard ? 1 : 0) +
      this.collectedEscapeIds.size
    );
  }

  get allEscapeRequirementsMet(): boolean {
    return (
      this.collectedInitialIds.size === 3 &&
      this.hasRoomKey &&
      this.roomUnlocked &&
      this.lockerUnlocked &&
      this.hasKeycard &&
      this.collectedEscapeIds.size === 2
    );
  }

  missingExitReasons(): string[] {
    const missing: string[] = [];
    if (this.collectedInitialIds.size < 3) {
      missing.push(`${3 - this.collectedInitialIds.size} experimental object(s)`);
    }
    if (!this.hasRoomKey) missing.push(this.spec.roomKey.label);
    if (!this.roomUnlocked) missing.push(`unlock ${this.spec.lockedRoom.roomName}`);
    if (!this.lockerUnlocked || !this.hasKeycard) missing.push(this.spec.keypadLocker.keycardLabel);
    if (this.collectedEscapeIds.size < 2) {
      const rem = this.spec.escapeComponents
        .filter((c) => !this.collectedEscapeIds.has(c.id))
        .map((c) => c.label);
      missing.push(...rem);
    }
    return missing;
  }

  snapshot(): MissionSnapshot {
    const c1 = this.collectedInitialIds.size;
    const c5 = this.collectedEscapeIds.size;

    const obj1Status: StepStatus = c1 >= 3 ? 'completed' : 'in_progress';
    const obj2Status: StepStatus = !this.keyUnlocked
      ? 'locked'
      : this.roomUnlocked
        ? 'completed'
        : 'in_progress';
    const obj3Status: StepStatus = !this.roomUnlocked
      ? 'locked'
      : this.passwordDiscovered || this.lockerUnlocked
        ? 'completed'
        : 'in_progress';
    const obj4Status: StepStatus = !this.roomUnlocked
      ? 'locked'
      : this.hasKeycard
        ? 'completed'
        : 'in_progress';
    const obj5Status: StepStatus = !this.hasKeycard
      ? 'locked'
      : c5 >= 2
        ? 'completed'
        : 'in_progress';
    const obj6Status: StepStatus = !this.allEscapeRequirementsMet
      ? 'locked'
      : this.exitGateActivated
        ? 'completed'
        : 'in_progress';

    const entries: ObjectiveEntry[] = [
      {
        number: 1,
        title: 'Find 3 important objects hidden in the house.',
        status: obj1Status,
        progressText: `Progress: ${c1}/3`,
      },
      {
        number: 2,
        title: `Find the ${this.spec.roomKey.label} & unlock ${this.spec.lockedRoom.roomName}.`,
        status: obj2Status,
        progressText:
          obj2Status === 'locked'
            ? 'Status: Locked'
            : this.roomUnlocked
              ? 'Status: Completed'
              : this.hasRoomKey
                ? `Key Acquired — Unlock ${this.spec.lockedRoom.roomName} Door`
                : 'Key Released — Retrieve & Unlock Door',
      },
      {
        number: 3,
        title: 'Discover the hidden locker password.',
        status: obj3Status,
        progressText:
          obj3Status === 'locked'
            ? 'Status: Locked'
            : obj3Status === 'completed'
              ? 'Status: Discovered (Check Clues)'
              : 'Status: Search notes & walls',
      },
      {
        number: 4,
        title: 'Unlock the security locker and retrieve the keycard.',
        status: obj4Status,
        progressText:
          obj4Status === 'locked'
            ? 'Status: Locked'
            : this.hasKeycard
              ? 'Status: Keycard Retrieved'
              : this.lockerUnlocked
                ? 'Locker Open — Pick Up Keycard'
                : 'Status: Enter 4-digit PIN on Locker',
      },
      {
        number: 5,
        title: 'Collect the final escape components.',
        status: obj5Status,
        progressText: obj5Status === 'locked' ? 'Status: Locked' : `Progress: ${c5}/2`,
      },
      {
        number: 6,
        title: 'Activate the exit gate and escape.',
        status: obj6Status,
        progressText:
          obj6Status === 'locked'
            ? 'Status: Locked'
            : this.exitGateActivated
              ? 'Status: Gate Open — Escape!'
              : 'Status: Insert Components & Swipe Keycard',
      },
    ];

    const active = entries.find((e) => e.status === 'in_progress') ?? entries[entries.length - 1];
    const currentDirective = `OBJECTIVE ${active.number}: ${active.title} (${active.progressText})`;

    const collectedObjects: string[] = [];
    for (const item of this.spec.initialObjects) {
      if (this.collectedInitialIds.has(item.id)) collectedObjects.push(item.label);
    }
    if (this.hasRoomKey) collectedObjects.push(this.spec.roomKey.label);
    if (this.hasKeycard) collectedObjects.push(this.spec.keypadLocker.keycardLabel);
    for (const item of this.spec.escapeComponents) {
      if (this.collectedEscapeIds.has(item.id)) collectedObjects.push(item.label);
    }

    const remainingObjectCount =
      (3 - c1) +
      (this.keyUnlocked && !this.hasRoomKey ? 1 : 0) +
      (this.lockerUnlocked && !this.hasKeycard ? 1 : 0) +
      (this.hasKeycard ? 2 - c5 : 0);

    const unlockedAreas = [
      'Recovery Ward',
      'Mess Hall',
      'Storage',
      'Central Atrium',
      'Research Lab',
      'Containment Hall',
      'Records Archive',
      'Security Office',
      'Generator Room',
      'Decontamination',
      'Exit Hall',
    ];
    const lockedAreas: string[] = [];

    if (this.roomUnlocked) unlockedAreas.push(this.spec.lockedRoom.roomName);
    else lockedAreas.push(`${this.spec.lockedRoom.roomName} (Requires Room Key)`);

    if (this.lockerUnlocked) unlockedAreas.push('Vault Security Locker');
    else lockedAreas.push('Vault Security Locker (Requires 4-Digit Password)');

    if (this.exitGateActivated) unlockedAreas.push('Main Exterior Exit Gate');
    else lockedAreas.push('Main Exterior Exit Gate (Requires Keycard + 2 Components)');

    return {
      chapterTitle: `${this.spec.title} — ${this.spec.subtitle}`,
      mainMission: this.spec.mainMission,
      currentDirective,
      entries,
      collectedObjects,
      remainingObjectCount,
      clues: [...this.clues],
      unlockedAreas,
      lockedAreas,
      finalRequirements: [
        { label: `3 Experimental Objects (${c1}/3)`, met: c1 === 3 },
        { label: `${this.spec.lockedRoom.roomName} Unlocked`, met: this.roomUnlocked },
        { label: this.spec.keypadLocker.keycardLabel, met: this.hasKeycard },
        { label: `Escape Gate Components (${c5}/2)`, met: c5 === 2 },
        { label: 'Exit Gate Activated', met: this.exitGateActivated },
      ],
      canActivateExit: this.allEscapeRequirementsMet,
    };
  }
}

export const STARTING_OBJECTIVE = 'OBJECTIVE 1: Find 3 important objects hidden in the house. (0/3)';

export function getObjective(hasKeycard: boolean): string {
  return hasKeycard
    ? 'Collect the final escape components and activate the exit gate.'
    : STARTING_OBJECTIVE;
}

const DEFAULT_PROMPT = 'TAB OBJECTIVE MISSION · G DISTRACTION · F FLASHLIGHT · C CROUCH';

export function getInteractionPrompt(
  player: PlayerController,
  world: WorldManager,
  mission?: ChapterProgressionState,
): string {
  if (player.hidden) return 'E  /  LEAVE HIDING PLACE';

  if (player.position.distanceTo(world.exitPosition) < CONFIG.player.interact.exitRange) {
    if (mission?.exitGateActivated) return 'E  /  ESCAPE BLACKWOOD HOUSE';
    if (mission?.allEscapeRequirementsMet) return 'E  /  INSERT COMPONENTS & ACTIVATE EXIT GATE';
    return 'E  /  INSPECT SEALED EXIT GATE (LOCKED)';
  }

  const nearest = world.interactables
    .filter((i) => i.active && i.position.distanceTo(player.position) < 2.25)
    .sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0];

  if (!nearest) return DEFAULT_PROMPT;

  switch (nearest.kind) {
    case 'artifact':
    case 'escape_part':
    case 'room_key':
      return `E  /  COLLECT ${nearest.label.toUpperCase()}`;
    case 'locked_door':
      return mission?.hasRoomKey
        ? `E  /  UNLOCK ${nearest.label.toUpperCase()}`
        : `E  /  LOCKED DOOR (${mission?.spec.roomKey.label.toUpperCase() ?? 'KEY'} REQUIRED)`;
    case 'keypad_locker':
      return 'E  /  ENTER LOCKER PASSWORD';
    case 'keycard':
      return `E  /  RETRIEVE ${nearest.label.toUpperCase()}`;
    case 'hiding':
      return `E  /  HIDE IN ${nearest.label.toUpperCase()}`;
    case 'note':
      return `E  /  READ ${nearest.label.toUpperCase()}`;
    default:
      return `E  /  ${nearest.label.toUpperCase()}`;
  }
}