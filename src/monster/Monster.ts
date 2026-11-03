import * as THREE from 'three';
import { LOCKERS, PATROL_POINTS_XZ, getSolids, type Point2 } from '../world/LevelLayout';
import { NavigationGraph, segmentBlocked } from '../world/NavigationGraph';
import { MonsterNavigation } from './MonsterNavigation';
import { MonsterMemory } from './MonsterMemory';
import { Subject09Model } from './MonsterModel';
import type { MonsterState, SoundEvent } from '../core/types';
import { EventBus } from '../core/EventBus';
import { DisposableStore } from '../core/Disposable';
import { Random } from '../core/Random';
import { WorldManager } from '../world/WorldManager';
import { PlayerController } from '../player/PlayerController';
import { CONFIG } from '../app/GameConfig';
import { CHAPTER_01_AI, type ChapterAIProfile } from '../chapters/ChapterAIProfile';

const SOLIDS = getSolids();

/**
 * Subject 09's brain. It only ever knows what it can see (range, FOV, unobstructed line of sight) or hear (sound
 * events with wall muffling), walks real A* paths, and can never enter the 0.88 m crawlspaces. Adaptation is a few
 * capped, decaying counters in MonsterMemory plus a seeded RNG, so behaviour is deterministic and explainable.
 */
export class Subject09 {
  readonly root: THREE.Group;
  state: MonsterState = 'PATROL';
  private readonly model = new Subject09Model();
  private readonly graph = new NavigationGraph(CONFIG.monster.collisionRadius, SOLIDS);
  private readonly nav = new MonsterNavigation(this.graph, PATROL_POINTS_XZ[0]);
  private readonly memory = new MonsterMemory();
  private readonly rng = new Random(CONFIG.monster.seed);
  private readonly disposables = new DisposableStore();
  private patrolIndex = 1;
  private pause = 0;
  private stateTimer = 0;
  private sightLostFor = 0;
  private blockedFor = 0;
  private cautious = false;
  private yaw = 0;
  private desiredYaw = 0;
  private smoothSpeed = 0;
  private lastKnown: Point2 = { x: 0, z: 0 };
  private searchPoints: Point2[] = [];
  private searchIndex = 0;
  private searchWait = 0;
  private lockerQueue: number[] = [];
  private lockerAnnounced = false;
  private inspecting = 0;
  private chapterProfile: ChapterAIProfile = CHAPTER_01_AI;

  constructor(
    private readonly world: WorldManager,
    private readonly player: PlayerController,
    private readonly events: EventBus,
  ) {
    this.root = this.model.root;
    this.world.scene.add(this.root);
    this.reset();
    this.disposables.add(this.events.on('sound', (s) => this.onSound(s)));
  }

  /** What the HUD may show: distance only, never the monster's knowledge. */
  get position(): THREE.Vector3 { return this.root.position; }

  reset(): void {
    this.state = 'PATROL';
    this.nav.place(PATROL_POINTS_XZ[0].x, PATROL_POINTS_XZ[0].z);
    this.memory.reset();
    this.rng.reseed(CONFIG.monster.seed);
    this.patrolIndex = 1;
    this.pause = 1.5;
    this.stateTimer = 0;
    this.sightLostFor = 0;
    this.blockedFor = 0;
    this.cautious = false;
    this.yaw = 0;
    this.desiredYaw = 0;
    this.smoothSpeed = 0;
    this.searchPoints = [];
    this.searchIndex = 0;
    this.searchWait = 0;
    this.lockerQueue = [];
    this.lockerAnnounced = false;
    this.inspecting = 0;
    this.lastKnown = { x: this.nav.x, z: this.nav.z };
    this.syncRoot();
  }

  /** Switches Subject 09's abilities when the campaign advances to another chapter. */
  setChapterProfile(profile: ChapterAIProfile): void {
    this.chapterProfile = profile;
    this.memory.reset();
    this.setState('PATROL');
  }

  // ---- Hearing --------------------------------------------------------------------------------------------------
  private onSound(s: SoundEvent): void {
    if (!this.chapterProfile.investigateSounds) return;
    const M = CONFIG.monster;
    const dx = s.position.x - this.nav.x;
    const dz = s.position.z - this.nav.z;
    const distance = Math.hypot(dx, dz);
    const open = !segmentBlocked(this.nav.x, this.nav.z, s.position.x, s.position.z, SOLIDS);
    const effective = open ? distance : distance * M.muffleFactor;
    if (effective > s.loudness * M.soundRangeMultiplier * this.chapterProfile.hearingRangeMultiplier) return;
    if (this.state === 'CHASE') return;
    if (s.kind === 'throw') {
      if (this.chapterProfile.adaptiveMemory) this.memory.recordThrow();
      this.cautious = !this.rng.chance(this.memory.throwEffectiveness());
    } else {
      this.cautious = false;
    }
    this.desiredYaw = Math.atan2(-dx, -dz);
    this.investigate({ x: s.position.x, z: s.position.z });
  }

  private investigate(at: Point2): void {
    this.lastKnown = at;
    this.nav.setGoal(at, true);
    this.pause = 0;
    this.setState('INVESTIGATE');
  }

  // ---- State helpers --------------------------------------------------------------------------------------------
  private setState(s: MonsterState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
    this.events.emit('message', this.stateMessage(s));
  }

  private stateMessage(s: MonsterState): string {
    const messages: Record<MonsterState, string> = {
      PATROL: 'You hear slow footsteps somewhere nearby.',
      INVESTIGATE: 'Subject 09 heard something.',
      SEARCH: 'Subject 09 is searching the area.',
      CHASE: 'RUN. Subject 09 has spotted you.',
      RETURN: 'Subject 09 is moving away.',
    };
    return messages[s];
  }

  private beginSearch(): void {
    const M = CONFIG.monster;
    const radius = this.chapterProfile.adaptiveMemory && this.memory.lockerUses > 1 ? M.searchRadiusAfterHiding : M.searchRadius;
    this.searchPoints = [{ ...this.lastKnown }];
    for (let i = 0; i < 3; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(1.2, radius);
      const snapped = this.graph.nearestWalkable(this.lastKnown.x + Math.cos(angle) * r, this.lastKnown.z + Math.sin(angle) * r, 2);
      if (snapped) this.searchPoints.push(snapped);
    }
    this.searchIndex = 0;
    this.searchWait = 0;
    const count = this.chapterProfile.searchHidingSpots
      ? Math.max(this.chapterProfile.adaptiveMemory ? this.memory.lockersToCheck() : 1, this.cautious ? 1 : 0)
      : 0;
    this.lockerQueue = LOCKERS
      .map((l, i) => ({ i, d: Math.hypot(l.x - this.lastKnown.x, l.z - this.lastKnown.z) }))
      .filter((e) => e.d <= M.lockerSearchRange)
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((e) => e.i);
    this.lockerAnnounced = false;
    this.inspecting = 0;
    this.nav.setGoal(this.searchPoints[0], true);
    this.setState('SEARCH');
  }

  private beginReturn(): void {
    let best = this.patrolIndex;
    let bestD = Infinity;
    PATROL_POINTS_XZ.forEach((p, i) => {
      const d = Math.hypot(p.x - this.nav.x, p.z - this.nav.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    this.patrolIndex = best;
    this.cautious = false;
    this.nav.setGoal(PATROL_POINTS_XZ[best], true);
    this.setState('RETURN');
  }

  // ---- Update ---------------------------------------------------------------------------------------------------
  update(dt: number, time: number): void {
    const M = CONFIG.monster;
    this.stateTimer += dt;
    this.memory.decay(dt);
    const p = this.player.position;
    const dx = p.x - this.nav.x;
    const dz = p.z - this.nav.z;
    const dist = Math.hypot(dx, dz);
    const los = dist < 30 && !segmentBlocked(this.nav.x, this.nav.z, p.x, p.z, SOLIDS);
    const facing = dist > 1e-6 ? (-Math.sin(this.yaw) * dx + -Math.cos(this.yaw) * dz) / dist : 1;
    const visible = !this.player.hidden && los;
    const flashlightBonus = this.chapterProfile.detectFlashlight && this.player.flashlightOn
      ? this.chapterProfile.flashlightSightBonus : 0;
    const effectiveSightRange = M.sightRange * this.chapterProfile.sightRangeMultiplier + flashlightBonus;
    const spotted = visible && ((dist < effectiveSightRange && facing > M.sightFacingMin) || dist < M.closeDetectRange);

    if (spotted) {
      this.lastKnown = { x: p.x, z: p.z };
      this.sightLostFor = 0;
      this.blockedFor = 0;
      this.inspecting = 0;
      this.cautious = false;
      this.setState('CHASE');
    }

    let speed: number = M.speeds.patrol;
    switch (this.state) {
      case 'PATROL': {
        speed = M.speeds.patrol * this.chapterProfile.patrolSpeedMultiplier;
        if (this.pause > 0) { this.pause -= dt; break; }
        if (!this.nav.hasGoal) {
          if (!this.nav.setGoal(PATROL_POINTS_XZ[this.patrolIndex]).ok) this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS_XZ.length;
        } else if (this.nav.arrived) {
          this.pause = M.patrolPauseSeconds;
          this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS_XZ.length;
          this.nav.clearGoal();
        }
        break;
      }
      case 'INVESTIGATE': {
        speed = M.speeds.investigate * this.chapterProfile.investigateSpeedMultiplier * (this.cautious ? M.cautiousSpeedFactor : 1);
        if (this.nav.arrived) this.beginSearch();
        else if (this.stateTimer > M.investigateTimeout) this.beginReturn();
        break;
      }
      case 'SEARCH': {
        speed = M.speeds.search * this.chapterProfile.searchSpeedMultiplier * (this.cautious ? M.cautiousSpeedFactor : 1);
        this.updateSearch(dt);
        break;
      }
      case 'CHASE': {
        speed = M.speeds.chase * this.chapterProfile.chaseSpeedMultiplier * (visible && dist < M.lungeRange ? M.lungeSpeedFactor : 1);
        this.updateChase(dt, p, visible, dist, los);
        break;
      }
      case 'RETURN': {
        speed = M.speeds.return * this.chapterProfile.patrolSpeedMultiplier;
        if (this.nav.arrived || this.stateTimer > M.returnTimeout) {
          this.nav.clearGoal();
          this.pause = 0.6;
          this.setState('PATROL');
        }
        break;
      }
    }

    const moved = this.inspecting > 0 || this.pause > 0 ? 0 : this.nav.update(dt, speed);
    if (moved > 0) this.desiredYaw = this.nav.heading;
    this.smoothSpeed += (moved / Math.max(dt, 1e-4) - this.smoothSpeed) * (1 - Math.exp(-dt * 8));
    let diff = this.desiredYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt * M.turnRate));
    this.syncRoot();
    this.model.update(dt, time, this.state, this.smoothSpeed, this.state !== 'PATROL');
  }

  private updateChase(dt: number, p: THREE.Vector3, visible: boolean, dist: number, los: boolean): void {
    const M = CONFIG.monster;
    if (this.player.hidden) {
      // Later chapters let Subject 09 inspect hiding places and remember repeated use.
      if (this.chapterProfile.searchHidingSpots && this.chapterProfile.adaptiveMemory) this.memory.recordLockerUse();
      this.lastKnown = { x: p.x, z: p.z };
      this.beginSearch();
      return;
    }
    if (visible) {
      this.sightLostFor = 0;
      this.lastKnown = { x: p.x, z: p.z };
    } else {
      this.sightLostFor += dt;
    }
    if (this.sightLostFor > M.chaseLostSightSeconds && this.nav.arrived) {
      this.beginSearch();
      return;
    }
    const goal = this.nav.setGoal(this.lastKnown, true);
    if (this.nav.arrived && visible && dist > 1.6) {
      // Standing at the nearest reachable spot while the player is somewhere it cannot enter (crawlspace).
      this.blockedFor += dt;
      this.desiredYaw = Math.atan2(-(p.x - this.nav.x), -(p.z - this.nav.z));
      if (this.blockedFor > M.chaseBlockedSeconds) {
        this.events.emit('message', 'Subject 09 cannot fit through there. It is waiting.');
        this.blockedFor = 0;
        this.beginSearch();
        return;
      }
    } else if (goal.ok) {
      this.blockedFor = 0;
    }
    if (dist < M.catchDistance && los) this.events.emit('caught', undefined);
  }

  private updateSearch(dt: number): void {
    const M = CONFIG.monster;
    if (this.stateTimer > M.searchTimeout + this.chapterProfile.extraSearchSeconds) { this.beginReturn(); return; }
    if (this.inspecting > 0) {
      this.inspecting -= dt;
      if (this.inspecting <= 0) this.finishInspection();
      return;
    }
    if (!this.nav.arrived) return;
    if (this.searchWait > 0) { this.searchWait -= dt; return; }
    if (this.searchIndex < this.searchPoints.length) {
      this.searchIndex++;
      this.searchWait = M.searchPointWaitSeconds;
      const next = this.searchPoints[this.searchIndex];
      if (next) this.nav.setGoal(next, true);
      return;
    }
    const lockerIndex = this.lockerQueue[0];
    if (lockerIndex === undefined) { this.beginReturn(); return; }
    const locker = LOCKERS[lockerIndex];
    if (!this.lockerAnnounced) {
      this.lockerAnnounced = true;
      this.events.emit('message', 'Subject 09 is checking the lockers. Move if you can.');
    }
    if (Math.hypot(locker.x - this.nav.x, locker.z - this.nav.z) <= M.lockerReachDistance) {
      this.inspecting = M.lockerInspectSeconds;
      this.desiredYaw = Math.atan2(-(locker.x - this.nav.x), -(locker.z - this.nav.z));
    } else if (!this.nav.setGoal(locker, true).ok) {
      this.lockerQueue.shift();
    }
  }

  private finishInspection(): void {
    const lockerIndex = this.lockerQueue.shift();
    if (lockerIndex === undefined) return;
    const occupied = this.player.hidden && this.player.currentHidingIndex === lockerIndex;
    const discoveryChance = this.chapterProfile.adaptiveMemory ? this.memory.lockerDiscoveryChance() : 0.3;
    if (occupied && this.rng.chance(discoveryChance)) {
      this.lastKnown = { x: this.player.position.x, z: this.player.position.z };
      this.player.ejectFromHiding();
      this.events.emit('message', 'The locker door is torn open!');
      this.sightLostFor = 0;
      this.setState('CHASE');
    } else if (occupied) {
      this.events.emit('message', 'It rattled your locker… and moved on. Stay still.');
    }
  }

  private syncRoot(): void {
    this.root.position.set(this.nav.x, 0, this.nav.z);
    this.root.rotation.y = this.yaw;
  }

  dispose(): void {
    this.disposables.dispose();
    this.world.scene.remove(this.root);
    this.model.dispose();
  }
}
