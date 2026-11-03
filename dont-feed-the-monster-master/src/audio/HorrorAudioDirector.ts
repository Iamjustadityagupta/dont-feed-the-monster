
import * as THREE from 'three';

import { AudioBuses } from './AudioBuses';
import { SoundBank } from './SoundManifest';
import { ProceduralHorrorSynth } from '../rendering/AudioManager';
import type { SoundEventSystem } from '../gameplay/SoundEventSystem';

import type { SoundId } from './SoundManifest';
import type {
  HorrorGameHooks,
  MonsterState
} from '../integration/GameHooks';

interface Voice {
  audio: THREE.Audio;
  filter: BiquadFilterNode | null;
  level: number;
  started: boolean;
  nextFire: number;
}

const OCCLUDED_HZ = 620;
const OPEN_HZ = 16000;
const RAY_INTERVAL = 0.15;

/**
 * Shapes the raw [0..1] distance ratio into a tension curve: quiet and
 * almost flat while the monster is still far off, then a sharp climb once
 * it's genuinely close. This is the "calm... calm... CLOSE" feel Granny /
 * Kamla-style stalker audio relies on, instead of a flat linear fade.
 */
const TENSION_CURVE_EXPONENT = 1.7;

/** Radius (world units) around the monster that a loud nearby noise will make it audibly "react" to. */
const REACTIVE_HEARING_RADIUS = 11;
const REACTIVE_COOLDOWN = 2.2;

export class HorrorAudioDirector {
  private readonly voices = new Map<SoundId, Voice>();

  private readonly raycaster = new THREE.Raycaster();

  private readonly monsterPos = new THREE.Vector3();
  private readonly playerPos = new THREE.Vector3();

  private rayTimer = 0;
  private occluded = false;
  private danger = 0;
  private stateGain = 1;

  private state: MonsterState = 'idle';
  private enabled = true;
  private unsubscribeCaught: (() => void) | null = null;
  private reactiveCooldown = 0;
  private readonly fallback: ProceduralHorrorSynth | null;

  constructor(
    private readonly listener: THREE.AudioListener,
    private readonly bus: AudioBuses,
    private readonly bank: SoundBank,
    private readonly hooks: HorrorGameHooks,
    private readonly soundEvents?: SoundEventSystem
  ) {
    this.raycaster.far = 40;

    try {
      this.fallback = new ProceduralHorrorSynth(this.listener.context);
    } catch {
      this.fallback = null;
    }

    // Optional: some integrations expose a 'caught' hook so the scream and
    // hard duck can fire the instant the player is caught, not on the next
    // monster-state transition.
    this.unsubscribeCaught = this.hooks.onCaught?.(() => this.playCaughtSting()) ?? null;
  }

  /**
   * Call this after a user gesture to unlock Web Audio.
   */
  unlock(): void {
    if (this.listener.context.state === 'suspended') {
      void this.listener.context.resume();
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;

    if (!value) {
      this.voices.forEach((voice) => {
        if (voice.audio.isPlaying) {
          voice.audio.pause();
        }
      });
    }
  }

  setMonsterState(next: MonsterState): void {
    if (next === this.state) return;

    const previous = this.state;
    this.state = next;

    if (next === 'chasing') {
      // "It sees you" — the signature Granny/Kamla jump-scare moment: a roar,
      // a sharp non-positional stinger, and the ambience bed ducking under it.
      this.oneShot('roar_detect', 1);
      this.oneShot('sting_detect', 1);
      this.bus.duck(0.12, 0.2, 1.6);
    } else if (next === 'searching') {
      this.oneShot('roar_detect', 0.5);

      // Coming down from a chase reads as relief/dread rather than alarm —
      // a different, quieter cue, not just the same roar at half volume.
      if (previous === 'chasing') {
        this.oneShot('sting_lost', 0.8);
      }
    }

    this.stateGain = next === 'lost' ? 0.3 : 1;
  }

  /** Full-volume scream + hard duck + silenced footsteps. Fires once on capture. */
  private playCaughtSting(): void {
    this.oneShot('sting_caught', 1);
    this.bus.duck(0.05, 0.3, 2.5);

    this.voices.forEach((voice) => {
      if (voice.audio.isPlaying) voice.audio.stop();
      voice.level = 0;
      voice.started = false;
    });
  }

  update(deltaTime: number): void {
    if (!this.enabled) return;

    this.hooks
      .getMonsterObject()
      .getWorldPosition(this.monsterPos);

    // Read the player's current world position.
    this.playerPos.copy(
      this.hooks.getPlayerPosition()
    );

    const distance = this.playerPos.distanceTo(
      this.monsterPos
    );

    this.rayTimer -= deltaTime;

    if (this.rayTimer <= 0) {
      this.rayTimer = RAY_INTERVAL;
      this.occluded = this.checkOccluded();
    }

    const linearProximity = THREE.MathUtils.clamp(
      1 - distance / 22,
      0,
      1
    );

    // Concave curve: stays low while the monster is merely "somewhere in the
    // level", then rises steeply as it genuinely closes in.
    const proximity = Math.pow(
      linearProximity,
      TENSION_CURVE_EXPONENT
    );

    const chase = this.state === 'chasing' ? 1 : 0;

    const targetDanger = THREE.MathUtils.clamp(
      proximity * 0.85 + chase * 0.4,
      0,
      1
    );

    this.danger = THREE.MathUtils.damp(
      this.danger,
      targetDanger,
      2.4,
      deltaTime
    );

    this.driveFootsteps(
      deltaTime,
      distance,
      proximity,
      chase
    );

    this.driveLoops(
      distance,
      proximity,
      chase
    );

    this.driveHeartbeat();
    this.driveReactiveHearing(deltaTime, distance);
    this.applyOcclusion();
    this.commit();
  }

  /** Current overall danger level [0..1], for anything else (e.g. ambience) that wants to react to tension. */
  getDanger(): number {
    return this.danger;
  }

  dispose(): void {
    this.unsubscribeCaught?.();
    this.unsubscribeCaught = null;

    this.voices.forEach((voice) => {
      if (voice.audio.isPlaying) {
        voice.audio.stop();
      }

      voice.audio.disconnect();
      voice.filter?.disconnect();
    });

    this.voices.clear();
  }

  /**
   * If a loud player noise (door, thrown object, sprinting footsteps) just
   * landed near the monster, give it an audible "it heard that" reaction —
   * independent of and slightly ahead of its own AI state transition, so
   * the cue lands the instant the noise does.
   */
  private driveReactiveHearing(deltaTime: number, distance: number): void {
    if (!this.soundEvents) return;

    this.reactiveCooldown -= deltaTime;
    if (this.reactiveCooldown > 0) return;

    // Already mid-chase: the chase stinger already covers this moment.
    if (this.state === 'chasing') return;

    const heard = this.soundEvents.loudestNear(
      this.monsterPos,
      REACTIVE_HEARING_RADIUS,
      performance.now() / 1000
    );

    if (!heard || heard.effectiveLoudness < 0.45) return;

    this.reactiveCooldown = REACTIVE_COOLDOWN;

    const scale = THREE.MathUtils.clamp(heard.effectiveLoudness, 0.3, 1);
    this.oneShot('growl_low', scale);

    // Only a genuinely loud, close noise earns its own distinct alert sting —
    // avoids spamming a jump-scare cue for every footstep.
    if (heard.effectiveLoudness > 0.75 && distance > 6) {
      this.oneShot('sting_lost', scale * 0.6);
    }
  }

  private driveFootsteps(
    deltaTime: number,
    distance: number,
    proximity: number,
    chase: number
  ): void {
    const id: SoundId =
      chase > 0.5
        ? 'step_monster_chase'
        : distance < 7
          ? 'step_monster_near'
          : 'step_monster_far';

    const voice = this.voice(id);

    if (!voice) return;

    voice.level = proximity * (
      chase > 0.5 ? 1 : 0.55
    );

    voice.nextFire -= deltaTime;

    if (
      voice.nextFire <= 0 &&
      voice.level > 0.04
    ) {
      const cadence =
        this.bank.def(id).cadence ?? [0.6, 0.9];

      voice.nextFire = THREE.MathUtils.randFloat(
        cadence[0],
        cadence[1]
      );

      this.oneShot(
        id,
        chase > 0.5 ? 1 : 0.8
      );
    }
  }

  private driveLoops(
    distance: number,
    proximity: number,
    chase: number
  ): void {
    const hiding = this.hooks.isPlayerHiding();

    this.set(
      'breath_close',
      proximity * 0.8
    );

    this.set(
      'breath_heavy',
      distance < 5
        ? 0.95
        : distance < 9
          ? 0.45
          : 0
    );

    this.set(
      'growl_low',
      proximity * (
        this.state === 'searching' ? 0.9 : 0.6
      )
    );

    this.set(
      'growl_aggressive',
      chase * 0.95
    );

    this.set(
      'scratch_loop',
      hiding && distance < 4.5 ? 0.9 : 0
    );

    this.set(
      'sniff_loop',
      hiding && distance < 3 ? 1 : 0
    );

    // A faint, uncanny whisper that only ever surfaces when it's right on
    // top of you — distinct from growl/breath, reserved for the closest,
    // most dreadful range so it reads as "something else" rather than more
    // of the same monster noise.
    this.set(
      'whisper_close',
      proximity > 0.72 ? (proximity - 0.72) / 0.28 : 0
    );
  }

  private driveHeartbeat(): void {
    const voice = this.voice('heartbeat');

    if (!voice) return;

    voice.level = THREE.MathUtils.clamp(
      this.danger * 1.15 - 0.08,
      0,
      1
    );

    if (voice.audio.isPlaying) {
      voice.audio.setPlaybackRate(
        0.85 + this.danger * 0.7
      );
    }
  }

  private applyOcclusion(): void {
    const frequency = this.occluded
      ? OCCLUDED_HZ
      : OPEN_HZ;

    const now = this.listener.context.currentTime;

    this.voices.forEach((voice) => {
      voice.filter?.frequency.setTargetAtTime(
        frequency,
        now,
        0.18
      );
    });
  }

  private commit(): void {
    const now = this.listener.context.currentTime;

    this.voices.forEach((voice, id) => {
      const definition = this.bank.def(id);

      if (!definition.loop) return;

      const volume =
        voice.level *
        definition.baseVolume *
        this.stateGain *
        (this.occluded ? 0.45 : 1);

      // THREE.Audio.gain is a GainNode.
      // Its AudioParam is gain.gain.
      voice.audio.gain.gain.setTargetAtTime(
        volume,
        now,
        0.22
      );

      if (
        volume > 0.012 &&
        !voice.started
      ) {
        this.startLoop(id);
      }
    });
  }

  private set(
    id: SoundId,
    level: number
  ): void {
    const voice = this.voice(id);

    if (voice) {
      voice.level = level;
    }
  }

  private oneShot(
    id: SoundId,
    scale = 1
  ): void {
    if (!this.bank.has(id)) {
      this.playFallbackSting(id, scale);
      return;
    }

    const voice = this.voice(id);

    if (!voice) return;

    voice.audio.setVolume(
      this.bank.def(id).baseVolume *
      scale *
      (this.occluded ? 0.5 : 1)
    );

    if (voice.audio.isPlaying) {
      voice.audio.stop();
    }

    voice.audio.play();
  }

  /** Synthesizes a stand-in sting when the real asset for `id` failed to load, so key cues are never silent. */
  private playFallbackSting(id: SoundId, scale: number): void {
    if (!this.fallback) return;

    const kind =
      id === 'sting_caught' ? 'caught' :
      id === 'sting_detect' || id === 'roar_detect' ? 'detect' :
      id === 'sting_lost' ? 'lost' :
      null;

    if (!kind) return;

    this.fallback.playSting(
      this.bus.sfx,
      kind,
      scale * (this.occluded ? 0.5 : 1)
    );
  }

  private startLoop(id: SoundId): void {
    const voice = this.voice(id);

    if (
      !voice ||
      !this.bank.has(id) ||
      voice.started
    ) {
      return;
    }

    voice.audio.setVolume(0);
    voice.audio.play();

    voice.started = true;
  }

  private voice(id: SoundId): Voice | null {
    const existing = this.voices.get(id);

    if (existing) return existing;

    const buffer = this.bank.get(id);

    if (!buffer) return null;

    const definition = this.bank.def(id);

    /*
     * PositionalAudio uses PannerNode as its output type,
     * whereas THREE.Audio uses GainNode.
     *
     * The internal voice uses THREE.Audio's common API.
     * The runtime object remains PositionalAudio when needed.
     */
    const audio = (
      definition.positional
        ? new THREE.PositionalAudio(this.listener)
        : new THREE.Audio(this.listener)
    ) as unknown as THREE.Audio;

    audio.setBuffer(buffer);
    audio.setLoop(definition.loop);

    if (definition.positional) {
      const positional = audio as unknown as THREE.PositionalAudio;

      positional.setRefDistance(
        definition.refDistance ?? 2
      );

      positional.setMaxDistance(
        definition.maxDistance ?? 20
      );

      positional.setRolloffFactor(
        definition.rolloff ?? 1.5
      );

      positional.panner.panningModel = 'HRTF';
    }

    let filter: BiquadFilterNode | null = null;

    // Audio.setFilter is guarded for Three.js compatibility.
    if (typeof audio.setFilter === 'function') {
      filter = this.listener.context.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.value = OPEN_HZ;

      audio.setFilter(filter);
    }

    this.bus.attach(audio, 'sfx');

    if (definition.positional) {
      this.hooks.getMonsterObject().add(audio);
      audio.position.set(0, 1.2, 0);
    }

    const voice: Voice = {
      audio,
      filter,
      level: 0,
      started: false,
      nextFire: 0
    };

    this.voices.set(id, voice);

    return voice;
  }

  private checkOccluded(): boolean {
    const direction = this.monsterPos
      .clone()
      .sub(this.playerPos);

    const distance = direction.length();

    if (distance < 1.2) return false;

    this.raycaster.set(
      this.playerPos,
      direction.normalize()
    );

    this.raycaster.far = distance;

    const hits = this.raycaster.intersectObjects(
      this.hooks.getOccluders(),
      true
    );

    return (
      hits.length > 0 &&
      hits[0].distance < distance - 0.4
    );
  }
}
