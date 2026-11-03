import * as THREE from 'three';
import { DisposableGroup, type Disposable } from '../core/Disposable';
import { createRng, hashString, type Rng } from '../core/Random';

/**
 * Zone-based facility lighting.
 *
 * Design goals (see the v0.3 -> expanded-map plan):
 *  - Every room is a LIGHT ZONE with a kind: clinical / warm / emergency / restricted / safe / service.
 *    The kind decides tube colour, practical-light colour and how the room reads to the player
 *    (safe = teal, restricted = cyan, danger = emergency red, everything else = neutral white/amber).
 *  - Ceiling fluorescent fixtures are drawn with TWO InstancedMeshes (housing + glowing tube) for the whole
 *    facility: two draw calls no matter how many fixtures exist. Fixture colour is a per-instance colour, so
 *    flicker / blackout / emergency never allocates materials or geometry.
 *  - Real lights are expensive in a forward renderer, so only a small FIXED POOL of PointLights is used.
 *    Every 0.2 s the pool is re-assigned to the zone anchors nearest the player; swapping fades the old light
 *    out and the new one in, so nothing pops. The pool size never changes at runtime (changing the light
 *    count would force a shader recompile); setQuality() only changes how many pool slots are active.
 *  - No real-time shadows. Clinical areas are readable by design; the flashlight is a plain SpotLight.
 *  - Flicker exists ONLY for zones that opt in with a FlickerSpec, is seeded (deterministic for a given
 *    sequence of update() deltas) and never drops below the spec's minFactor, so rooms never go pure black.
 *  - Zones can be switched at runtime ('on' | 'off' | 'emergency') for gameplay: generator rooms, blackouts,
 *    alarm sequences in later chapters.
 *
 * Integration notes (WorldManager):
 *  - Remove WorldManager.buildLighting()'s HemisphereLight, DirectionalLight, per-room PointLights and lamp bars.
 *    This class owns ambient/hemisphere light, the ceiling fixtures and the room practicals.
 *  - Create it after the level is built:   this.lighting = createChapterOneLighting(this.scene, ROOMS, { quality });
 *  - Call every simulation step:           this.lighting.update(dt, playerPosition);
 *  - On restart:                           this.lighting.reset();
 *  - On teardown:                          this.lighting.dispose();
 *  - Call applyAtmosphere(scene) once and tuneFlashlight(flashlight.light) once.
 */

// ---------------------------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------------------------

export type LightingQuality = 'low' | 'medium' | 'high';
export type ZoneKind = 'clinical' | 'warm' | 'emergency' | 'restricted' | 'safe' | 'service';
export type ZonePowerState = 'on' | 'off' | 'emergency';
/** How a zone should be presented to the player (HUD tint, audio bed, objective hints). */
export type ZoneThreat = 'safe' | 'neutral' | 'restricted' | 'danger';

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FlickerSpec {
  /** 0..1 share of the zone's live fixtures that take part in flicker (the rest stay steady). */
  fixtureShare: number;
  /** Lowest brightness factor reached while stuttering (0..1). Keeps the room readable. */
  minFactor: number;
  /** Min/max seconds of steady light between stutter bursts. */
  steadySeconds: readonly [number, number];
  /** Min/max length of one stutter burst in seconds. */
  stutterSeconds: readonly [number, number];
}

export interface LightAnchor {
  x: number;
  z: number;
  y?: number;
}

export interface LightZoneSpec {
  id: string;
  kind: ZoneKind;
  bounds: ZoneBounds;
  /** Light candidates for the pooled practical lights. Defaults to the zone centre. */
  anchors?: readonly LightAnchor[];
  /** Metres between fixture rows. Default 6. */
  fixtureSpacing?: number;
  /** Metres kept clear of the zone edge (walls are thick). Default 1.2. */
  inset?: number;
  /** 0..1 share of fixtures that are dead/dark (storytelling). At least one fixture always stays alive. */
  deadFraction?: number;
  /** Omit for a steady zone. Flicker is opt-in per zone. */
  flicker?: FlickerSpec;
  /** Multiplier on the kind's practical-light intensity. Default 1. */
  intensityScale?: number;
}

export interface FacilityLightingOptions {
  seed?: number;
  quality?: LightingQuality;
  /** Underside plane of the ceiling in metres. Default 4.02. */
  ceilingY?: number;
  /** Height of the practical point lights. Default 3.4. */
  practicalY?: number;
  /** Override pool size (default 4 / 6 / 8 for low / medium / high). */
  maxDynamicLights?: number;
}

export interface ZoneInfo {
  readonly id: string;
  readonly kind: ZoneKind;
  readonly threat: ZoneThreat;
}

export interface LightingStats {
  zones: number;
  fixtures: number;
  deadFixtures: number;
  candidates: number;
  poolSize: number;
  activeSlots: number;
  litSlots: number;
}

/** Structural subset of LevelLayout.RoomSpec so this module stays independent of the world data module. */
export interface RoomLike {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lamp: { x: number; z: number };
}

// ---------------------------------------------------------------------------------------------------------------
// Tuning tables
// ---------------------------------------------------------------------------------------------------------------

interface KindProfile {
  tube: number;
  light: number;
  intensity: number;
  distance: number;
  threat: ZoneThreat;
}

const KIND_PROFILES: Readonly<Record<ZoneKind, KindProfile>> = {
  clinical: { tube: 0xdff3ff, light: 0x9fd4ec, intensity: 30, distance: 18, threat: 'neutral' },
  warm: { tube: 0xffe6c4, light: 0xffcf9b, intensity: 26, distance: 17, threat: 'neutral' },
  emergency: { tube: 0xff4a3a, light: 0xd23a2e, intensity: 24, distance: 16, threat: 'danger' },
  restricted: { tube: 0x7fd8ff, light: 0x5fb8e0, intensity: 26, distance: 17, threat: 'restricted' },
  safe: { tube: 0xbff5e3, light: 0x7fd9bd, intensity: 28, distance: 17, threat: 'safe' },
  service: { tube: 0xe8dcc0, light: 0xc9b98f, intensity: 20, distance: 15, threat: 'neutral' },
};

const DEAD_TUBE = 0x1a2026;
const EMERGENCY_TUBE = 0xff3a2a;
const EMERGENCY_LIGHT = 0xd02a20;

const EMERGENCY_POWER = 0.72;
const POWER_RATE = 2.5;
const MIX_RATE = 1.5;
const PULSE_SPEED = 2.4;
const PULSE_DEPTH = 0.22;
const FADE_RATE = 4;
const RESELECT_SECONDS = 0.2;
const REACH_MARGIN = 10;
const EPS = 0.003;
const NONE = -1;

const POOL_BY_QUALITY: Readonly<Record<LightingQuality, number>> = { low: 4, medium: 6, high: 8 };

const TUBE_SIZE = { x: 1.5, y: 0.05, z: 0.26 } as const;
const HOUSING_SIZE = { x: 1.62, y: 0.07, z: 0.34 } as const;

export const FLICKER_HEAVY: FlickerSpec = {
  fixtureShare: 0.6,
  minFactor: 0.3,
  steadySeconds: [2.5, 8],
  stutterSeconds: [0.25, 0.9],
};

export const FLICKER_LIGHT: FlickerSpec = {
  fixtureShare: 0.35,
  minFactor: 0.45,
  steadySeconds: [6, 16],
  stutterSeconds: [0.15, 0.5],
};

// ---------------------------------------------------------------------------------------------------------------
// Internal runtime types
// ---------------------------------------------------------------------------------------------------------------

interface FlickerRuntime {
  spec: FlickerSpec;
  mode: 'steady' | 'stutter';
  timer: number;
  tick: number;
  value: number;
}

interface ZoneRuntime {
  spec: LightZoneSpec;
  profile: KindProfile;
  info: ZoneInfo;
  rng: Rng;
  fixtureIds: number[];
  liveFraction: number;
  flicker: FlickerRuntime | null;
  state: ZonePowerState;
  power: number;
  mix: number;
  phase: number;
  /** Brightness for steady fixtures, and for flickering fixtures (steady * flicker value). */
  steady: number;
  flick: number;
  drawnMix: number;
}

interface Fixture {
  zone: ZoneRuntime;
  x: number;
  z: number;
  dead: boolean;
  flickers: boolean;
}

interface Candidate {
  zone: ZoneRuntime;
  x: number;
  y: number;
  z: number;
  baseIntensity: number;
  distance: number;
  lightColor: number;
}

interface Slot {
  light: THREE.PointLight;
  candidate: number;
  target: number;
  fade: number;
}

const approach = (value: number, target: number, step: number): number => {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
};

// ---------------------------------------------------------------------------------------------------------------
// FacilityLighting
// ---------------------------------------------------------------------------------------------------------------

export class FacilityLighting implements Disposable {
  private readonly group = new DisposableGroup();
  private readonly seed: number;
  private readonly zones: ZoneRuntime[] = [];
  private readonly zoneById = new Map<string, ZoneRuntime>();
  private readonly fixtures: Fixture[] = [];
  private readonly candidates: Candidate[] = [];
  private readonly slots: Slot[] = [];

  // Reused scratch state: nothing below allocates while the game is running.
  private readonly scores: number[] = [];
  private readonly order: number[] = [];
  private readonly desired: number[] = [];
  private readonly satisfied: boolean[] = [];
  private readonly used: boolean[] = [];
  private readonly colorA = new THREE.Color();
  private readonly colorB = new THREE.Color();
  private readonly dummy = new THREE.Object3D();
  private readonly byScore = (a: number, b: number): number => this.scores[a] - this.scores[b] || a - b;

  private readonly ambient: THREE.AmbientLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly housing: THREE.InstancedMesh;
  private readonly tubes: THREE.InstancedMesh;
  private readonly ceilingY: number;
  private readonly practicalY: number;

  private elapsed = 0;
  private selectTimer = 0;
  private primed = false;
  private activeSlots: number;
  private ambientScale = 1;

  constructor(
    private readonly scene: THREE.Scene,
    specs: readonly LightZoneSpec[],
    options: FacilityLightingOptions = {},
  ) {
    this.seed = options.seed ?? 9091;
    this.ceilingY = options.ceilingY ?? 4.02;
    this.practicalY = options.practicalY ?? 3.4;
    const quality = options.quality ?? 'medium';
    const poolSize = Math.max(1, Math.floor(options.maxDynamicLights ?? POOL_BY_QUALITY[quality]));
    this.activeSlots = poolSize;

    this.buildZones(specs);

    // Ambient floor: dark enough for mood, bright enough that routes and props are never guesswork.
    this.ambient = new THREE.AmbientLight(0x2a3a4c, 0.55);
    this.hemi = new THREE.HemisphereLight(0x6f8ea3, 0x10161b, 0.7);
    this.scene.add(this.ambient, this.hemi);
    this.group.addFn(() => {
      this.scene.remove(this.ambient, this.hemi);
      this.ambient.dispose();
      this.hemi.dispose();
    });

    // Shared geometry and materials for every ceiling fixture in the facility.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.7, metalness: 0.4 });
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const capacity = Math.max(1, this.fixtures.length);

    this.housing = new THREE.InstancedMesh(geometry, housingMaterial, capacity);
    this.tubes = new THREE.InstancedMesh(geometry, tubeMaterial, capacity);
    this.housing.count = this.fixtures.length;
    this.tubes.count = this.fixtures.length;
    this.writeFixtureMatrices();
    for (const zone of this.zones) this.recolor(zone);
    this.scene.add(this.housing, this.tubes);
    this.group.addFn(() => {
      this.scene.remove(this.housing, this.tubes);
      this.housing.dispose();
      this.tubes.dispose();
      geometry.dispose();
      housingMaterial.dispose();
      tubeMaterial.dispose();
    });

    // Fixed pool of practical lights.
    for (let i = 0; i < poolSize; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      this.scene.add(light);
      this.group.addFn(() => {
        this.scene.remove(light);
        light.dispose();
      });
      this.slots.push({ light, candidate: NONE, target: NONE, fade: 0 });
      this.used.push(false);
      this.satisfied.push(false);
      this.desired.push(NONE);
    }
  }

  // ---- Public API --------------------------------------------------------------------------------------------

  /** Advance flicker, power transitions and the light pool. `focus` is normally the player position. */
  update(delta: number, focus: THREE.Vector3): void {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    this.elapsed += dt;

    for (const zone of this.zones) {
      if (this.advanceZone(zone, dt)) this.recolor(zone);
    }

    this.selectTimer -= dt;
    if (!this.primed) {
      this.reselect(focus);
      this.snapSlots();
      this.primed = true;
      this.selectTimer = RESELECT_SECONDS;
    } else if (this.selectTimer <= 0) {
      this.reselect(focus);
      this.selectTimer = RESELECT_SECONDS;
    }

    this.updateSlots(dt);
  }

  /** Switch one zone. Transitions are smoothed, so this is safe to call from gameplay events. */
  setZoneState(id: string, state: ZonePowerState): void {
    const zone = this.zoneById.get(id);
    if (!zone) throw new Error(`Unknown lighting zone: ${id}`);
    zone.state = state;
  }

  setAllZones(state: ZonePowerState): void {
    for (const zone of this.zones) zone.state = state;
  }

  getZoneState(id: string): ZonePowerState | undefined {
    return this.zoneById.get(id)?.state;
  }

  /** Zone containing this point (full bounds, not inset), or null in the service void between rooms. */
  zoneAt(x: number, z: number): ZoneInfo | null {
    for (const zone of this.zones) {
      const b = zone.spec.bounds;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return zone.info;
    }
    return null;
  }

  /** Scale ambient and hemisphere light, e.g. 0.8 for a darker chapter. */
  setAmbientScale(scale: number): void {
    this.ambientScale = Math.max(0, scale);
    this.ambient.intensity = 0.55 * this.ambientScale;
    this.hemi.intensity = 0.7 * this.ambientScale;
  }

  /** Changes how many pool lights are active. The pool itself never grows or shrinks (no shader recompiles). */
  setQuality(quality: LightingQuality): void {
    this.activeSlots = Math.min(this.slots.length, POOL_BY_QUALITY[quality]);
    this.selectTimer = 0;
  }

  /** Return every zone to 'on' and restart flicker from the seed. Used when a run restarts. */
  reset(): void {
    this.elapsed = 0;
    this.selectTimer = 0;
    this.primed = false;
    for (const zone of this.zones) {
      zone.state = 'on';
      zone.power = 1;
      zone.mix = 0;
      zone.rng = createRng((this.seed ^ hashString(zone.spec.id)) >>> 0);
      zone.flicker = zone.spec.flicker ? this.makeFlicker(zone.spec.flicker, zone.rng) : null;
      zone.steady = 1;
      zone.flick = 1;
      zone.drawnMix = 0;
      this.recolor(zone);
    }
    for (const slot of this.slots) {
      slot.candidate = NONE;
      slot.target = NONE;
      slot.fade = 0;
      slot.light.intensity = 0;
    }
  }

  getStats(): LightingStats {
    let dead = 0;
    for (const fixture of this.fixtures) if (fixture.dead) dead += 1;
    let lit = 0;
    for (const slot of this.slots) if (slot.candidate !== NONE && slot.light.intensity > 0.01) lit += 1;
    return {
      zones: this.zones.length,
      fixtures: this.fixtures.length,
      deadFixtures: dead,
      candidates: this.candidates.length,
      poolSize: this.slots.length,
      activeSlots: this.activeSlots,
      litSlots: lit,
    };
  }

  dispose(): void {
    this.group.dispose();
    this.zones.length = 0;
    this.zoneById.clear();
    this.fixtures.length = 0;
    this.candidates.length = 0;
    this.slots.length = 0;
  }

  // ---- Construction ------------------------------------------------------------------------------------------

  private buildZones(specs: readonly LightZoneSpec[]): void {
    for (const spec of specs) {
      if (this.zoneById.has(spec.id)) throw new Error(`Duplicate lighting zone: ${spec.id}`);

      const profile = KIND_PROFILES[spec.kind];
      const rng = createRng((this.seed ^ hashString(spec.id)) >>> 0);
      const zone: ZoneRuntime = {
        spec,
        profile,
        info: { id: spec.id, kind: spec.kind, threat: profile.threat },
        rng,
        fixtureIds: [],
        liveFraction: 1,
        flicker: spec.flicker ? this.makeFlicker(spec.flicker, rng) : null,
        state: 'on',
        power: 1,
        mix: 0,
        phase: rng.range(0, Math.PI * 2),
        steady: 1,
        flick: 1,
        drawnMix: 0,
      };

      this.placeFixtures(zone);
      this.addCandidates(zone);
      this.zones.push(zone);
      this.zoneById.set(spec.id, zone);
    }
  }

  private placeFixtures(zone: ZoneRuntime): void {
    const { spec, rng } = zone;
    const b = spec.bounds;
    const inset = spec.inset ?? 1.2;
    const spacing = Math.max(2, spec.fixtureSpacing ?? 6);
    const dead = Math.min(Math.max(spec.deadFraction ?? 0, 0), 0.9);

    const width = b.maxX - b.minX - inset * 2;
    const depth = b.maxZ - b.minZ - inset * 2;
    const positions: { x: number; z: number }[] = [];

    if (width < 0.5 || depth < 0.5) {
      positions.push({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });
    } else {
      const nx = Math.max(1, Math.round(width / spacing));
      const nz = Math.max(1, Math.round(depth / spacing));
      for (let ix = 0; ix < nx; ix += 1) {
        for (let iz = 0; iz < nz; iz += 1) {
          positions.push({
            x: b.minX + inset + ((ix + 0.5) * width) / nx,
            z: b.minZ + inset + ((iz + 0.5) * depth) / nz,
          });
        }
      }
    }

    let live = 0;
    const firstId = this.fixtures.length;
    for (const p of positions) {
      const isDead = rng.chance(dead);
      const flickers = !isDead && spec.flicker ? rng.chance(spec.flicker.fixtureShare) : false;
      if (!isDead) live += 1;
      zone.fixtureIds.push(this.fixtures.length);
      this.fixtures.push({ zone, x: p.x, z: p.z, dead: isDead, flickers });
    }

    // A zone is never fully dead: at least one fixture stays alive so rooms are always navigable.
    if (live === 0) {
      this.fixtures[firstId].dead = false;
      live = 1;
    }
    zone.liveFraction = live / positions.length;
  }

  private addCandidates(zone: ZoneRuntime): void {
    const b = zone.spec.bounds;
    const anchors: readonly LightAnchor[] = zone.spec.anchors?.length
      ? zone.spec.anchors
      : [{ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }];
    // Rooms with many dead fixtures are dimmer overall, which sells the decay without extra lights.
    const base = zone.profile.intensity * (zone.spec.intensityScale ?? 1) * (0.55 + 0.45 * zone.liveFraction);

    for (const a of anchors) {
      this.candidates.push({
        zone,
        x: a.x,
        y: a.y ?? this.practicalY,
        z: a.z,
        baseIntensity: base,
        distance: zone.profile.distance,
        lightColor: zone.profile.light,
      });
      this.scores.push(0);
      this.order.push(this.order.length);
    }
  }

  private writeFixtureMatrices(): void {
    const housingY = this.ceilingY - HOUSING_SIZE.y / 2 - 0.005;
    const tubeY = this.ceilingY - HOUSING_SIZE.y - TUBE_SIZE.y / 2 + 0.01;

    for (let i = 0; i < this.fixtures.length; i += 1) {
      const f = this.fixtures[i];

      this.dummy.position.set(f.x, housingY, f.z);
      this.dummy.scale.set(HOUSING_SIZE.x, HOUSING_SIZE.y, HOUSING_SIZE.z);
      this.dummy.updateMatrix();
      this.housing.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(f.x, tubeY, f.z);
      this.dummy.scale.set(TUBE_SIZE.x, TUBE_SIZE.y, TUBE_SIZE.z);
      this.dummy.updateMatrix();
      this.tubes.setMatrixAt(i, this.dummy.matrix);
    }

    this.housing.instanceMatrix.needsUpdate = true;
    this.tubes.instanceMatrix.needsUpdate = true;
    // Bounding spheres are computed from the instance matrices so frustum culling works for the whole batch.
    this.housing.computeBoundingSphere();
    this.tubes.computeBoundingSphere();
  }

  // ---- Per-frame zone logic ----------------------------------------------------------------------------------

  private makeFlicker(spec: FlickerSpec, rng: Rng): FlickerRuntime {
    return {
      spec,
      mode: 'steady',
      timer: rng.range(spec.steadySeconds[0], spec.steadySeconds[1]),
      tick: 0,
      value: 1,
    };
  }

  /** Seeded stutter state machine. Output is always within [minFactor, 1]. */
  private stepFlicker(zone: ZoneRuntime, dt: number): number {
    const f = zone.flicker;
    if (!f) return 1;
    const { spec } = f;
    const rng = zone.rng;

    f.timer -= dt;

    if (f.mode === 'steady') {
      f.value = 1;
      if (f.timer <= 0) {
        f.mode = 'stutter';
        f.timer = rng.range(spec.stutterSeconds[0], spec.stutterSeconds[1]);
        f.tick = 0;
      }
      return f.value;
    }

    f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = rng.range(0.03, 0.09);
      f.value = rng.chance(0.55)
        ? rng.range(spec.minFactor, Math.max(spec.minFactor, 0.6))
        : rng.range(0.7, 1);
    }
    if (f.timer <= 0) {
      f.mode = 'steady';
      f.timer = rng.range(spec.steadySeconds[0], spec.steadySeconds[1]);
      f.value = 1;
    }
    return Math.min(1, Math.max(spec.minFactor, f.value));
  }

  /** Returns true when the zone's visible output changed enough to repaint its fixtures. */
  private advanceZone(zone: ZoneRuntime, dt: number): boolean {
    const targetPower = zone.state === 'off' ? 0 : zone.state === 'emergency' ? EMERGENCY_POWER : 1;
    const targetMix = zone.state === 'emergency' ? 1 : 0;
    zone.power = approach(zone.power, targetPower, POWER_RATE * dt);
    zone.mix = approach(zone.mix, targetMix, MIX_RATE * dt);

    const flickerValue = zone.state === 'off' ? 1 : this.stepFlicker(zone, dt);
    // Emergency lighting breathes slowly instead of strobing; depth scales with how far the zone is into emergency.
    const pulse = 1 - zone.mix * PULSE_DEPTH * (0.5 - 0.5 * Math.sin(this.elapsed * PULSE_SPEED + zone.phase));
    const steady = zone.power * pulse;
    const flick = steady * flickerValue;

    const changed =
      Math.abs(steady - zone.steady) > EPS ||
      Math.abs(flick - zone.flick) > EPS ||
      Math.abs(zone.mix - zone.drawnMix) > EPS;

    if (changed) {
      zone.steady = steady;
      zone.flick = flick;
      zone.drawnMix = zone.mix;
    }
    return changed;
  }

  private recolor(zone: ZoneRuntime): void {
    this.colorB.setHex(EMERGENCY_TUBE);
    for (const id of zone.fixtureIds) {
      const fixture = this.fixtures[id];
      if (fixture.dead) {
        this.colorA.setHex(DEAD_TUBE);
      } else {
        this.colorA
          .setHex(zone.profile.tube)
          .lerp(this.colorB, zone.mix)
          .multiplyScalar(fixture.flickers ? zone.flick : zone.steady);
      }
      this.tubes.setColorAt(id, this.colorA);
    }
    if (this.tubes.instanceColor) this.tubes.instanceColor.needsUpdate = true;
  }

  // ---- Light pool --------------------------------------------------------------------------------------------

  private reselect(focus: THREE.Vector3): void {
    const n = this.candidates.length;
    const limit = Math.min(this.activeSlots, n);

    for (let i = 0; i < n; i += 1) {
      const c = this.candidates[i];
      const dx = c.x - focus.x;
      const dz = c.z - focus.z;
      const d2 = dx * dx + dz * dz;
      const reach = c.distance + REACH_MARGIN;
      // Unpowered or out-of-reach candidates never take a pool slot.
      this.scores[i] = d2 > reach * reach || c.zone.power < 0.02 ? Infinity : d2;
    }
    this.order.sort(this.byScore);

    let count = 0;
    for (let k = 0; k < limit; k += 1) {
      const idx = this.order[k];
      if (this.scores[idx] === Infinity) break;
      this.desired[count] = idx;
      count += 1;
    }

    for (let j = 0; j < this.slots.length; j += 1) {
      this.used[j] = false;
      this.slots[j].target = NONE;
    }

    // Pass 1: keep slots that already hold a wanted candidate.
    for (let d = 0; d < count; d += 1) {
      this.satisfied[d] = false;
      for (let j = 0; j < this.slots.length; j += 1) {
        if (!this.used[j] && this.slots[j].candidate === this.desired[d]) {
          this.used[j] = true;
          this.slots[j].target = this.desired[d];
          this.satisfied[d] = true;
          break;
        }
      }
    }
    // Pass 2: hand remaining wanted candidates to free slots (they fade out, swap, then fade in).
    for (let d = 0; d < count; d += 1) {
      if (this.satisfied[d]) continue;
      for (let j = 0; j < this.slots.length; j += 1) {
        if (!this.used[j]) {
          this.used[j] = true;
          this.slots[j].target = this.desired[d];
          break;
        }
      }
    }
  }

  /** First frame only: place lights immediately so the opening shot is not a fade-in from black. */
  private snapSlots(): void {
    for (const slot of this.slots) {
      slot.candidate = slot.target;
      slot.fade = slot.candidate === NONE ? 0 : 1;
      if (slot.candidate !== NONE) this.configureSlot(slot);
    }
  }

  private configureSlot(slot: Slot): void {
    const c = this.candidates[slot.candidate];
    slot.light.position.set(c.x, c.y, c.z);
    slot.light.distance = c.distance;
  }

  private updateSlots(dt: number): void {
    for (const slot of this.slots) {
      if (slot.target !== slot.candidate) {
        slot.fade = Math.max(0, slot.fade - FADE_RATE * dt);
        if (slot.fade <= 0.02) {
          slot.candidate = slot.target;
          slot.fade = 0;
          if (slot.candidate !== NONE) this.configureSlot(slot);
        }
      } else if (slot.candidate !== NONE) {
        slot.fade = Math.min(1, slot.fade + FADE_RATE * dt);
      }

      if (slot.candidate === NONE) {
        slot.light.intensity = 0;
        continue;
      }

      const c = this.candidates[slot.candidate];
      const zone = c.zone;
      slot.light.intensity = c.baseIntensity * (zone.flicker ? zone.flick : zone.steady) * slot.fade;
      slot.light.color.setHex(c.lightColor).lerp(this.colorB.setHex(EMERGENCY_LIGHT), zone.mix);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Chapter 1 zone table
// ---------------------------------------------------------------------------------------------------------------

interface ZoneStyle {
  kind: ZoneKind;
  flicker?: FlickerSpec;
  deadFraction?: number;
  intensityScale?: number;
}

/**
 * Room id -> look. Flicker is deliberately limited to the Containment Hall (heavy) and Records Archive (light):
 * the rest of the facility is steady so the player can trust the lighting, and the two unstable rooms stand out.
 *   safe       Recovery Ward         teal, steady
 *   restricted Research Lab, Security cyan, steady
 *   danger     Containment Hall, Exit Hall   emergency red (Hall flickers)
 *   neutral    Atrium (clinical), Mess Hall (warm), Storage and Records (service amber)
 */
const CHAPTER_ONE_STYLE: Readonly<Record<string, ZoneStyle>> = {
  ward: { kind: 'safe', deadFraction: 0.1 },
  lab: { kind: 'restricted', deadFraction: 0.15 },
  security: { kind: 'restricted' },
  hall: { kind: 'emergency', flicker: FLICKER_HEAVY, deadFraction: 0.25 },
  exit: { kind: 'emergency' },
  atrium: { kind: 'clinical' },
  mess: { kind: 'warm', deadFraction: 0.1 },
  storage: { kind: 'service', deadFraction: 0.2 },
  records: { kind: 'service', flicker: FLICKER_LIGHT, deadFraction: 0.3 },
};

/** Builds one lighting zone per room. Unknown room ids fall back to plain clinical lighting. */
export function chapterOneZones(rooms: readonly RoomLike[]): LightZoneSpec[] {
  return rooms.map((room): LightZoneSpec => {
    const style = CHAPTER_ONE_STYLE[room.id] ?? { kind: 'clinical' };
    return {
      id: room.id,
      kind: style.kind,
      bounds: { minX: room.minX, maxX: room.maxX, minZ: room.minZ, maxZ: room.maxZ },
      anchors: [{ x: room.lamp.x, z: room.lamp.z }],
      flicker: style.flicker,
      deadFraction: style.deadFraction,
      intensityScale: style.intensityScale,
    };
  });
}

export function createChapterOneLighting(
  scene: THREE.Scene,
  rooms: readonly RoomLike[],
  options: FacilityLightingOptions = {},
): FacilityLighting {
  return new FacilityLighting(scene, chapterOneZones(rooms), options);
}

// ---------------------------------------------------------------------------------------------------------------
// Atmosphere and flashlight
// ---------------------------------------------------------------------------------------------------------------

export const ATMOSPHERE = { color: 0x0a1016, density: 0.019 } as const;

/** Thin, cool fog: hides the far end of long corridors without turning rooms into soup. Safe to call twice. */
export function applyAtmosphere(scene: THREE.Scene, density: number = ATMOSPHERE.density): void {
  scene.background = new THREE.Color(ATMOSPHERE.color);
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.setHex(ATMOSPHERE.color);
    scene.fog.density = density;
  } else {
    scene.fog = new THREE.FogExp2(ATMOSPHERE.color, density);
  }
}

export const FLASHLIGHT_PROFILE = {
  color: 0xe4f0ff,
  intensity: 48,
  distance: 22,
  angle: Math.PI / 6,
  penumbra: 0.55,
  decay: 1.5,
} as const;

/** Wider, longer cone with a soft edge. No shadow map: the cone is cheap and the world has no shadow receivers. */
export function tuneFlashlight(light: THREE.SpotLight): void {
  light.color.setHex(FLASHLIGHT_PROFILE.color);
  light.intensity = FLASHLIGHT_PROFILE.intensity;
  light.distance = FLASHLIGHT_PROFILE.distance;
  light.angle = FLASHLIGHT_PROFILE.angle;
  light.penumbra = FLASHLIGHT_PROFILE.penumbra;
  light.decay = FLASHLIGHT_PROFILE.decay;
  light.castShadow = false;
}