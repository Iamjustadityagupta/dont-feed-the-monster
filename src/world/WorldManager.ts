import * as THREE from 'three';
import {
  CRAWLSPACES, EXIT_POSITION, KEYCARD_POSITION, LOCKERS, NOTES, ROOMS, SIGNS,
  PUZZLE_DRAWERS, PUZZLE_LOCKS, PUZZLE_FRAGMENTS, PUZZLE_BOX, KEYCARD_ROOM_DOOR,
  PASSWORD_LOCKER, KEYCARD_REWARD,
  getSolids, type Facing, type LockerSpec,
} from './LevelLayout';
import { FacilityBuilder } from './FacilityBuilder';
import { SignFactory, type WallSignSpec } from './SignFactory';
import {
  FacilityLighting, createChapterOneLighting, applyAtmosphere, type LightingQuality,
} from './FacilityLighting';
import type {
  DrawerId, FragmentId, HidingSpot, Interactable, LockId, PuzzleObjectId,
} from '../core/types';
import { createRng, type Rng } from '../core/Random';

const facingRotation = (f: Facing): number => (f === '+z' ? 0 : f === '-z' ? Math.PI : f === '+x' ? Math.PI / 2 : -Math.PI / 2);
const facingVector = (f: Facing): [number, number] => (f === '+z' ? [0, 1] : f === '-z' ? [0, -1] : f === '+x' ? [1, 0] : [-1, 0]);

/** Worn timber/steel palette; drawers cycle through it so they read distinct but consistent. */
const DRAWER_COLORS = [0x5a4a38, 0x4a4f52, 0x3f4a4a, 0x54483a, 0x475054, 0x4e4436];
const DRAWER_TRAVEL = 0.3;
const DRAWER_SPEED = 5.5;

export interface WorldManagerOptions {
  quality?: LightingQuality;
  /** renderer.capabilities.getMaxAnisotropy() pass kar sakte ho. */
  maxAnisotropy?: number;
}

interface DrawerAnim {
  group: THREE.Group;
  dir: THREE.Vector3;
  t: number;
  target: number;
}

interface LockFeedback {
  mesh: THREE.Object3D;
  t: number;
  ok: boolean;
}

export class WorldManager {
  readonly scene = new THREE.Scene();
  /** Same solids se bana hai jo navigation graph aur tests use karte hain, isliye collision data se drift nahi karta. */
  readonly colliders: THREE.Box3[] = getSolids().map((s) => new THREE.Box3(
    new THREE.Vector3(s.x - s.w / 2, 0, s.z - s.d / 2),
    new THREE.Vector3(s.x + s.w / 2, 3, s.z + s.d / 2),
  ));
  readonly hidingSpots: HidingSpot[] = [];
  readonly interactables: Interactable[] = [];
  readonly keycardPosition = new THREE.Vector3(KEYCARD_POSITION.x, 0, KEYCARD_POSITION.z);
  readonly exitPosition = new THREE.Vector3(EXIT_POSITION.x, 0, EXIT_POSITION.z);
  /** Public: gameplay se setZoneState(), zoneAt(), getStats() call kar sakte ho. */
  readonly lighting: FacilityLighting;

  private readonly facility = new FacilityBuilder();
  private readonly signs: SignFactory;
  private keycardMesh: THREE.Mesh | null = null;
  private keycardGlow: THREE.PointLight | null = null;

  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly matCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly box3 = new THREE.Box3();
  private disposed = false;

  /* ---- puzzle state ---- */
  private readonly puzzleMeshes = new Map<PuzzleObjectId, THREE.Object3D>();
  private readonly puzzleInteractables = new Map<PuzzleObjectId, Interactable>();
  private readonly drawerAnims = new Map<DrawerId, DrawerAnim>();
  private readonly lockFeedback = new Map<LockId, LockFeedback>();
  private keyedDoorPivot: THREE.Group | null = null;
  private keyedDoorOpenT = 0;
  private keyedDoorTarget = 0;
  private boxLid: THREE.Group | null = null;
  private boxOpenT = 0;
  private boxTarget = 0;
  private lockerDoor: THREE.Group | null = null;
  private lockerOpenT = 0;
  private lockerTarget = 0;
  private puzzleActive = true;

  constructor(options: WorldManagerOptions = {}) {
    this.signs = new SignFactory(options.maxAnisotropy ?? 4);
    this.chooseRandomKeycardPosition();
    applyAtmosphere(this.scene);
    this.lighting = createChapterOneLighting(this.scene, ROOMS, { quality: options.quality ?? 'medium' });
    this.build();
  }

  /** Har frame call karo. `focus` normally player position hai (light pool nearest zones ko assign hota hai). */
  update(delta: number, focus: THREE.Vector3): void {
    if (this.disposed) return;
    this.lighting.update(delta, focus);
    this.animatePuzzle(delta);
  }

  // ---- Shared helpers ----------------------------------------------------------------------------------------

  private mat(color: number, roughness = 0.85, metalness = 0.15): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}:${metalness}`;
    const cached = this.matCache.get(key);
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.matCache.set(key, m);
    this.materials.add(m);
    return m;
  }

  private glow(color: number, intensity = 1.2): THREE.MeshStandardMaterial {
    const key = `glow:${color}:${intensity}`;
    const cached = this.matCache.get(key);
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0 });
    this.matCache.set(key, m);
    this.materials.add(m);
    return m;
  }

  private box(
    x: number, y: number, z: number, w: number, h: number, d: number,
    material: THREE.Material, parent: THREE.Object3D = this.scene,
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, h, d);
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // ---- Build -------------------------------------------------------------------------------------------------

  private build(): void {
    // Floors, ceilings, walls, trim, door frames, ceiling services aur props FacilityBuilder se aate hain.
    // Ceiling fixtures aur room lights FacilityLighting own karta hai (constructor me already ban chuke hain).
    this.scene.add(this.facility.build());

    for (const l of LOCKERS) this.makeLocker(l);
    this.buildCrawlspaceMarkers();
    this.buildExit();
    this.buildPickups();
    for (const s of SIGNS) this.addSign({ text: s.text, x: s.x, y: s.y, z: s.z, rotY: s.rotY, color: s.color });
    this.buildSecurityMonitors();
    this.buildPuzzle();
  }

  private buildExit(): void {
    const trim = this.mat(0x171f26);
    const panel = this.box(29.55, 1.9, 14, 0.25, 3.6, 2.6, this.mat(0x9b342b));
    panel.userData.exit = true;
    this.box(29.7, 2, 12.35, 0.6, 4, 0.3, trim);
    this.box(29.7, 2, 15.65, 0.6, 4, 0.3, trim);
    this.box(29.7, 3.85, 14, 0.6, 0.3, 3.3, trim);
    this.box(29.4, 3.5, 14, 0.06, 0.12, 2.4, this.glow(0xff3a2a, 1.6));
    const hazard = this.mat(0xc99a1c, 0.6, 0.3);
    const black = this.mat(0x151515);
    for (let i = 0; i < 7; i += 1) {
      this.box(27.8, 0.0, 12.2 + i * 0.45 + 0.1, 3.2, 0.015, 0.22, i % 2 ? black : hazard);
    }
  }

  /**
   * Choose a clear floor position for the keycard, driven by a seeded RNG so a run's
   * placement is reproducible from its seed (needed so loading a save never moves it).
   * No room name or direction is ever exposed to the player — only "search the facility".
   */
  private chooseRandomKeycardPosition(seed?: number): void {
    const rng: Rng = createRng(seed ?? (Date.now() ^ 0x9e3779b9) >>> 0);
    const playerStart = new THREE.Vector3(-20, 0, 18);
    const exit = new THREE.Vector3(EXIT_POSITION.x, 0, EXIT_POSITION.z);
    const eligibleRooms = ROOMS.filter((room) => room.id !== 'hall');
    const previous = this.keycardPosition.clone();
    const hasPrevious = previous.lengthSq() > 0;

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const room = rng.pick(eligibleRooms);
      if (!room) continue;
      const x = rng.range(room.minX + 2.0, room.maxX - 2.0);
      const z = rng.range(room.minZ + 2.0, room.maxZ - 2.0);
      const candidate = new THREE.Vector3(x, 0, z);
      if (candidate.distanceTo(playerStart) < 9 || candidate.distanceTo(exit) < 5) continue;
      if (this.isBlocked(candidate, 0.32)) continue;
      // Avoid reusing the immediately previous spot while other valid rooms exist.
      if (hasPrevious && attempt < 450 && candidate.distanceTo(previous) < 4) continue;
      this.keycardPosition.set(x, 0, z);
      return;
    }

    // Deterministic fallback in a known open part of the atrium if sampling is unusually unlucky.
    this.keycardPosition.set(-2.5, 0, 5.2);
  }

  /** Re-place the keycard using an explicit run seed — called on new game / new run only. */
  placeKeycardForSeed(seed: number): void {
    this.chooseRandomKeycardPosition(seed);
    this.keycardMesh?.position.set(this.keycardPosition.x, 0.12, this.keycardPosition.z);
    if (this.keycardGlow) this.keycardGlow.position.set(this.keycardPosition.x, 0.8, this.keycardPosition.z);
    const keycardItem = this.interactables.find((item) => item.kind === 'keycard');
    keycardItem?.position.copy(this.keycardPosition);
  }

  /** Restore a previously-saved keycard position exactly (used when loading a save). */
  restoreKeycardPosition(x: number, z: number): void {
    this.keycardPosition.set(x, 0, z);
    this.keycardMesh?.position.set(x, 0.12, z);
    this.keycardGlow?.position.set(x, 0.8, z);
    const keycardItem = this.interactables.find((item) => item.kind === 'keycard');
    keycardItem?.position.copy(this.keycardPosition);
  }

  private buildPickups(): void {
    const cardMat = new THREE.MeshStandardMaterial({ color: 0x477783, metalness: 0.18, roughness: 0.82 });
    this.materials.add(cardMat);
    const card = this.box(this.keycardPosition.x, 0.12, this.keycardPosition.z, 0.36, 0.035, 0.23, cardMat);
    card.rotation.y = 0.45;
    this.keycardMesh = card;
    // Ek static glow light, fixed count hai isliye shader recompile nahi hota.
    const glow = new THREE.PointLight(0x6bc7df, 5, 6, 2);
    glow.position.set(this.keycardPosition.x, 0.8, this.keycardPosition.z);
    this.scene.add(glow);
    this.keycardGlow = glow;
    this.interactables.push({ position: this.keycardPosition.clone(), kind: 'keycard', label: 'Security keycard', active: true, mesh: card, category: 'solid' });

    for (const n of NOTES) {
      const isTerminal = /terminal/i.test(n.label);
      const noteMat = new THREE.MeshStandardMaterial({
        color: isTerminal ? 0x7fe0a8 : 0xc8c1a7,
        emissive: isTerminal ? 0x2a8a5a : 0x000000,
        emissiveIntensity: isTerminal ? 1.0 : 0,
      });
      this.materials.add(noteMat);
      const note = this.box(n.x, 0.08, n.z, 0.42, 0.025, 0.3, noteMat);
      // Every readable prop opens the paper overlay. Terminals keep their green in-world look,
      // but their text should be read on the same enlarged paper UI as ordinary notes.
      this.interactables.push({ position: new THREE.Vector3(n.x, 0, n.z), kind: 'note', label: n.label, active: true, mesh: note, text: n.text, category: 'paper' });
    }
  }

  private buildSecurityMonitors(): void {
    const screen = this.glow(0x2f8fb0, 0.9);
    const bezel = this.mat(0x0d1317);
    for (const z of [-1.2, 1.5, 4.2]) {
      this.box(28.6, 1.85, z, 0.04, 0.78, 1.98, bezel);
      this.box(28.56, 1.85, z, 0.03, 0.66, 1.84, screen);
    }
  }

  /** Har narrow closet gap par sign aur teal floor marker: "too narrow for Subject 09". */
  private buildCrawlspaceMarkers(): void {
    const marker = this.glow(0x2a8f7a, 0.35);
    for (const c of CRAWLSPACES) {
      const [fx, fz] = facingVector(c.facing);
      this.addSign({
        text: 'SAFE CLOSET',
        subtitle: 'TOO NARROW',
        tone: 'safe',
        x: c.gap.x + fx * 0.43,
        y: 2.9,
        z: c.gap.z + fz * 0.43,
        rotY: facingRotation(c.facing),
        color: 0x4fe0c0,
      });
      const i = c.interior;
      this.box((i.minX + i.maxX) / 2, 0.005, (i.minZ + i.maxZ) / 2, i.maxX - i.minX - 0.4, 0.012, i.maxZ - i.minZ - 0.4, marker);
    }
  }

  private makeLocker(l: LockerSpec): void {
    const group = new THREE.Group();
    const shell = this.box(0, 1.35, 0, 1.2, 2.7, 0.8, this.mat(0x39434a, 0.6, 0.5), group);
    shell.castShadow = true;
    this.box(0, 1.35, 0.43, 1.05, 2.5, 0.06, this.mat(0x202a31, 0.55, 0.5), group);
    const slot = this.mat(0x0b0f12);
    for (const y of [2.2, 2.3, 2.4]) this.box(0, y, 0.47, 0.7, 0.05, 0.02, slot, group);
    this.box(0.35, 1.3, 0.48, 0.06, 0.35, 0.07, this.mat(0x9aacae, 0.35, 0.8), group);
    this.box(0, 2.6, 0.46, 0.5, 0.12, 0.02, this.mat(0xcfd6d6), group); // label plate
    group.position.set(l.x, 0, l.z);
    group.rotation.y = facingRotation(l.facing);
    this.scene.add(group);
    this.hidingSpots.push({ mesh: group, position: new THREE.Vector3(l.x, 0, l.z), occupied: false, label: l.label });
    this.interactables.push({ position: new THREE.Vector3(l.x, 0, l.z), kind: 'hiding', label: l.label, active: true, mesh: group, category: 'solid' });
  }

  private addSign(spec: WallSignSpec): void {
    this.scene.add(this.signs.create(spec));
  }

  // ---- Puzzle build ------------------------------------------------------------------------------------------

  private registerPuzzleInteractable(
    id: PuzzleObjectId,
    kind: Interactable['kind'],
    label: string,
    mesh: THREE.Object3D,
    position: THREE.Vector3,
    extra: Partial<Interactable> = {},
  ): void {
    mesh.userData.puzzleId = id;
    mesh.userData.raycastTarget = true;
    this.puzzleMeshes.set(id, mesh);
    const item: Interactable = {
      position,
      kind,
      label,
      active: true,
      mesh,
      category: 'solid',
      objectId: id,
      ...extra,
    };
    this.puzzleInteractables.set(id, item);
    this.interactables.push(item);
  }

  private buildPuzzle(): void {
    const steel = this.mat(0x4a4f52, 0.72, 0.42);
    const dark = this.mat(0x22282c, 0.7, 0.45);

    // --- 20 drawers: static housing + sliding tray, never a hiding spot ---
    PUZZLE_DRAWERS.forEach((spec, index) => {
      const bodyColor = DRAWER_COLORS[index % DRAWER_COLORS.length];
      const body = this.mat(bodyColor, 0.86, 0.1);
      const group = new THREE.Group();
      group.position.set(spec.x, 0, spec.z);
      group.rotation.y = facingRotation(spec.facing);
      this.scene.add(group);

      this.box(0, 0.55, 0, 0.8, 1.1, 0.42, body, group);
      this.box(0, 1.14, 0, 0.86, 0.05, 0.46, dark, group);

      const tray = new THREE.Group();
      group.add(tray);
      const front = this.box(0, 0.62, 0.23, 0.74, 0.26, 0.05, steel, tray);
      this.box(0, 0.62, 0.27, 0.16, 0.03, 0.03, this.mat(0xb9c2c4, 0.4, 0.7), tray);
      this.box(0, 0.5, 0.02, 0.68, 0.03, 0.36, dark, tray);

      const [dx, dz] = facingVector(spec.facing);
      this.drawerAnims.set(spec.id, { group: tray, dir: new THREE.Vector3(dx, 0, dz), t: 0, target: 0 });

      this.registerPuzzleInteractable(spec.id, 'drawer', spec.label, front, new THREE.Vector3(spec.x, 0.6, spec.z));
    });

    // --- 3 lock plates on the access door ---
    PUZZLE_LOCKS.forEach((spec, index) => {
      const group = new THREE.Group();
      group.position.set(spec.x, 1.28, spec.z);
      this.scene.add(group);
      this.box(0, 0, 0, 0.2, 0.3, 0.07, steel, group);
      const barrel = this.box(0, 0, 0.05, 0.09, 0.09, 0.05, dark, group);
      this.box(0, -0.16, 0.04, 0.05, 0.08, 0.03, this.mat(0x8f9a9c, 0.45, 0.6), group);
      group.userData.lockIndex = index;
      this.lockFeedback.set(spec.id, { mesh: barrel, t: 0, ok: true });
      this.registerPuzzleInteractable(spec.id, 'key', `Lock ${index + 1}`, group, new THREE.Vector3(spec.x, 1.28, spec.z), {
        requiresItem: spec.accepts,
        consumesItem: true,
      });
    });

    // --- 3 matte fragments ---
    const fragmentMat = this.mat(0x6f6a5e, 0.94, 0.06);
    PUZZLE_FRAGMENTS.forEach((spec) => {
      const group = new THREE.Group();
      group.position.set(spec.x, spec.surfaceY + 0.012, spec.z);
      group.rotation.y = (spec.x * 1.7 + spec.z) % Math.PI;
      this.scene.add(group);
      this.box(0, 0.012, 0, 0.16, 0.024, 0.11, fragmentMat, group);
      this.box(0.03, 0.026, -0.01, 0.06, 0.014, 0.06, fragmentMat, group);
      this.registerPuzzleInteractable(spec.id, 'fragment', spec.label, group, new THREE.Vector3(spec.x, spec.surfaceY, spec.z));
    });

    // --- combination box ---
    const boxGroup = new THREE.Group();
    boxGroup.position.set(PUZZLE_BOX.x, 0, PUZZLE_BOX.z);
    this.scene.add(boxGroup);
    const wood = this.mat(0x54402c, 0.9, 0.05);
    this.box(0, 0.17, 0, 0.5, 0.34, 0.38, wood, boxGroup);
    this.box(0, 0.36, 0, 0.52, 0.03, 0.4, dark, boxGroup);
    this.box(0, 0.17, 0.19, 0.1, 0.12, 0.02, steel, boxGroup);
    const lid = new THREE.Group();
    lid.position.set(0, 0.37, -0.19);
    boxGroup.add(lid);
    this.box(0, 0.015, 0.19, 0.5, 0.03, 0.38, wood, lid);
    this.box(0, 0.03, 0.19, 0.2, 0.012, 0.05, steel, lid);
    this.boxLid = lid;
    this.registerPuzzleInteractable('combination_box', 'box', PUZZLE_BOX.label, boxGroup, new THREE.Vector3(PUZZLE_BOX.x, 0.2, PUZZLE_BOX.z));

    // --- keyed archive door ---
    const doorPivot = new THREE.Group();
    doorPivot.position.set(KEYCARD_ROOM_DOOR.x, 0, KEYCARD_ROOM_DOOR.z - 1.5);
    this.scene.add(doorPivot);
    const panel = this.box(0, 1.35, 1.5, 0.14, 2.7, 2.96, this.mat(0x4d4034, 0.8, 0.2), doorPivot);
    this.box(0.09, 1.3, 2.78, 0.06, 0.22, 0.06, steel, doorPivot);
    this.box(0, 0.9, 1.5, 0.16, 0.1, 2.9, steel, doorPivot);
    this.keyedDoorPivot = doorPivot;
    this.registerPuzzleInteractable('keycard_room_door', 'keyed_door', KEYCARD_ROOM_DOOR.label, panel, new THREE.Vector3(KEYCARD_ROOM_DOOR.x, 1.2, KEYCARD_ROOM_DOOR.z), {
      requiresItem: 'room_key',
    });

    // --- password locker ---
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(PASSWORD_LOCKER.x, 0, PASSWORD_LOCKER.z);
    lockerGroup.rotation.y = -Math.PI / 2;
    this.scene.add(lockerGroup);
    this.box(0, 0.95, 0, 0.9, 1.9, 0.6, this.mat(0x3c464c, 0.65, 0.45), lockerGroup);
    const doorLeaf = new THREE.Group();
    doorLeaf.position.set(-0.43, 0.95, 0.31);
    lockerGroup.add(doorLeaf);
    this.box(0.43, 0, 0, 0.85, 1.84, 0.05, this.mat(0x323b41, 0.6, 0.45), doorLeaf);
    this.box(0.78, 0.1, 0.04, 0.12, 0.14, 0.04, steel, doorLeaf);
    this.box(0.43, 0.5, 0.04, 0.3, 0.14, 0.02, dark, doorLeaf);
    this.lockerDoor = doorLeaf;
    this.registerPuzzleInteractable('password_locker', 'password_locker', PASSWORD_LOCKER.label, lockerGroup, new THREE.Vector3(PASSWORD_LOCKER.x, 1.0, PASSWORD_LOCKER.z));

    // --- matte keycard reward inside the locker ---
    const rewardMat = this.mat(0x8f9a94, 0.9, 0.12);
    const reward = this.box(KEYCARD_REWARD.x, KEYCARD_REWARD.y ?? 1.1, KEYCARD_REWARD.z, 0.24, 0.02, 0.15, rewardMat);
    reward.rotation.y = 0.3;
    reward.visible = false;
    this.keycardMesh = reward;
    this.registerPuzzleInteractable('keycard', 'keycard', KEYCARD_REWARD.label, reward, new THREE.Vector3(KEYCARD_REWARD.x, KEYCARD_REWARD.y ?? 1.1, KEYCARD_REWARD.z));
  }

  private animatePuzzle(delta: number): void {
    for (const anim of this.drawerAnims.values()) {
      if (anim.t === anim.target) continue;
      const step = delta * DRAWER_SPEED;
      anim.t = anim.t < anim.target ? Math.min(anim.target, anim.t + step) : Math.max(anim.target, anim.t - step);
      const eased = anim.t * anim.t * (3 - 2 * anim.t);
      anim.group.position.copy(anim.dir).multiplyScalar(eased * DRAWER_TRAVEL);
    }

    for (const fb of this.lockFeedback.values()) {
      if (fb.t <= 0) continue;
      fb.t = Math.max(0, fb.t - delta * 2.2);
      fb.mesh.rotation.z = Math.sin(fb.t * 26) * 0.22 * (fb.ok ? 1 : 0.5);
      fb.mesh.rotation.y = fb.ok ? fb.t * 1.2 : 0;
    }

    if (this.keyedDoorOpenT !== this.keyedDoorTarget) {
      this.keyedDoorOpenT = THREE.MathUtils.damp(this.keyedDoorOpenT, this.keyedDoorTarget, 4, delta);
      if (this.keyedDoorPivot) this.keyedDoorPivot.rotation.y = -this.keyedDoorOpenT * 1.45;
    }
    if (this.boxOpenT !== this.boxTarget) {
      this.boxOpenT = THREE.MathUtils.damp(this.boxOpenT, this.boxTarget, 5, delta);
      if (this.boxLid) this.boxLid.rotation.x = -this.boxOpenT * 1.7;
    }
    if (this.lockerOpenT !== this.lockerTarget) {
      this.lockerOpenT = THREE.MathUtils.damp(this.lockerOpenT, this.lockerTarget, 5, delta);
      if (this.lockerDoor) this.lockerDoor.rotation.y = this.lockerOpenT * 1.9;
    }
  }

  // ---- Puzzle public API --------------------------------------------------------------------------------------

  /** Raycast list for the player: only active puzzle meshes. */
  getPuzzleRaycastTargets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const [id, item] of this.puzzleInteractables) {
      const mesh = this.puzzleMeshes.get(id);
      if (mesh && item.active) out.push(mesh);
    }
    return out;
  }

  getPuzzleInteractable(id: PuzzleObjectId): Interactable | undefined {
    return this.puzzleInteractables.get(id);
  }

  setDrawerOpen(id: DrawerId, open: boolean): void {
    const anim = this.drawerAnims.get(id);
    if (anim) anim.target = open ? 1 : 0;
  }

  setLockUnlocked(id: LockId, unlocked: boolean): void {
    const fb = this.lockFeedback.get(id);
    if (fb) { fb.t = unlocked ? 1 : 0; fb.ok = unlocked; }
    const item = this.puzzleInteractables.get(id);
    if (item) item.active = !unlocked;
  }

  /** Short wobble; call on a failed attempt. */
  playLockFeedback(id: LockId, ok: boolean): void {
    const fb = this.lockFeedback.get(id);
    if (fb) { fb.t = 1; fb.ok = ok; }
  }

  setFragmentVisible(id: FragmentId, visible: boolean): void {
    const mesh = this.puzzleMeshes.get(id);
    if (mesh) mesh.visible = visible;
    const item = this.puzzleInteractables.get(id);
    if (item) item.active = visible;
  }

  setBoxOpen(open: boolean): void {
    this.boxTarget = open ? 1 : 0;
    const item = this.puzzleInteractables.get('combination_box');
    if (item) item.active = !open;
  }

  setKeyedDoorOpen(open: boolean): void {
    this.keyedDoorTarget = open ? 1 : 0;
    const item = this.puzzleInteractables.get('keycard_room_door');
    if (item) item.active = !open;
  }

  setLockerOpen(open: boolean): void {
    this.lockerTarget = open ? 1 : 0;
  }

  setKeycardVisible(visible: boolean): void {
    if (this.keycardMesh) this.keycardMesh.visible = visible;
    if (this.keycardGlow) this.keycardGlow.visible = visible;
    const item = this.puzzleInteractables.get('keycard');
    if (item) item.active = visible;
  }

  /** Enables/disables every puzzle interactable at once (used while a menu or cutscene owns input). */
  setPuzzleActive(active: boolean): void {
    this.puzzleActive = active;
    for (const item of this.puzzleInteractables.values()) item.active = active;
  }

  isPuzzleActive(): boolean {
    return this.puzzleActive;
  }

  /** Hard reset: drawers shut, locks relocked, fragments back, box/locker/door closed, keycard hidden. */
  resetPuzzle(): void {
    for (const anim of this.drawerAnims.values()) { anim.t = 0; anim.target = 0; anim.group.position.set(0, 0, 0); }
    for (const fb of this.lockFeedback.values()) { fb.t = 0; fb.mesh.rotation.set(0, 0, 0); }
    for (const id of this.lockFeedback.keys()) {
      const item = this.puzzleInteractables.get(id);
      if (item) item.active = true;
    }
    for (const spec of PUZZLE_FRAGMENTS) this.setFragmentVisible(spec.id, true);
    this.keyedDoorOpenT = 0; this.keyedDoorTarget = 0;
    if (this.keyedDoorPivot) this.keyedDoorPivot.rotation.y = 0;
    this.boxOpenT = 0; this.boxTarget = 0;
    if (this.boxLid) this.boxLid.rotation.x = 0;
    this.lockerOpenT = 0; this.lockerTarget = 0;
    if (this.lockerDoor) this.lockerDoor.rotation.y = 0;
    this.setKeycardVisible(false);
    this.setPuzzleActive(true);
    const boxItem = this.puzzleInteractables.get('combination_box');
    if (boxItem) boxItem.active = true;
    const doorItem = this.puzzleInteractables.get('keycard_room_door');
    if (doorItem) doorItem.active = true;
  }

  // ---- Public API --------------------------------------------------------------------------------------------

  /** Har pickup dobara active, har locker free, aur lighting reset (run restart par). */
  resetInteractables(): void {
    // Every fresh run relocates the keycard to a different walkable, unblocked spot.
    this.chooseRandomKeycardPosition();
    this.keycardMesh?.position.set(this.keycardPosition.x, 0.12, this.keycardPosition.z);
    if (this.keycardGlow) this.keycardGlow.position.set(this.keycardPosition.x, 0.8, this.keycardPosition.z);
    const keycardItem = this.interactables.find((item) => item.kind === 'keycard');
    keycardItem?.position.copy(this.keycardPosition);
    for (const item of this.interactables) {
      item.active = true;
      item.mesh.visible = true;
    }
    for (const spot of this.hidingSpots) spot.occupied = false;
    this.resetPuzzle();
    this.lighting.reset();
  }

  isBlocked(position: THREE.Vector3, radius = 0.35): boolean {
    this.box3.min.set(position.x - radius, 0.05, position.z - radius);
    this.box3.max.set(position.x + radius, 1.8, position.z + radius);
    for (const c of this.colliders) if (c.intersectsBox(this.box3)) return true;
    return false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Har owner apni cheezein free karta hai, scene.clear() sabse last me.
    this.facility.dispose();
    this.signs.dispose();
    this.lighting.dispose();
    this.drawerAnims.clear();
    this.lockFeedback.clear();
    this.puzzleMeshes.clear();
    this.puzzleInteractables.clear();
    this.keyedDoorPivot = null;
    this.boxLid = null;
    this.lockerDoor = null;
    this.keycardMesh = null;
    this.keycardGlow = null;
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.matCache.clear();
    this.scene.clear();
  }
}