import type { Point2 } from '../world/LevelLayout';
import { CHAPTER_01_AI, type ChapterAIProfile } from './ChapterAIProfile';
import { CHAPTER_02_AI } from './Chapter02_ForgottenExperiments';

export interface MissionItemSpec {
  readonly id: string;
  readonly label: string;
  readonly roomName: string;
  readonly position: Point2;
  readonly surfaceY: number;
  readonly meshKind: 'lab_module' | 'broken_scanner' | 'bio_vial' | 'fuse' | 'relay';
}

export interface EnvironmentalClueSpec {
  readonly id: string;
  readonly label: string;
  readonly position: Point2;
  readonly surfaceY: number;
  readonly text: string;
  readonly clueSummary?: string;
  readonly revealsPassword?: boolean;
}

export interface ChapterMissionSpec {
  readonly chapterNumber: number;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly mainMission: string;
  readonly introSentences: readonly string[];
  readonly gracePeriodSeconds: number;
  readonly initialObjects: readonly [MissionItemSpec, MissionItemSpec, MissionItemSpec];
  readonly roomKey: {
    readonly id: string;
    readonly label: string;
    readonly position: Point2;
    readonly surfaceY: number;
    readonly spawnHint: string;
  };
  readonly lockedRoom: {
    readonly roomId: string;
    readonly roomName: string;
    readonly doorPosition: Point2;
    readonly doorAxis: 'x' | 'z';
    readonly doorWidth: number;
  };
  readonly keypadLocker: {
    readonly position: Point2;
    readonly facing: '+z' | '-z' | '+x' | '-x';
    readonly password: string;
    readonly keycardLabel: string;
  };
  readonly escapeComponents: readonly [MissionItemSpec, MissionItemSpec];
  readonly notes: readonly EnvironmentalClueSpec[];
  readonly wallWritings: readonly {
    readonly text: string;
    readonly subtitle?: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly rotY: number;
  }[];
  readonly ai: ChapterAIProfile;
  readonly completionText: string;
  readonly nextChapterId: string | null;
}

export const CHAPTER_01_MISSION: ChapterMissionSpec = {
  chapterNumber: 1,
  id: 'chapter-01',
  title: 'CHAPTER 1: BLACKWOOD HOUSE',
  subtitle: 'Containment Sub-Wing',
  mainMission: 'Uncover Dr. Vance’s research, unseal Specimen Storage, override the Exit Gate, and escape alive.',
  gracePeriodSeconds: 18,
  introSentences: [
    'Blackwood House stands rotting at the edge of the pines — a private estate boarded shut and erased from municipal records twelve years ago.',
    'Beneath its damp clinical halls, disgraced biogeneticist Dr. Julian Vance built an illegal laboratory to conquer human frailty.',
    'He sought to engineer an organism freed from starvation, sleep, and mortal weakness.',
    'By splicing predatory acoustic organs and self-cannibalizing marrow into a living host, Subject 09 was born.',
    'The experiment spiraled into horror: deprived of sight, the creature’s skull split into vast auditory membranes that felt every breath, heartbeat, and footstep as physical pain.',
    'Driven into a relentless frenzy by human sound, it slaughtered Vance’s staff inside the locked wings.',
    'Vance tried to seal Subject 09 behind heavy containment bulkheads, but the bulkhead failed — and the survivors abandoned the estate forever.',
    'Tonight, drawn by missing-persons files, you stepped past the rusted outer bulkhead before the deadbolt slammed shut and sheared off behind you.',
    'Three urban explorers and an investigator entered these halls before you; only dried bloodstains, torn notes, and shattered flashlights remain.',
    'Below the floorboards, the silence just broke. Subject 09 is awake — and you must recover Vance’s scattered devices, unlock the sealed room, crack the security locker, restore the exit gate, and escape.'
  ],
  initialObjects: [
    {
      id: 'c1_obj_stabilizer',
      label: 'Old Neural Stabilizer Unit',
      roomName: 'Research Lab',
      position: { x: -24.2, z: -13.6 },
      surfaceY: 0.96,
      meshKind: 'lab_module',
    },
    {
      id: 'c1_obj_transceiver',
      label: 'Broken Security Transceiver',
      roomName: 'Storage',
      position: { x: -14.0, z: 5.2 },
      surfaceY: 1.22,
      meshKind: 'broken_scanner',
    },
    {
      id: 'c1_obj_sample',
      label: 'Coagulated Marrow Sample 09-B',
      roomName: 'Mess Hall',
      position: { x: 5.0, z: 13.5 },
      surfaceY: 0.91,
      meshKind: 'bio_vial',
    },
  ],
  roomKey: {
    id: 'c1_specimen_key',
    label: 'Heavy Brass Specimen Key',
    position: { x: -22.2, z: 9.4 },
    surfaceY: 1.12,
    spawnHint: 'The magnetic lockbox in the Recovery Ward clicked open — retrieve the Brass Specimen Key.',
  },
  lockedRoom: {
    roomId: 'specimen',
    roomName: 'Specimen Storage',
    doorPosition: { x: 11, z: 34 },
    doorAxis: 'z',
    doorWidth: 3.0,
  },
  keypadLocker: {
    position: { x: 25.0, z: 39.0 },
    facing: '-z',
    password: '4907',
    keycardLabel: 'Level-4 Master Keycard',
  },
  escapeComponents: [
    {
      id: 'c1_esc_fuse',
      label: 'High-Voltage Exit Power Fuse',
      roomName: 'Generator Room',
      position: { x: -20.0, z: 36.5 },
      surfaceY: 0.96,
      meshKind: 'fuse',
    },
    {
      id: 'c1_esc_relay',
      label: 'Gate Solenoid Activation Relay',
      roomName: 'Security Office',
      position: { x: 22.0, z: 3.5 },
      surfaceY: 0.92,
      meshKind: 'relay',
    },
  ],
  notes: [
    {
      id: 'note_ward_entry',
      label: 'Blood-Stained Scrap',
      position: { x: -22.5, z: 12.2 },
      surfaceY: 0.04,
      text: 'Don’t run.\n\nIf you hear wet breathing through the wall, crouch and stop moving. Marcus ran for the front gate — it didn’t even need eyes to find him.',
      clueSummary: 'Survivor warning: Sprinting draws Subject 09 from rooms away.',
    },
    {
      id: 'note_lab_origin',
      label: 'Dr. Vance’s Lab Record #09',
      position: { x: -16.8, z: -17.8 },
      surfaceY: 0.97,
      text: 'PROJECT ZERO-HUNGER — DAY 114\n\nMetabolic independence achieved. Subject 09 requires zero caloric intake.\n\nUnintended side effect: acoustic hyper-innervation. Every human heartbeat and footstep registers as intolerable cranial trauma to the specimen. It does not hunt to feed. It hunts to silence the room.\n\nThree calibration relics remain linked to the Recovery Ward key-safe. Without all three, Specimen Storage stays sealed.\n\n— J. Vance',
      clueSummary: 'Vance Log: Collecting all 3 calibration items releases the Specimen Room key in the Recovery Ward.',
    },
    {
      id: 'note_records_password',
      label: 'Torn Archive Ledger (Bloodied)',
      position: { x: 20.2, z: -16.4 },
      surfaceY: 0.04,
      text: 'EVIDENCE LOCKUP — SPECIMEN VAULT\n\nVance moved the Master Exit Keycard into the reinforced keypad locker inside Specimen Storage before sealing the wing.\n\nKeypad Override Code:  4 9 0 7\n\n(Beneath, smeared in dark brown): "I had the code. Couldn’t get past the Decon door. Please—"',
      clueSummary: 'Specimen Locker Keypad Code: 4907 (found in Records Archive).',
      revealsPassword: true,
    },
    {
      id: 'note_hall_breach',
      label: 'Crumpled Guard Report',
      position: { x: 1.4, z: -15.6 },
      surfaceY: 0.04,
      text: 'Bulkhead 09 bent outward from the inside.\n\nWhoever tries the East Exit Gate: the card reader is dead without the High-Voltage Power Fuse from the Generator bench and the Gate Relay left in Security.',
      clueSummary: 'Exit Gate requires both the Power Fuse (Generator) and Gate Relay (Security) in addition to the Keycard.',
    },
    {
      id: 'note_decon_short',
      label: 'Scrawled Napkin',
      position: { x: 7.4, z: 26.5 },
      surfaceY: 1.02,
      text: 'The narrow service crawlspaces are 88cm wide. Its ribcage won’t fit.\n\nLockers only hide you if it hasn’t watched you climb inside.',
    },
  ],
  wallWritings: [
    { text: 'IT HUNTS SOUND', subtitle: 'DO NOT BREATHE LOUD', x: -11.45, y: 2.1, z: 11.0, rotY: -Math.PI / 2 },
    { text: 'NO ONE LEFT', subtitle: '4 CAME IN', x: 0, y: 2.2, z: -23.5, rotY: 0 },
    { text: 'CHECK THE ARCHIVE', subtitle: 'FOR THE VAULT CODE', x: 11.45, y: 2.1, z: 29.5, rotY: Math.PI / 2 },
  ],
  ai: CHAPTER_01_AI,
  completionText: 'The mechanical bolts retract with a deafening groan. You slip through the outer bulkhead as Subject 09 slams against the steel bars behind you — descending deeper toward the Forgotten Experiments wing.',
  nextChapterId: 'chapter-02',
};

export const CHAPTER_02_MISSION: ChapterMissionSpec = {
  chapterNumber: 2,
  id: 'chapter-02',
  title: 'CHAPTER 2: FORGOTTEN EXPERIMENTS',
  subtitle: 'Lower Experimental Wing',
  mainMission: 'Survive heightened acoustic stalking, recover Vance’s secondary research cores, unlock the Archive Vault, and power the lower lift.',
  gracePeriodSeconds: 15,
  introSentences: [
    'Beyond the outer containment gate lies the lower sub-wing — where Dr. Vance tested his prototypes before Subject 09.',
    'The steel bulkhead sealed behind you, cutting off any return to the upper estate.',
    'Down here, the air reeks of formalin and burnt insulation, and the acoustic echoes carry twice as far.',
    'Subject 09 followed your scent through the utility shafts. It knows your footsteps now, and it is listening closely.',
    'Recover the three experimental records, unseal the Specimen Vault, crack the secondary cipher, and restore the lower escape gate.'
  ],
  initialObjects: [
    {
      id: 'c2_obj_1',
      label: 'Acoustic Nerve Amplifier',
      roomName: 'Containment Hall',
      position: { x: -8.0, z: -14.0 },
      surfaceY: 1.22,
      meshKind: 'lab_module',
    },
    {
      id: 'c2_obj_2',
      label: 'Cracked Telemetry Recorder',
      roomName: 'Decontamination',
      position: { x: 7.5, z: 26.5 },
      surfaceY: 1.02,
      meshKind: 'broken_scanner',
    },
    {
      id: 'c2_obj_3',
      label: 'Preserved Tissue Jar 04-A',
      roomName: 'Records Archive',
      position: { x: 24.5, z: -19.5 },
      surfaceY: 0.04,
      meshKind: 'bio_vial',
    },
  ],
  roomKey: {
    id: 'c2_specimen_key',
    label: 'Corroded Vault Key',
    position: { x: 0.0, z: 0.0 },
    surfaceY: 1.02,
    spawnHint: 'A lock released in the Central Atrium planter — collect the Corroded Vault Key.',
  },
  lockedRoom: {
    roomId: 'specimen',
    roomName: 'Specimen Storage',
    doorPosition: { x: 11, z: 34 },
    doorAxis: 'z',
    doorWidth: 3.0,
  },
  keypadLocker: {
    position: { x: 25.0, z: 39.0 },
    facing: '-z',
    password: '8319',
    keycardLabel: 'Sub-Level Override Keycard',
  },
  escapeComponents: [
    {
      id: 'c2_esc_fuse',
      label: 'Auxiliary Breaker Core',
      roomName: 'Research Lab',
      position: { x: -17.0, z: -18.0 },
      surfaceY: 0.96,
      meshKind: 'fuse',
    },
    {
      id: 'c2_esc_relay',
      label: 'Hydraulic Gate Actuator',
      roomName: 'Generator Room',
      position: { x: -13.0, z: 26.5 },
      surfaceY: 1.22,
      meshKind: 'relay',
    },
  ],
  notes: [
    {
      id: 'c2_note_code',
      label: 'Stained Security Memo',
      position: { x: 19.0, z: -4.2 },
      surfaceY: 1.32,
      text: 'SECONDARY VAULT ROTATION\n\nNew Specimen Locker PIN:  8 3 1 9\n\nDo not leave this sheet on the Security counter.',
      clueSummary: 'Chapter 2 Vault Locker Code: 8319 (found in Security Office).',
      revealsPassword: true,
    },
    {
      id: 'c2_note_warn',
      label: 'Scratched Clipboard',
      position: { x: -20.5, z: -4.5 },
      surfaceY: 1.22,
      text: 'Subjects 01 through 08 starved within a week.\n09 never starved. It just grew quieter.',
      clueSummary: 'Subjects 01–08 perished; only Subject 09 survived metabolic deprivation.',
    },
  ],
  wallWritings: [
    { text: 'IT REMEMBERS', subtitle: 'KEEP MOVING', x: -11.45, y: 2.1, z: 11.0, rotY: -Math.PI / 2 },
  ],
  ai: CHAPTER_02_AI,
  completionText: 'You override the lower bulkhead and escape the Forgotten Experiments wing alive.',
  nextChapterId: null,
};

export const MISSION_CHAPTERS: Readonly<Record<string, ChapterMissionSpec>> = {
  'chapter-01': CHAPTER_01_MISSION,
  'chapter-02': CHAPTER_02_MISSION,
};

export function getMissionChapter(id: string): ChapterMissionSpec {
  return MISSION_CHAPTERS[id] ?? CHAPTER_01_MISSION;
}