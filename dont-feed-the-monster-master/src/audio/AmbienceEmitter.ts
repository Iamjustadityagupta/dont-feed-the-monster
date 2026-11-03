
import * as THREE from 'three';

import { AudioBuses } from './AudioBuses';
import { SoundBank } from './SoundManifest';
import type { SoundId } from './SoundManifest';

export class AmbienceEmitter {
  private roomTone: THREE.Audio | null = null;

  private readonly emitters: THREE.PositionalAudio[] = [];

  private readonly timers = new Map<SoundId, number>();

  private readonly cleanupTimers = new Set<number>();

  private started = false;
  private disposed = false;

  /** [0..1] external tension level (typically HorrorAudioDirector's danger). Shrinks creak/impact cadence as it rises. */
  private tension = 0;

  constructor(
    private readonly listener: THREE.AudioListener,
    private readonly bus: AudioBuses,
    private readonly bank: SoundBank,
    private readonly oneShots: readonly SoundId[] = [
      'sfx_metal_creak',
      'sfx_distant_impact',
      'sfx_door_slam'
    ]
  ) {
    const tone = this.bank.get('amb_room_tone');

    if (tone) {
      const audio = new THREE.Audio(this.listener);

      audio.setBuffer(tone);
      audio.setLoop(true);
      audio.setVolume(
        this.bank.def('amb_room_tone').baseVolume
      );

      this.bus.attach(audio, 'music');
      this.roomTone = audio;
    }

    this.oneShots.forEach(id => {
      const cadence =
        this.bank.def(id).cadence ?? [10, 20];

      this.timers.set(
        id,
        THREE.MathUtils.randFloat(
          cadence[0],
          cadence[1]
        )
      );
    });
  }

  /**
   * Feeds in the current danger/tension level (e.g. HorrorAudioDirector's
   * `getDanger()`) so random one-shot ambience (creaks, distant impacts)
   * fires more often the closer the threat gets — the facility itself
   * starts to feel like it's closing in, distinct from the monster's own
   * footsteps/growls.
   */
  setTension(level: number): void {
    this.tension = THREE.MathUtils.clamp(level, 0, 1);
  }

  addVent(position: THREE.Vector3): void {
    this.addLoop('amb_vent', position);
  }

  addElectrical(position: THREE.Vector3): void {
    this.addLoop('amb_electrical', position);
  }

  start(): void {
    if (this.started || this.disposed) return;

    this.started = true;

    if (this.roomTone && !this.roomTone.isPlaying) {
      this.roomTone.play();
    }

    this.emitters.forEach(emitter => {
      if (!emitter.isPlaying) {
        emitter.play();
      }
    });
  }

  update(dt: number): void {
    if (!this.started || this.disposed) return;

    // Higher tension eats the countdown faster and shortens the next
    // cadence roll, so creaks/impacts crowd in as the threat closes.
    const urgency = 1 + this.tension * 1.8;
    const cadenceScale = 1 - this.tension * 0.55;

    this.oneShots.forEach(id => {
      const left = (this.timers.get(id) ?? 0) - dt * urgency;

      if (left > 0) {
        this.timers.set(id, left);
        return;
      }

      const cadence =
        this.bank.def(id).cadence ?? [10, 20];

      this.timers.set(
        id,
        THREE.MathUtils.randFloat(
          cadence[0] * cadenceScale,
          cadence[1] * cadenceScale
        )
      );

      this.fire(id);
    });
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.started = false;

    if (this.roomTone?.isPlaying) {
      this.roomTone.stop();
    }

    this.roomTone?.disconnect();
    this.roomTone = null;

    this.emitters.forEach(emitter => {
      if (emitter.isPlaying) {
        emitter.stop();
      }

      emitter.disconnect();
      emitter.removeFromParent();
    });

    this.emitters.length = 0;

    this.cleanupTimers.forEach(timer => {
      window.clearTimeout(timer);
    });

    this.cleanupTimers.clear();
    this.timers.clear();
  }

  private fire(id: SoundId): void {
    const buffer = this.bank.get(id);

    if (!buffer || this.disposed) return;

    const def = this.bank.def(id);

    const audio = new THREE.PositionalAudio(
      this.listener
    );

    audio.setBuffer(buffer);
    audio.setRefDistance(def.refDistance ?? 5);
    audio.setRolloffFactor(1.2);
    audio.setVolume(def.baseVolume);

    audio.position.set(
      THREE.MathUtils.randFloatSpread(26),
      THREE.MathUtils.randFloat(0.4, 5),
      THREE.MathUtils.randFloatSpread(26)
    );

    this.bus.attach(audio, 'sfx');

    audio.play();

    const cleanup = (): void => {
      audio.disconnect();
      audio.removeFromParent();
      this.cleanupTimers.delete(timer);
    };

    const timer = window.setTimeout(
      cleanup,
      buffer.duration * 1000 + 250
    );

    this.cleanupTimers.add(timer);
  }

  private addLoop(
    id: SoundId,
    position: THREE.Vector3
  ): void {
    if (this.disposed) return;

    const buffer = this.bank.get(id);

    if (!buffer) return;

    const def = this.bank.def(id);

    const audio = new THREE.PositionalAudio(
      this.listener
    );

    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setRefDistance(def.refDistance ?? 2);
    audio.setRolloffFactor(1.5);
    audio.setVolume(def.baseVolume);
    audio.position.copy(position);

    this.bus.attach(audio, 'sfx');

    this.emitters.push(audio);

    if (this.started) {
      audio.play();
    }
  }
}
