import * as THREE from 'three';
import {
  CRAWLSPACES, EXIT_POSITION, KEYCARD_POSITION, LOCKERS, NOTES, ROOMS, SIGNS,
  getSolids, type Facing, type LockerSpec,
} from './LevelLayout';
import { FacilityBuilder } from './FacilityBuilder';
import { SignFactory, type WallSignSpec } from './SignFactory';
import {
  FacilityLighting, createChapterOneLighting, applyAtmosphere, type LightingQuality,
} from './FacilityLighting';
import type { HidingSpot, Interactable } from '../core/types';
import { createRng, type Rng } from '../core/Random';

const facingRotation = (f: Facing): number => (f === '+z' ? 0 : f === '-z' ? Math.PI : f === '+x' ? Math.PI / 2 : -Math.PI / 2);
const facingVector = (f: Facing): [number, number] => (f === '+z' ? [0, 1] : f === '-z' ? [0, -1] : f === '+x' ? [1, 0] : [-1, 0]);

export interface WorldManagerOptions {
  quality?: LightingQuality;
  /** renderer.capabilities.getMaxAnisotropy() pass kar sakte ho. */
  maxAnisotropy?: number;
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
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.matCache.clear();
    this.scene.clear();
  }
}