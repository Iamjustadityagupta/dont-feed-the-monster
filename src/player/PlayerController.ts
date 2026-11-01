import * as THREE from 'three';
import { WorldManager } from '../world/WorldManager';
import { EventBus } from '../core/EventBus';
import { DisposableStore } from '../core/Disposable';
import { CONFIG } from '../app/GameConfig';
import { PLAYER_START, WORLD_BOUNDS } from '../world/LevelLayout';

interface Orb { mesh: THREE.Mesh; timer: number }

export class PlayerController {
  readonly position = new THREE.Vector3(PLAYER_START.x, 0, PLAYER_START.z);
  readonly camera = new THREE.PerspectiveCamera(CONFIG.player.fov, window.innerWidth / window.innerHeight, CONFIG.player.near, CONFIG.player.far);
  readonly keys = new Set<string>();
  yaw: number = PLAYER_START.yaw;
  pitch = 0;
  crouching = false;
  sprinting = false;
  hidden = false;
  currentHidingIndex = -1;
  hasKeycard = false;
  flashlightOn = true;
  private lastFootstep = -999;
  private bobTime = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly orbs = new Set<Orb>();
  private readonly disposables = new DisposableStore();

  constructor(
    private readonly world: WorldManager,
    private readonly events: EventBus,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.camera.position.set(this.position.x, 1.68, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.disposables.addListener(window, 'keydown', this.keyDown as EventListener);
    this.disposables.addListener(window, 'keyup', this.keyUp as EventListener);
    this.disposables.addListener(window, 'mousemove', this.mouseMove as EventListener);
    this.disposables.addListener(canvas, 'click', this.requestLock);
  }

  private say(message: string): void {
    this.events.emit('message', message);
  }

  private keyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  };
  private keyUp = (e: KeyboardEvent): void => { this.keys.delete(e.key.toLowerCase()); };
  private mouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * CONFIG.player.lookSensitivityYaw;
    this.pitch -= e.movementY * CONFIG.player.lookSensitivityPitch;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -CONFIG.player.pitchLimit, CONFIG.player.pitchLimit);
  };
  private requestLock = (): void => {
    if (!this.hidden && !document.pointerLockElement) this.canvas.requestPointerLock?.();
  };

  /** Back to the chapter start: position, view, inventory, hiding state, held keys and any thrown orbs. */
  reset(): void {
    this.position.set(PLAYER_START.x, 0, PLAYER_START.z);
    this.yaw = PLAYER_START.yaw;
    this.pitch = 0;
    this.hidden = false;
    this.currentHidingIndex = -1;
    this.hasKeycard = false;
    this.crouching = false;
    this.sprinting = false;
    this.flashlightOn = true;
    this.lastFootstep = -999;
    this.bobTime = 0;
    this.keys.clear();
    this.clearOrbs();
    this.camera.position.set(this.position.x, 1.68, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt: number, time: number, paused: boolean): void {
    if (paused) return;
    const P = CONFIG.player;
    this.sprinting = this.keys.has('shift') && !this.crouching && !this.hidden;
    this.crouching = this.keys.has('control') || this.keys.has('c');
    if (!this.hidden) {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();
      if (this.keys.has('w')) move.add(forward);
      if (this.keys.has('s')) move.sub(forward);
      if (this.keys.has('d')) move.add(right);
      if (this.keys.has('a')) move.sub(right);
      const moving = move.lengthSq() > 0;
      if (moving) {
        move.normalize();
        const speed = this.sprinting ? P.sprintSpeed : this.crouching ? P.crouchSpeed : P.walkSpeed;
        const next = this.position.clone().addScaledVector(move, speed * dt);
        const tryX = this.position.clone();
        tryX.x = next.x;
        if (!this.world.isBlocked(tryX)) this.position.x = next.x;
        const tryZ = this.position.clone();
        tryZ.z = next.z;
        if (!this.world.isBlocked(tryZ)) this.position.z = next.z;
        this.bobTime += dt * (this.sprinting ? P.bobSpeedSprint : P.bobSpeedWalk);
        const interval = this.sprinting ? P.footstepInterval.sprint : this.crouching ? P.footstepInterval.crouch : P.footstepInterval.walk;
        if (time - this.lastFootstep > interval) {
          this.lastFootstep = time;
          this.events.emit('sound', { position: this.position.clone(), loudness: this.getNoiseLevel(), kind: 'footstep', time });
        }
      }
      this.camera.position.set(
        this.position.x,
        (this.crouching ? P.crouchEyeHeight : P.eyeHeight) + (moving ? Math.sin(this.bobTime) * P.bobAmplitude : 0),
        this.position.z,
      );
    } else if (this.currentHidingIndex >= 0) {
      const p = this.world.hidingSpots[this.currentHidingIndex].position;
      this.camera.position.set(p.x, P.hidingEyeHeight, p.z);
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  interact(): void {
    const R = CONFIG.player.interact;
    if (this.hidden) {
      const spot = this.world.hidingSpots[this.currentHidingIndex];
      if (spot) spot.occupied = false;
      this.hidden = false;
      this.currentHidingIndex = -1;
      this.say('You leave the hiding place.');
      document.exitPointerLock?.();
      return;
    }
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.raycaster.set(origin, direction);
    this.raycaster.far = R.rayRange;
    const hits = this.raycaster.intersectObjects(this.world.scene.children, true);
    const hit = hits.find((h) => h.object.userData.exit || this.world.interactables.some((i) => i.mesh === h.object || i.mesh === h.object.parent));
    const nearby = this.world.interactables
      .filter((i) => i.active && i.position.distanceTo(this.position) < R.nearbyRange)
      .sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position))[0];
    if (nearby && (hit || nearby.position.distanceTo(this.position) < R.closeRange)) {
      if (nearby.kind === 'keycard') {
        this.hasKeycard = true;
        nearby.active = false;
        nearby.mesh.visible = false;
        this.say('Security keycard acquired. The exit can now be unlocked.');
        this.events.emit('sound', { position: this.position.clone(), loudness: 3, kind: 'door', time: performance.now() / 1000 });
        return;
      }
      if (nearby.kind === 'note') {
        if (nearby.category === 'paper') {
          // PAPER: the sheet vanishes from the world, then the A4 paper UI shows its text (see GameController).
          nearby.active = false;
          nearby.mesh.visible = false;
          this.events.emit('paper', { text: nearby.text ?? 'The page is blank.', label: nearby.label });
        } else {
          // SOLID (e.g. a terminal): stays in the world, only prints its line through the dialog engine.
          this.say(nearby.text ?? nearby.label);
        }
        return;
      }
      if (nearby.kind === 'hiding') {
        const spot = this.world.hidingSpots.findIndex((s) => s.mesh === nearby.mesh);
        if (spot >= 0) {
          this.hidden = true;
          this.currentHidingIndex = spot;
          nearby.active = true;
          this.world.hidingSpots[spot].occupied = true;
          this.say('You are hidden. Stay quiet; press E to leave.');
          document.exitPointerLock?.();
        }
        return;
      }
    }
    if (this.position.distanceTo(this.world.exitPosition) < R.exitRange) {
      if (this.hasKeycard) this.events.emit('complete', undefined);
      else this.say('Access denied. A security keycard is required.');
      return;
    }
    this.say('Nothing to interact with here.');
  }

  /** Used by Subject 09 when it tears an occupied locker open. */
  ejectFromHiding(): void {
    if (!this.hidden) return;
    const spot = this.world.hidingSpots[this.currentHidingIndex];
    if (spot) spot.occupied = false;
    this.hidden = false;
    this.currentHidingIndex = -1;
  }

  throwDistraction(): void {
    const T = CONFIG.player.throwDistraction;
    if (this.hidden) {
      this.say('You cannot throw a distraction while hidden.');
      return;
    }
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < 1e-6) direction.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    direction.normalize();
    // Pull the landing spot back until it is in open floor, so a throw never lands inside a wall or another room.
    const pos = this.position.clone();
    for (let d = T.distance; d >= 0.5; d -= 0.25) {
      const candidate = this.position.clone().addScaledVector(direction, d);
      if (!this.world.isBlocked(candidate, 0.12)) { pos.copy(candidate); break; }
    }
    pos.y = 0;
    pos.x = THREE.MathUtils.clamp(pos.x, WORLD_BOUNDS.minX + T.clampMargin, WORLD_BOUNDS.maxX - T.clampMargin);
    pos.z = THREE.MathUtils.clamp(pos.z, WORLD_BOUNDS.minZ + T.clampMargin, WORLD_BOUNDS.maxZ - T.clampMargin);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8a26b, emissive: 0x6c3e15 }),
    );
    mesh.position.set(pos.x, 0.2, pos.z);
    this.world.scene.add(mesh);
    const orb: Orb = { mesh, timer: 0 };
    orb.timer = window.setTimeout(() => this.removeOrb(orb), T.orbLifetimeMs);
    this.orbs.add(orb);
    this.events.emit('sound', { position: pos, loudness: T.loudness, kind: 'throw', time: performance.now() / 1000 });
    this.say('Object thrown. Subject 09 may investigate the impact.');
  }

  private removeOrb(orb: Orb): void {
    window.clearTimeout(orb.timer);
    this.orbs.delete(orb);
    this.world.scene.remove(orb.mesh);
    orb.mesh.geometry.dispose();
    (orb.mesh.material as THREE.Material).dispose();
  }

  private clearOrbs(): void {
    for (const orb of [...this.orbs]) this.removeOrb(orb);
  }

  toggleFlashlight(light: THREE.SpotLight): void {
    this.flashlightOn = !this.flashlightOn;
    light.visible = this.flashlightOn;
    this.say(this.flashlightOn ? 'Flashlight on.' : 'Flashlight off.');
  }

  getNoiseLevel(): number {
    const N = CONFIG.player.noise;
    return this.hidden ? 0 : this.sprinting ? N.sprint : this.crouching ? N.crouch : N.walk;
  }

  dispose(): void {
    this.clearOrbs();
    this.disposables.dispose();
  }
}
