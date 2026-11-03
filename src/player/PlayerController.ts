
import * as THREE from 'three';
import { WorldManager } from '../world/WorldManager';
import { EventBus } from '../core/EventBus';
import { DisposableStore } from '../core/Disposable';
import { CONFIG } from '../app/GameConfig';
import { PLAYER_START, WORLD_BOUNDS } from '../world/LevelLayout';
import type {
  Interactable,
  PuzzleActionResult,
  PuzzleFailureReason,
  PuzzleObjectId,
  PuzzlePromptSpec,
} from '../core/types';
import {
  PUZZLE_INTERACT_DISTANCE,
  PUZZLE_NOISE,
} from '../core/types';

interface Orb {
  mesh: THREE.Mesh;
  timer: number;
}

/**
 * Narrow surface the puzzle system must satisfy.
 */
export interface PuzzleHost {
  getPrompt(objectId: PuzzleObjectId): PuzzlePromptSpec | null;
  interact(objectId: PuzzleObjectId): PuzzleActionResult;
  canCombine(): boolean;
  combineFragments(): PuzzleActionResult;
}

const PUZZLE_COOLDOWN = 0.3;
const PUZZLE_FACING_DOT = 0.55;

/**
 * Mouse sensitivity multiplier.
 * Lower value = slower camera rotation.
 */
const LOOK_SENSITIVITY_MULTIPLIER = 2.8;

/**
 * Protects camera rotation from unusually large mouse movement spikes.
 */
const MAX_MOUSE_DELTA = 500;

const FAILURE_TEXT: Record<PuzzleFailureReason, string> = {
  out_of_range: 'Too far away.',
  already_open: 'It is already open.',
  already_searched: 'Already searched.',
  missing_item: 'You need something else first.',
  wrong_item: 'That does not fit.',
  not_ready: 'Not yet.',
  wrong_password: 'Wrong password.',
  already_unlocked: 'Already unlocked.',
  disabled: 'Nothing happens.',
};

export class PlayerController {
  readonly position = new THREE.Vector3(
    PLAYER_START.x,
    0,
    PLAYER_START.z,
  );

  readonly camera = new THREE.PerspectiveCamera(
    CONFIG.player.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.player.near,
    CONFIG.player.far,
  );

  readonly keys = new Set<string>();

  yaw: number = PLAYER_START.yaw;
  pitch = 0;

  crouching = false;
  sprinting = false;
  hidden = false;

  currentHidingIndex = -1;
  hasKeycard = false;
  flashlightOn = true;

  /** Polled by the HUD; null when nothing is focused. */
  promptText: string | null = null;

  private lastFootstep = -999;
  private bobTime = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly orbs = new Set<Orb>();
  private readonly disposables = new DisposableStore();

  private puzzleHost: PuzzleHost | null;
  private lastPuzzleAction = -999;
  private focusedPuzzle: Interactable | null = null;

  private readonly lookDir = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();

  constructor(
    private readonly world: WorldManager,
    private readonly events: EventBus,
    private readonly canvas: HTMLCanvasElement,
    puzzleHost?: PuzzleHost,
  ) {
    this.puzzleHost = puzzleHost ?? null;

    this.camera.position.set(
      this.position.x,
      1.68,
      this.position.z,
    );

    this.camera.rotation.order = 'YXZ';

    this.disposables.addListener(
      window,
      'keydown',
      this.keyDown as EventListener,
    );

    this.disposables.addListener(
      window,
      'keyup',
      this.keyUp as EventListener,
    );

    this.disposables.addListener(
      window,
      'mousemove',
      this.mouseMove as EventListener,
    );

    this.disposables.addListener(
      this.canvas,
      'click',
      this.requestLock,
    );

    this.disposables.addListener(
      document,
      'pointerlockchange',
      this.onPointerLockChange,
    );

    this.disposables.addListener(
      document,
      'pointerlockerror',
      this.onPointerLockError,
    );
  }

  /** Late binding for the puzzle system. */
  setPuzzleHost(host: PuzzleHost | null): void {
    this.puzzleHost = host;
  }

  private say(message: string): void {
    this.events.emit('message', message);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private keyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();

    this.keys.add(k);

    if (
      [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)
    ) {
      e.preventDefault();
    }

    if (k === 'f' && !e.repeat) {
      this.tryCombineFragments();
    }
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /**
   * Mouse-look works ONLY while pointer lock is active.
   *
   * This prevents ordinary cursor movement over the canvas
   * from unexpectedly rotating the camera.
   */
  private mouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) {
      return;
    }

    const deltaX = THREE.MathUtils.clamp(
      e.movementX,
      -MAX_MOUSE_DELTA,
      MAX_MOUSE_DELTA,
    );

    const deltaY = THREE.MathUtils.clamp(
      e.movementY,
      -MAX_MOUSE_DELTA,
      MAX_MOUSE_DELTA,
    );

    this.applyMouseLook(deltaX, deltaY);
  };

  private applyMouseLook(deltaX: number, deltaY: number): void {
    const sensitivity = LOOK_SENSITIVITY_MULTIPLIER;

    this.yaw -=
      deltaX *
      CONFIG.player.lookSensitivityYaw *
      sensitivity;

    // Keep yaw numerically stable while allowing unlimited 360-degree turns.
    this.yaw = THREE.MathUtils.euclideanModulo(
      this.yaw + Math.PI,
      Math.PI * 2,
    ) - Math.PI;

    this.pitch -=
      deltaY *
      CONFIG.player.lookSensitivityPitch *
      sensitivity;

    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -CONFIG.player.pitchLimit,
      CONFIG.player.pitchLimit,
    );
  }

  private requestLock = (): void => {
    if (this.hidden) return;

    if (document.pointerLockElement === this.canvas) {
      return;
    }

    try {
      const result = this.canvas.requestPointerLock?.() as unknown;

      if (result instanceof Promise) {
        result.catch((error) => {
          console.warn(
            '[PlayerController] Pointer lock unavailable.',
            error,
          );
        });
      }
    } catch (error) {
      console.warn(
        '[PlayerController] Pointer lock request failed.',
        error,
      );
    }
  };

  private onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.canvas) {
      this.keys.clear();
    }
  };

  private onPointerLockError = (): void => {
    console.warn(
      '[PlayerController] Browser could not capture the mouse.',
    );
  };

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    this.position.set(
      PLAYER_START.x,
      0,
      PLAYER_START.z,
    );

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

    this.promptText = null;
    this.focusedPuzzle = null;
    this.lastPuzzleAction = -999;

    this.keys.clear();
    this.clearOrbs();

    this.camera.position.set(
      this.position.x,
      1.68,
      this.position.z,
    );

    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      0,
      'YXZ',
    );
  }

  // ---------------------------------------------------------------------------
  // Player update
  // ---------------------------------------------------------------------------

  update(dt: number, time: number, paused: boolean): void {
    if (paused) return;

    const P = CONFIG.player;

    this.crouching =
      this.keys.has('control') ||
      this.keys.has('c');

    this.sprinting =
      this.keys.has('shift') &&
      !this.crouching &&
      !this.hidden;

    if (!this.hidden) {
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );

      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      );

      const move = new THREE.Vector3();

      if (this.keys.has('w')) move.add(forward);
      if (this.keys.has('s')) move.sub(forward);
      if (this.keys.has('d')) move.add(right);
      if (this.keys.has('a')) move.sub(right);

      const moving = move.lengthSq() > 0;

      if (moving) {
        move.normalize();

        const speed = this.sprinting
          ? P.sprintSpeed
          : this.crouching
            ? P.crouchSpeed
            : P.walkSpeed;

        const next = this.position
          .clone()
          .addScaledVector(move, speed * dt);

        // X-axis collision.
        const tryX = this.position.clone();
        tryX.x = next.x;

        if (!this.world.isBlocked(tryX)) {
          this.position.x = next.x;
        }

        // Z-axis collision.
        const tryZ = this.position.clone();
        tryZ.z = next.z;

        if (!this.world.isBlocked(tryZ)) {
          this.position.z = next.z;
        }

        // Walking camera bob.
        this.bobTime += dt * (
          this.sprinting
            ? P.bobSpeedSprint
            : P.bobSpeedWalk
        );

        // Footstep sounds.
        const interval = this.sprinting
          ? P.footstepInterval.sprint
          : this.crouching
            ? P.footstepInterval.crouch
            : P.footstepInterval.walk;

        if (time - this.lastFootstep > interval) {
          this.lastFootstep = time;

          this.events.emit('sound', {
            position: this.position.clone(),
            loudness: this.getNoiseLevel(),
            kind: 'footstep',
            time,
          });
        }
      }

      this.camera.position.set(
        this.position.x,
        (
          this.crouching
            ? P.crouchEyeHeight
            : P.eyeHeight
        ) +
          (
            moving
              ? Math.sin(this.bobTime) * P.bobAmplitude
              : 0
          ),
        this.position.z,
      );
    } else if (this.currentHidingIndex >= 0) {
      const spot =
        this.world.hidingSpots[this.currentHidingIndex];

      if (spot) {
        this.camera.position.set(
          spot.position.x,
          P.hidingEyeHeight,
          spot.position.z,
        );
      }
    }

    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      0,
      'YXZ',
    );

    this.refreshPuzzleFocus();
  }

  // ---------------------------------------------------------------------------
  // Puzzle focus
  // ---------------------------------------------------------------------------

  private findFocusedPuzzle(): Interactable | null {
    const maxRange = Math.min(
      CONFIG.player.interact.nearbyRange,
      PUZZLE_INTERACT_DISTANCE,
    );

    this.camera.getWorldDirection(this.lookDir);

    let best: Interactable | null = null;
    let bestDist = maxRange;

    for (const item of this.world.interactables) {
      if (!item.active || !item.objectId) continue;

      const dist = item.position.distanceTo(this.position);

      if (dist > bestDist) continue;

      this.toTarget
        .copy(item.position)
        .sub(this.camera.position)
        .normalize();

      if (this.toTarget.dot(this.lookDir) < PUZZLE_FACING_DOT) {
        continue;
      }

      best = item;
      bestDist = dist;
    }

    return best;
  }

  private refreshPuzzleFocus(): void {
    if (this.hidden || !this.puzzleHost) {
      this.focusedPuzzle = null;
      this.promptText = null;
      return;
    }

    const focus = this.findFocusedPuzzle();

    this.focusedPuzzle = focus;

    if (!focus || !focus.objectId) {
      this.promptText = null;
      return;
    }

    const spec: PuzzlePromptSpec | null =
      this.puzzleHost.getPrompt(focus.objectId);

    this.promptText = spec ? spec.prompt : null;
  }

  private emitPuzzleNoise(kind: Interactable['kind']): void {
    const loudness = PUZZLE_NOISE[kind] ?? 0.3;

    if (loudness <= 0) return;

    this.events.emit('sound', {
      position: this.position.clone(),
      loudness,
      kind:
        kind === 'drawer' || kind === 'keyed_door'
          ? 'door'
          : 'impact',
      time: performance.now() / 1000,
    });
  }

  private reportFailure(reason: PuzzleFailureReason): void {
    this.say(
      FAILURE_TEXT[reason] ?? 'Nothing happens.',
    );
  }

  /** Returns true when the generic handler should be skipped. */
  private tryPuzzleInteraction(): boolean {
    const focus = this.focusedPuzzle;

    if (!focus || !focus.objectId || !this.puzzleHost) {
      return false;
    }

    const now = performance.now() / 1000;

    if (now - this.lastPuzzleAction < PUZZLE_COOLDOWN) {
      return true;
    }

    this.lastPuzzleAction = now;

    const result = this.puzzleHost.interact(focus.objectId);

    if (!result.ok) {
      this.reportFailure(result.reason);
      return true;
    }

    this.emitPuzzleNoise(focus.kind);

    if (focus.kind === 'keycard') {
      this.hasKeycard = true;
    }

    if (focus.kind === 'note' && focus.text) {
      this.events.emit('paper', {
        text: focus.text,
        label: focus.label,
      });
    }

    this.refreshPuzzleFocus();

    return true;
  }

  private tryCombineFragments(): void {
    if (!this.puzzleHost || this.hidden) return;

    if (!this.puzzleHost.canCombine()) {
      this.say('You do not have enough fragments.');
      return;
    }

    const now = performance.now() / 1000;

    if (now - this.lastPuzzleAction < PUZZLE_COOLDOWN) {
      return;
    }

    this.lastPuzzleAction = now;

    const result = this.puzzleHost.combineFragments();

    if (!result.ok) {
      this.reportFailure(result.reason);
      return;
    }

    this.emitPuzzleNoise('box');
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  interact(): void {
    const R = CONFIG.player.interact;

    if (this.hidden) {
      const spot =
        this.world.hidingSpots[this.currentHidingIndex];

      if (spot) {
        spot.occupied = false;
      }

      this.hidden = false;
      this.currentHidingIndex = -1;

      this.say('You leave the hiding place.');

      document.exitPointerLock?.();

      return;
    }

    // Puzzle objects take priority.
    if (this.tryPuzzleInteraction()) {
      return;
    }

    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3();

    this.camera.getWorldDirection(direction);

    this.raycaster.set(origin, direction);
    this.raycaster.far = R.rayRange;

    const hits = this.raycaster.intersectObjects(
      this.world.scene.children,
      true,
    );

    const hit = hits.find((h) =>
      h.object.userData.exit ||
      this.world.interactables.some(
        (i) =>
          i.mesh === h.object ||
          i.mesh === h.object.parent,
      ),
    );

    const nearby = this.world.interactables
      .filter(
        (i) =>
          i.active &&
          i.position.distanceTo(this.position) < R.nearbyRange,
      )
      .sort(
        (a, b) =>
          a.position.distanceTo(this.position) -
          b.position.distanceTo(this.position),
      )[0];

    if (
      nearby &&
      (
        hit ||
        nearby.position.distanceTo(this.position) < R.closeRange
      )
    ) {
      // Keycard.
      if (nearby.kind === 'keycard') {
        this.hasKeycard = true;

        nearby.active = false;
        nearby.mesh.visible = false;

        this.say(
          'Security keycard acquired. The exit can now be unlocked.',
        );

        this.events.emit('sound', {
          position: this.position.clone(),
          loudness: 3,
          kind: 'door',
          time: performance.now() / 1000,
        });

        return;
      }

      // Notes and readable papers.
      if (nearby.kind === 'note') {
        if (nearby.category === 'paper') {
          nearby.active = false;
          nearby.mesh.visible = false;

          this.events.emit('paper', {
            text: nearby.text ?? 'The page is blank.',
            label: nearby.label,
          });
        } else {
          this.say(nearby.text ?? nearby.label);
        }

        return;
      }

      // Hiding places.
      if (nearby.kind === 'hiding') {
        const spot = this.world.hidingSpots.findIndex(
          (s) => s.mesh === nearby.mesh,
        );

        if (spot >= 0) {
          this.hidden = true;
          this.currentHidingIndex = spot;

          nearby.active = true;
          this.world.hidingSpots[spot].occupied = true;

          this.say(
            'You are hidden. Stay quiet; press E to leave.',
          );

          document.exitPointerLock?.();
        }

        return;
      }
    }

    // Exit interaction.
    if (
      this.position.distanceTo(this.world.exitPosition) <
      R.exitRange
    ) {
      if (this.hasKeycard) {
        this.events.emit('complete', undefined);
      } else {
        this.say(
          'Access denied. A security keycard is required.',
        );
      }

      return;
    }

    this.say('Nothing to interact with here.');
  }

  // ---------------------------------------------------------------------------
  // Hiding
  // ---------------------------------------------------------------------------

  ejectFromHiding(): void {
    if (!this.hidden) return;

    const spot =
      this.world.hidingSpots[this.currentHidingIndex];

    if (spot) {
      spot.occupied = false;
    }

    this.hidden = false;
    this.currentHidingIndex = -1;
  }

  // ---------------------------------------------------------------------------
  // Distraction
  // ---------------------------------------------------------------------------

  throwDistraction(): void {
    const T = CONFIG.player.throwDistraction;

    if (this.hidden) {
      this.say(
        'You cannot throw a distraction while hidden.',
      );

      return;
    }

    const direction = new THREE.Vector3();

    this.camera.getWorldDirection(direction);
    direction.y = 0;

    if (direction.lengthSq() < 1e-6) {
      direction.set(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );
    }

    direction.normalize();

    const pos = this.position.clone();

    // Find a safe landing spot.
    for (
      let d = T.distance;
      d >= 0.5;
      d -= 0.25
    ) {
      const candidate = this.position
        .clone()
        .addScaledVector(direction, d);

      if (!this.world.isBlocked(candidate, 0.12)) {
        pos.copy(candidate);
        break;
      }
    }

    pos.y = 0;

    pos.x = THREE.MathUtils.clamp(
      pos.x,
      WORLD_BOUNDS.minX + T.clampMargin,
      WORLD_BOUNDS.maxX - T.clampMargin,
    );

    pos.z = THREE.MathUtils.clamp(
      pos.z,
      WORLD_BOUNDS.minZ + T.clampMargin,
      WORLD_BOUNDS.maxZ - T.clampMargin,
    );

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xc8a26b,
        emissive: 0x6c3e15,
      }),
    );

    mesh.position.set(pos.x, 0.2, pos.z);

    this.world.scene.add(mesh);

    const orb: Orb = {
      mesh,
      timer: 0,
    };

    orb.timer = window.setTimeout(
      () => this.removeOrb(orb),
      T.orbLifetimeMs,
    );

    this.orbs.add(orb);

    this.events.emit('sound', {
      position: pos,
      loudness: T.loudness,
      kind: 'throw',
      time: performance.now() / 1000,
    });

    this.say(
      'Object thrown. Subject 09 may investigate the impact.',
    );
  }

  private removeOrb(orb: Orb): void {
    window.clearTimeout(orb.timer);

    this.orbs.delete(orb);

    this.world.scene.remove(orb.mesh);

    orb.mesh.geometry.dispose();

    (orb.mesh.material as THREE.Material).dispose();
  }

  private clearOrbs(): void {
    for (const orb of [...this.orbs]) {
      this.removeOrb(orb);
    }
  }

  // ---------------------------------------------------------------------------
  // Flashlight
  // ---------------------------------------------------------------------------

  toggleFlashlight(light: THREE.SpotLight): void {
    this.flashlightOn = !this.flashlightOn;

    light.visible = this.flashlightOn;

    this.say(
      this.flashlightOn
        ? 'Flashlight on.'
        : 'Flashlight off.',
    );
  }

  // ---------------------------------------------------------------------------
  // Noise
  // ---------------------------------------------------------------------------

  getNoiseLevel(): number {
    const N = CONFIG.player.noise;

    return this.hidden
      ? 0
      : this.sprinting
        ? N.sprint
        : this.crouching
          ? N.crouch
          : N.walk;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.clearOrbs();

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }

    this.disposables.dispose();

    this.puzzleHost = null;
    this.focusedPuzzle = null;
    this.promptText = null;

    this.keys.clear();
  }
}
