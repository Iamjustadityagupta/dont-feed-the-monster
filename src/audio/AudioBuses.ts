
import * as THREE from 'three';

const STORAGE_KEY = 'dfm.audio.settings.v1';

export type Channel = 'master' | 'music' | 'sfx';

export class AudioBuses {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;

  private readonly levels: Record<Channel, number> = {
    master: 0.85,
    music: 0.55,
    sfx: 1.0
  };

  constructor(
    private readonly listener: THREE.AudioListener
  ) {
    const context = listener.context;

    this.master = context.createGain();
    this.master.connect(listener.getInput());

    this.music = context.createGain();
    this.music.connect(this.master);

    this.sfx = context.createGain();
    this.sfx.connect(this.master);

    (['master', 'music', 'sfx'] as Channel[]).forEach(
      channel => this.apply(channel)
    );

    this.restore();
  }

  /**
   * Sidechain-style duck: briefly pulls the music/ambience bed down so a
   * jump-scare stinger (detection roar, caught scream) cuts through, then
   * eases back up. sfx is left alone so the stinger itself stays full volume.
   */
  duck(
    amount = 0.12,
    holdSeconds = 0.15,
    releaseSeconds = 1.4
  ): void {
    const now = this.listener.context.currentTime;
    const gain = this.music.gain;
    const current = this.levels.music;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(
      current * amount,
      now + 0.05
    );
    gain.setTargetAtTime(
      current,
      now + 0.05 + holdSeconds,
      releaseSeconds
    );
  }

  set(channel: Channel, value: number): void {
    this.levels[channel] = THREE.MathUtils.clamp(
      value,
      0,
      1
    );

    this.apply(channel);
    this.persist();
  }

  get(channel: Channel): number {
    return this.levels[channel];
  }

  /**
   * Routes THREE.Audio and THREE.PositionalAudio
   * through the selected bus.
   */
  attach(
    audio: { gain: GainNode },
    channel: Exclude<Channel, 'master'>
  ): void {
    const output = audio.gain;

    try {
      output.disconnect();
    } catch {
      // Output may not have been connected yet.
    }

    output.connect(
      channel === 'music'
        ? this.music
        : this.sfx
    );
  }

  private apply(channel: Channel): void {
    const node =
      channel === 'master'
        ? this.master
        : channel === 'music'
          ? this.music
          : this.sfx;

    node.gain.setTargetAtTime(
      this.levels[channel],
      this.listener.context.currentTime,
      0.08
    );
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.levels)
      );
    } catch {
      // Storage may be unavailable.
    }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<
        Record<Channel, number>
      >;

      (['master', 'music', 'sfx'] as Channel[]).forEach(
        channel => {
          const value = parsed[channel];

          if (
            typeof value === 'number' &&
            Number.isFinite(value)
          ) {
            this.levels[channel] = THREE.MathUtils.clamp(
              value,
              0,
              1
            );

            this.apply(channel);
          }
        }
      );
    } catch {
      // Ignore invalid saved settings.
    }
  }

  dispose(): void {
    this.music.disconnect();
    this.sfx.disconnect();
    this.master.disconnect();
  }
}
