import { DisposableGroup, type Disposable } from '../core/Disposable';
import { Logger } from '../core/Logger';

export type ProceduralStingKind = 'detect' | 'lost' | 'caught' | 'alert';

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/**
 * Procedural horror-sting synthesizer. No audio assets required: everything
 * here is oscillators + filtered noise generated on the fly.
 *
 * This exists as a safety net for HorrorAudioDirector. Real sound design
 * (SoundManifest + SoundBank) is always preferred when the .ogg asset loads;
 * this only fires for a SoundId when SoundBank reports it missing, so a
 * project with incomplete audio assets still gets a real jump-scare instead
 * of silence. It renders straight into whatever AudioNode it's given (a
 * bus GainNode from AudioBuses), so it rides the same volume/mute controls
 * as every other sound.
 */
export class ProceduralHorrorSynth implements Disposable {
  private readonly log = new Logger({ namespace: 'audio-fallback' });
  private readonly group = new DisposableGroup();
  private noiseBufferCache: AudioBuffer | null = null;

  constructor(private readonly context: AudioContext) {}

  /** One-shot stinger: detuned descending tones + a filtered noise burst. */
  playSting(
    destination: AudioNode,
    kind: ProceduralStingKind,
    intensity = 1
  ): void {
    try {
      const now = this.context.currentTime;
      const amount = clamp01(intensity);

      const duration =
        kind === 'caught' ? 1.5 : kind === 'detect' ? 0.9 : kind === 'alert' ? 0.5 : 0.7;

      const peak = Math.max(0.08, 0.85 * amount);

      const master = this.context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(peak, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      master.connect(destination);

      const voices = this.voicesFor(kind);

      voices.forEach(({ type, freq, dropTo }) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, freq * dropTo),
          now + duration
        );

        gain.gain.value = 1 / voices.length;

        osc.connect(gain);
        gain.connect(master);

        osc.start(now);
        osc.stop(now + duration + 0.05);
      });

      const noise = this.context.createBufferSource();
      noise.buffer = this.noiseBuffer(duration);

      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = kind === 'caught' ? 2600 : kind === 'detect' ? 1400 : 700;
      noiseFilter.Q.value = 0.8;

      const noiseGain = this.context.createGain();
      noiseGain.gain.value = 0.5;

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      noise.start(now);
      noise.stop(now + duration);
    } catch (error) {
      this.log.warnOnce('sting-failed', 'procedural sting failed', { error });
    }
  }

  private voicesFor(
    kind: ProceduralStingKind
  ): { type: OscillatorType; freq: number; dropTo: number }[] {
    switch (kind) {
      case 'caught':
        return [
          { type: 'sawtooth', freq: 180, dropTo: 0.25 },
          { type: 'sine', freq: 90, dropTo: 0.3 },
          { type: 'square', freq: 55, dropTo: 0.4 },
        ];
      case 'detect':
        return [
          { type: 'sawtooth', freq: 140, dropTo: 0.55 },
          { type: 'sine', freq: 70, dropTo: 0.6 },
        ];
      case 'lost':
        return [{ type: 'sine', freq: 110, dropTo: 0.8 }];
      case 'alert':
      default:
        return [{ type: 'triangle', freq: 160, dropTo: 0.7 }];
    }
  }

  private noiseBuffer(duration: number): AudioBuffer {
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));

    // Reuse the largest buffer generated so far (a BufferSourceNode's own
    // .stop() call already truncates playback to `duration` regardless of
    // the underlying buffer's length, and the same AudioBuffer can safely
    // back multiple concurrent BufferSourceNodes).
    if (!this.noiseBufferCache || this.noiseBufferCache.length < length) {
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBufferCache = buffer;
      return buffer;
    }

    return this.noiseBufferCache;
  }

  dispose(): void {
    this.group.dispose();
  }
}
